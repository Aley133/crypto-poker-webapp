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
    Рассылает текущее состояние стола всем подключённым клиентам.
    """
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
            # Игнорируем ошибки отправки
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Если стейт не инициализирован, отклоняем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Чтение параметров user_id и username
    user_id_str = websocket.query_params.get('user_id')
    username    = websocket.query_params.get('username', user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        user_id = None

    if user_id is not None:
        game_states[table_id].setdefault('usernames', {})[user_id] = username

    # Регистрируем WebSocket
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        # При подключении рассылаем стартовое состояние или запускаем игру
        cnt = len(conns)
        if cnt < MIN_PLAYERS:
            await broadcast(table_id)
        else:
            if not game_states[table_id].get('started', False):
                start_hand(table_id)
            await broadcast(table_id)

        # Цикл обработки ходов
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)

            # Извлекаем параметры
            uid    = int(msg.get('user_id', -1))
            action = msg.get('action')
            amount = int(msg.get('amount', 0))

            # Логируем приходящую команду
            print(f"← WS Message: table={table_id}, uid={uid}, action={action}, amount={amount}")

            # Выполняем ход
            apply_action(table_id, uid, action, amount)

            # Логируем факт применения
            print(f"→ apply_action done: table={table_id}, uid={uid}, action={action}, amount={amount}")

            # Рассылаем всем новое состояние
            await broadcast(table_id)

    except WebSocketDisconnect:
        # При отключении клиента убираем из списка
        if websocket in conns:
            conns.remove(websocket)

        # Если игроков стало меньше MIN_PLAYERS — сбрасываем состояние
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()

        # Оповещаем остальных
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP-эндпоинт для просмотра состояния стола (для отладки).
    """
    return game_states.get(table_id, {}) or {}
