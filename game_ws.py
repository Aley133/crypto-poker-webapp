from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

# Шлёт текущее состояние всем WS-клиентам
async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    # Копируем только JSON-сериализуемые поля
    payload = {k: v for k, v in state.items() if k not in ('deck',)}
    # folded как список
    if 'folded' in state:
        payload['folded'] = list(state['folded'])

    # Добавляем список игроков с именами
    usernames = state.get('usernames', {})
    raw_ids = seat_map.get(table_id, [])
    players = []
    for pid_str in raw_ids:
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

    # Рассылаем всем активным соединениям
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except Exception:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Убедимся, что есть запись стола
    if table_id not in game_states:
        game_states[table_id] = {'usernames': {}}

    # Регистрация username
    user_id_str = websocket.query_params.get('user_id')
    username = websocket.query_params.get('username', user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        user_id = None
    if user_id is not None:
        game_states[table_id].setdefault('usernames', {})[user_id] = username

    # Регистрируем WS-соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # При достижении MIN_PLAYERS — стартуем раздачу один раз
    if len(conns) == MIN_PLAYERS and not game_states[table_id].get('started', False):
        start_hand(table_id)
        game_states[table_id]['started'] = True

    # Оповещаем всех сразу после подключения
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # Синхронизация состояния
            if msg.get('action') == 'sync':
                await broadcast(table_id)
                continue

            # Обычное действие от игрока
            uid = int(msg.get('user_id', -1))
            action = msg.get('action')
            amount = int(msg.get('amount', 0))
            apply_action(table_id, uid, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Удаляем отключившийся сокет
        if websocket in conns:
            conns.remove(websocket)

        # Если стало меньше игроков — сброс только раздачи, но сохраняем usernames
        if len(conns) < MIN_PLAYERS:
            saved = game_states[table_id].get('usernames', {})
            game_states[table_id].clear()
            game_states[table_id]['usernames'] = saved

        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
