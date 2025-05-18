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

    payload = state.copy()
    usernames = state.get("usernames", {})

    raw_ids = seat_map.get(table_id, [])
    players = []
    for pid_str in raw_ids:
        try:
            pid = int(pid_str)
        except ValueError:
            pid = pid_str
        players.append({
            "user_id": pid_str,            # фронту как строка
            "username": usernames.get(pid, pid_str)
        })

    payload["players"]       = players
    payload["players_count"] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass


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
            msg = json.loads(data)

            # apply_action ожидает int-пользователя и сумму
            apply_action(
                table_id,
                int(msg.get("user_id", -1)),
                msg.get("action"),
                int(msg.get("amount", 0))
            )
            await broadcast(table_id)

     except WebSocketDisconnect:
        # Убираем это соединение из списка
        if websocket in connections.get(table_id, []):
            connections[table_id].remove(websocket)
        # Если стало меньше игроков, сбрасываем только поля текущей раздачи
        if len(connections.get(table_id, [])) < MIN_PLAYERS:
            # Сохраняем мапу username, удаляем всё остальное
            saved_usernames = game_states[table_id].get("usernames", {})
            game_states[table_id].clear()
            game_states[table_id]["usernames"] = saved_usernames
        # Оповещаем оставшихся (или возвращаем их в лобби)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
