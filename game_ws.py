from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if state is None:
        return

    # Подготавливаем данные для клиента
    payload = state.copy()
    # Убираем неJSON-поля
    payload.pop('deck', None)
    if 'folded' in payload:
        payload['folded'] = list(payload['folded'])

    usernames = state.get('usernames', {})
    raw_ids = seat_map.get(table_id, [])
    players = []
    for pid_str in raw_ids:
        try:
            pid = int(pid_str)
        except ValueError:
            pid = pid_str
        name = usernames.get(pid, pid_str)
        # Передаём user_id как число, чтобы в UI индексация работала
        players.append({'user_id': pid, 'username': name})

    payload['players'] = players
    payload['players_count'] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except Exception:
            pass

@router.websocket('/ws/game/{table_id}')
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Если стола нет, отклоняем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Регистрируем username
    user_id_str = websocket.query_params.get('user_id')
    username = websocket.query_params.get('username', user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        user_id = None
    if user_id is not None:
        game_states[table_id].setdefault('usernames', {})[user_id] = username

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Лог соединения
    print(f"[ws_game] New connection to table {table_id}. Total WS clients: {len(conns)}; started = {game_states[table_id].get('started')}")

    # Старт раздачи при достижении MIN_PLAYERS
    if len(conns) == MIN_PLAYERS and not game_states[table_id].get('started', False):
        print(f"[ws_game] Starting hand on table {table_id}")
        start_hand(table_id)
        game_states[table_id]['started'] = True

    # Оповещаем всех
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # Обработка синхронизации
            if msg.get('action') == 'sync':
                await broadcast(table_id)
                continue

            # Обычные действия
            uid = int(msg.get('user_id', -1))
            action = msg.get('action')
            amount = int(msg.get('amount', 0))
            apply_action(table_id, uid, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем соединение
        conns = connections.get(table_id, [])
        if websocket in conns:
            conns.remove(websocket)

        # При недостатке игроков сбрасываем текущую раздачу
        if len(conns) < MIN_PLAYERS:
            saved = game_states[table_id].get('usernames', {})
            game_states[table_id].clear()
            game_states[table_id]['usernames'] = saved

        # Оповещаем оставшихся
        await broadcast(table_id)

@router.get('/api/game_state')
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
