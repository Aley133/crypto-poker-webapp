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
    usernames = state.get('usernames', {})
    player_ids = seat_map.get(table_id, [])
    players = []
    for pid in player_ids:
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
    print(f"+++ Client connected: table={table_id}")

    # Отклоняем, если нет state
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Читаем user_id / username
    uid_str = websocket.query_params.get('user_id')
    uname   = websocket.query_params.get('username', uid_str)
    try:
        uid = int(uid_str)
    except:
        uid = None
    if uid is not None:
        game_states[table_id].setdefault('usernames', {})[uid] = uname

    # Регистрируем WS
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        # При подключении шлём стартовое состояние или стартуем игру
        if len(conns) < MIN_PLAYERS:
            print("→ waiting for players")
            await broadcast(table_id)
        else:
            print("→ starting hand")
            if not game_states[table_id].get('started', False):
                start_hand(table_id)
                print("→ start_hand done, state:", game_states[table_id])
            print("→ broadcasting initial state")
            await broadcast(table_id)

        # Цикл получения ходов
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            # Извлекаем параметры
            player_id = int(msg.get('user_id', -1))
            action    = msg.get('action')
            amount    = int(msg.get('amount', 0))

            # Логи для отладки
            print(f"← WS Message: table={table_id}, uid={player_id}, action={action}, amount={amount}")

            # Применяем ход
            apply_action(table_id, player_id, action, amount)

            print(f"→ apply_action done: table={table_id}, uid={player_id}, action={action}, amount={amount}")

            # Шлём всем обновлённый state
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем соединение
        if websocket in conns:
            conns.remove(websocket)
        # Если игроков стало < MIN_PLAYERS, сбрасываем state
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
