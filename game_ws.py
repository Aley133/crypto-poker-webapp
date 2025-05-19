# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

MIN_PLAYERS = 2
MAX_PLAYERS = 6


async def broadcast(table_id: int):
    """
    Шлёт всем клиентам текущее состояние игры в JSON.
    """
    state = game_states.get(table_id)
    if not state:
        return

    payload = state.copy()
    # Формируем упрощённый список игроков
    players = state.get("players", [])
    usernames = state.get("usernames", {})

    payload["players"] = [
        {"user_id": uid, "username": usernames.get(uid, str(uid))}
        for uid in players
    ]
    payload["players_count"] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            # если кто-то отключился неожиданно
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # 1) Принимаем соединение
    await websocket.accept()

    # 2) Гарантируем, что есть начальный state
    if table_id not in game_states:
        game_states[table_id] = {
            "started": False,
            "players": [],
            "usernames": {}
        }

    # 3) Читаем user_id и username из query
    uid_str  = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid       = str(uid_str)

    # Сохраняем username
    game_states[table_id].setdefault("usernames", {})[uid] = username

    # 4) Регистрируем WebSocket
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        # Если стол полон
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # 5) Обновляем список сидящих по seat_map
    game_states[table_id]["players"] = [str(u) for u in seat_map.get(table_id, [])]

    # 6) Если нас стало ровно MIN_PLAYERS — стартуем руку
    if len(conns) == MIN_PLAYERS and not game_states[table_id]["started"]:
        start_hand(table_id)
        game_states[table_id]["started"] = True

    # 7) Первый broadcast (ожидание или сразу старт)
    await broadcast(table_id)

    try:
        # 8) Цикл: приём ходов и рассылка обновлений
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            # Парсим параметры
            player_id = str(msg.get("user_id"))
            action    = msg.get("action", "")
            amount    = int(msg.get("amount", 0) or 0)

            # Применяем ход и рассылаем новый state
            apply_action(table_id, player_id, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 9) При отключении убираем ws
        if websocket in conns:
            conns.remove(websocket)
        # Если игроков стало слишком мало — сбрасываем стейт
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    Для отладки: вернуть raw state по HTTP GET.
    """
    return game_states.get(table_id, {}) or {}
