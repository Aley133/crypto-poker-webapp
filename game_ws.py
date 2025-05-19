# --- game_ws.py ---
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
    usernames = state.get('usernames', {})
    players_list = seat_map.get(table_id, [])
    players = []
    for pid in players_list:
        try:
            uid = int(pid)
        except ValueError:
            uid = pid
        name = usernames.get(uid, str(pid))
        players.append({'user_id': pid, 'username': name})
    payload['players'] = players
    payload['players_count'] = len(connections.get(table_id, []))
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    if table_id not in game_states:
        await websocket.close(code=1008)
        return
    # Парсим user_id и username
    uid_str = websocket.query_params.get('user_id')
    username = websocket.query_params.get('username', uid_str)
    try:
        uid = int(uid_str)
    except:
        uid = None
    if uid is not None:
        game_states[table_id].setdefault('usernames', {})[uid] = username
    # Регистрируем WS
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        cnt = len(conns)
        if cnt < MIN_PLAYERS:
            await broadcast(table_id)
        else:
            # Если игра ещё не стартовала, запускаем раздачу
            if not game_states[table_id].get('started', False):
                start_hand(table_id)
            await broadcast(table_id)
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            apply_action(
                table_id,
                int(msg.get('user_id', -1)),
                msg.get('action'),
                int(msg.get('amount', 0))
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
