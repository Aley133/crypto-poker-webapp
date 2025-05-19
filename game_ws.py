# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import (
    game_states,
    connections,
    start_hand,
    apply_action,
)

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    payload = state.copy()
    players  = state["players"]
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
    await websocket.accept()

    # Гарантируем начальное состояние
    if table_id not in game_states:
        game_states[table_id] = {"started": False, "usernames": {}, "players": []}

    # Параметры
    uid_str  = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid      = str(uid_str)
    game_states[table_id].setdefault("usernames", {})[uid] = username

    # Регистрируем WS
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Обновляем список игроков
    game_states[table_id]["players"] = [str(u) for u in seat_map.get(table_id, [])]

    # 1) Broadcast ожидание/старт
    await broadcast(table_id)

    # 2) Если теперь достаточный онлайн и не стартовали — стартуем руку
    if len(conns) >= MIN_PLAYERS and not game_states[table_id]["started"]:
        start_hand(table_id)
        game_states[table_id]["started"] = True
        await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            player_id = str(msg.get("user_id"))
            action    = msg.get("action")
            amount    = int(msg.get("amount", 0) or 0)

            apply_action(table_id, player_id, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Отключился клиент
        if websocket in conns:
            conns.remove(websocket)
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
