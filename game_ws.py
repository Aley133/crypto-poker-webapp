# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()

# Минимальное число игроков для старта и максимальных WS-подключений
MIN_PLAYERS = 2
MAX_CONNECTIONS = 6

async def broadcast(table_id: int):
    """
    Отправляем состояние игры всем подключённым WS.
    Используем seat_map для подсчёта игроков.
    """
    state = game_states.get(table_id)
    if state is None:
        return
    # Копируем, чтобы не менять оригинал
    payload = state.copy()
    payload['players_count'] = len(seat_map.get(table_id, []))
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}/{user_id}")
async def ws_game(websocket: WebSocket, table_id: int, user_id: str):
    # Проверяем, что пользователь действительно в seat_map
    if user_id not in seat_map.get(table_id, []):
        await websocket.close(code=1008)
        return

    conns = connections.setdefault(table_id, [])
    # Ограничиваем WS-подключения
    if len(conns) >= MAX_CONNECTIONS:
        await websocket.close(code=1013)
        return

    # Принимаем WS
    await websocket.accept()
    conns.append(websocket)

    # Сразу рассылаем текущее состояние (ожидание или уже старт)
    await broadcast(table_id)

    # Стартуем при достижении MIN_PLAYERS и флаге start = False
    if len(seat_map.get(table_id, [])) >= MIN_PLAYERS and not game_states[table_id].get('started', False):
        start_hand(table_id)
        game_states[table_id]['started'] = True
        await broadcast(table_id)

    try:
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)
            apply_action(
                table_id,
                user_id,
                data.get('action'),
                int(data.get('amount', 0))
            )
            await broadcast(table_id)
    except WebSocketDisconnect:
        # При отключении убираем WS, но не трогаем seat_map
        if websocket in conns:
            conns.remove(websocket)
        # Если после дисконнекта игроков стало меньше минимума, сбрасываем "started"
        if len(seat_map.get(table_id, [])) < MIN_PLAYERS:
            game_states.get(table_id, {}).pop('started', None)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
