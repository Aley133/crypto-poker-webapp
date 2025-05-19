from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    # Формируем чистый payload
    payload = {
        'started': state.get('started', False),
        'stage': state.get('stage'),
        'pot': state.get('pot', 0),
        'current_bet': state.get('current_bet', 0),
        'community': state.get('community', []),
        'current_player': state.get('current_player'),
        'stacks': state.get('stacks', {}),
        'bets': state.get('bets', {}),
        'hole_cards': state.get('hole_cards', {}),
    }
    # Список игроков с id (int) и username
    usernames = state.get('usernames', {})
    players = []
    for pid_str in seat_map.get(table_id, []):
        try:
            pid = int(pid_str)
        except ValueError:
            pid = pid_str
        players.append({
            'user_id': pid,
            'username': usernames.get(pid, str(pid))
        })
    payload['players'] = players
    payload['players_count'] = len(connections.get(table_id, []))

    # Рассылаем состояние всем WS-клиентам
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except Exception:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Инициализируем state при первом подключении
    if table_id not in game_states:
        game_states[table_id] = {}

    # Регистрация username
    user_id_str = websocket.query_params.get('user_id')
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        user_id = None
    username = websocket.query_params.get('username', user_id_str)
    if user_id is not None:
        game_states[table_id].setdefault('usernames', {})[user_id] = username

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Запускаем раздачу при достаточном числе игроков
    if len(conns) >= MIN_PLAYERS and not game_states[table_id].get('started', False):
        start_hand(table_id)
        game_states[table_id]['started'] = True

    # Отправляем начальное состояние
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # Обработка sync-запроса
            if msg.get('action') == 'sync':
                await broadcast(table_id)
                continue

            # Обычная логика действий
            raw_uid = msg.get('user_id')
            try:
                uid = int(raw_uid)
            except (TypeError, ValueError):
                uid = raw_uid
            action = msg.get('action')
            amount = int(msg.get('amount', 0) or 0)

            apply_action(table_id, uid, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Удаляем соединение
        if websocket in conns:
            conns.remove(websocket)
        # При недостатке игроков сбрасываем раздачу, сохраняем usernames
        if len(conns) < MIN_PLAYERS:
            saved = game_states[table_id].get('usernames', {})
            game_states[table_id].clear()
            game_states[table_id]['usernames'] = saved
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
