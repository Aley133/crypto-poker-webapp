# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

# Минимальное и максимальное число игроков
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if state is None:
        return

    # shallow copy
    payload = state.copy()

    # убираем не-JSON-поля или приводим set→list
    payload.pop("deck", None)
    if "folded" in payload:
        payload["folded"] = list(payload["folded"])

    # players / usernames оставляем как было
    usernames = state.get("usernames", {})
    raw_ids = seat_map.get(table_id, [])
    players = []
    for pid_str in raw_ids:
        try:
            pid = int(pid_str)
        except ValueError:
            pid = pid_str
        name = usernames.get(pid, pid_str)
        players.append({"user_id": pid_str, "username": name})

    payload["players"]       = players
    payload["players_count"] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except Exception as e:
            print("Failed to send JSON:", e)


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принимаем WS
    await websocket.accept()

    # Если стола нет — отклоняем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Парсим user_id и username из query-параметров
    user_id_str = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        # Если не число — просто не сохраняем username-mapping
        user_id = None

    # Регистрируем username в состоянии (если корректный user_id)
    if user_id is not None:
        game_states[table_id].setdefault("usernames", {})[user_id] = username

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        # Стол полон
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        # Логика старта или ожидания
        count_conns = len(conns)
        if count_conns < MIN_PLAYERS:
            await broadcast(table_id)
        elif not game_states[table_id].get("started", False):
            start_hand(table_id)
            game_states[table_id]["started"] = True
            await broadcast(table_id)
        else:
            await broadcast(table_id)

        # Цикл приёма ходов
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            #  ── если это sync-запрос, просто шлём текущее состояние и ждём дальше
            if msg.get("action") == "sync":
                await broadcast(table_id)
                continue

            #  ── иначе это реальный action от игрока
            uid    = int(msg.get("user_id", -1))
            action = msg.get("action")
            amount = int(msg.get("amount", 0))

            apply_action(table_id, uid, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем соединение
        conns = connections.get(table_id, [])
        if websocket in conns:
            conns.remove(websocket)

        # Если игроков стало меньше минимума — сбрасываем только данные раздачи
        if len(conns) < MIN_PLAYERS:
            saved_usernames = game_states[table_id].get("usernames", {})
            game_states[table_id].clear()
            game_states[table_id]["usernames"] = saved_usernames

        # Оповещаем оставшихся
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
