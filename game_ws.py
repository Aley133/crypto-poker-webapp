# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
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

    for ws in connections.get(table_id, []):
        await ws.send_json(payload)


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Отклоняем, если стейт не создан
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Сохраняем username
    uid = websocket.query_params.get("user_id")
    uname = websocket.query_params.get("username", uid)
    game_states[table_id].setdefault("usernames", {})[uid] = uname

    # Регистрация соединения
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Запуск или ожидание
    if len(conns) >= MIN_PLAYERS and not game_states[table_id].get("started", False):
        start_hand(table_id)
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)
            apply_action(
                table_id,
                msg.get("user_id"),
                msg.get("action"),
                int(msg.get("amount", 0))
            )
            await broadcast(table_id)
    except WebSocketDisconnect:
        conns.remove(websocket)
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
