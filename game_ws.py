# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    print(f"→ broadcast start: table={table_id}, conns={len(connections.get(table_id, []))}")
    state = game_states.get(table_id)
    if not state:
        print("   no state, return")
        return

    payload = state.copy()
    # Формируем список игроков
    usernames = state.get('usernames', {})
    player_ids = seat_map.get(table_id, [])
    players = []
    for pid in player_ids:
        try:
            uid = int(pid)
        except ValueError:
            uid = pid
        players.append({'user_id': pid, 'username': usernames.get(uid, str(pid))})

    payload['players'] = players
    payload['players_count'] = len(connections.get(table_id, []))

    for ws in list(connections[table_id]):
        try:
            await ws.send_json(payload)
            print(f"   sent to ws {ws!r}")
        except Exception as e:
            print(f"   failed to send to ws {ws!r}: {e!r}")
    print("→ broadcast done")


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    print(f"+++ Client connected: table={table_id}")

    # Отклоняем, если нет state
    if table_id not in game_states:
        print("   no game_states, closing")
        await websocket.close(code=1008)
        return

    # Читаем параметры
    uid_str = websocket.query_params.get('user_id')
    user_name = websocket.query_params.get('username', uid_str)
    try:
        uid = int(uid_str)
    except:
        uid = None

    if uid is not None:
        game_states[table_id].setdefault('usernames', {})[uid] = user_name

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return

    conns.append(websocket)
    print(f"   now {len(conns)} connections")

    # Initial broadcast (or start hand if enough)
    if len(conns) < MIN_PLAYERS:
        print("   waiting for players")
    else:
        if not game_states[table_id].get('started', False):
            print("   starting hand")
            start_hand(table_id)
        else:
            print("   hand already started")
    await broadcast(table_id)

    try:
        # Обработка ходов
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            player_id = str(msg.get('user_id'))
            action    = msg.get('action')
            amount    = int(msg.get('amount', 0))

            print(f"← WS Message: table={table_id}, uid={player_id}, action={action}, amount={amount}")
            apply_action(table_id, player_id, action, amount)
            print(f"→ apply_action done: table={table_id}, uid={player_id}, action={action}, amount={amount}")
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Клиент отключился
        print(f"--- Client disconnected: table={table_id}")
        if websocket in conns:
            conns.remove(websocket)
        # Если игроков стало меньше 2 – сброс state
        if len(conns) < MIN_PLAYERS:
            print("   too few players, clearing state")
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
