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
    Рассылает всем клиентам актуальное состояние стола.
    """
    state = game_states.get(table_id)
    if not state:
        return

    payload = state.copy()
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
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # 1) Принимаем WS
    await websocket.accept()

    # 2) Если первый подключившийся, создаём пустое состояние
    if table_id not in game_states:
        game_states[table_id] = {
            "started": False,
            "usernames": {},
            "players": []
        }

    # 3) Читаем user_id и username
    uid_str  = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid       = str(uid_str)
    game_states[table_id].setdefault("usernames", {})[uid] = username

    # 4) Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # 5) Обновляем список игроков в state (в порядке seat_map)
    game_states[table_id]["players"] = [str(u) for u in seat_map.get(table_id, [])]

    # 6) Если после этого набралось достаточно игроков и мы ещё не стартовали — стартуем раздачу
    if len(conns) >= MIN_PLAYERS and not game_states[table_id].get("started", False):
        start_hand(table_id)
        game_states[table_id]["started"] = True

    # 7) Один общий broadcast — и первому, и второму уйдёт уже либо «ожидаем» (при 1), либо «игра началась» (при 2)
    await broadcast(table_id)

    try:
        # 8) Обработка ходов
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            player_id = str(msg.get("user_id"))
            action    = msg.get("action")
            amount    = int(msg.get("amount", 0) or 0)

            apply_action(table_id, player_id, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 9) Убираем отключившийся сокет
        if websocket in conns:
            conns.remove(websocket)
        # 10) Если игроков стало меньше, сбрасываем state
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """HTTP API для отладки состояния стола."""
    return game_states.get(table_id, {}) or {}
