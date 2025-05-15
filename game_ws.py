# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()

# Минимальное число игроков для старта и максимальное число WS-подключений
MIN_PLAYERS = 2
MAX_CONNECTIONS = 6

async def broadcast(table_id: int):
    """
    Отправляет текущее состояние игры всем подключённым WS-клиентам.
    Добавляет поле players_count по числу игроков из seat_map.
    """
    state = game_states.get(table_id)
    if state is None:
        return
    payload = state.copy()
    payload['players_count'] = len(seat_map.get(table_id, []))
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}/{user_id}")
async def ws_game(websocket: WebSocket, table_id: int, user_id: str):
    # Проверяем, что пользователь уже нажал JOIN и есть в seat_map
    if user_id not in seat_map.get(table_id, []):
        await websocket.close(code=1008)
        return

    # Ограничиваем общее число WS-подключений
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_CONNECTIONS:
        await websocket.close(code=1013)
        return

    # Принимаем соединение и регистрируем
    await websocket.accept()
    conns.append(websocket)

    # И сразу рассылаем состояние (ожидание или уже старт)
    await broadcast(table_id)
    # Авто-старт при достижении порога JOIN
    if len(seat_map.get(table_id, [])) >= MIN_PLAYERS and not game_states[table_id].get('started', False):
        start_hand(table_id)
        game_states[table_id]['started'] = True
        await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            # Передаём действие в движок
            apply_action(
                table_id,
                user_id,
                msg.get('action'),
                int(msg.get('amount', 0))
            )
            await broadcast(table_id)
    except WebSocketDisconnect:
        # Убираем ws при дисконнекте
        if websocket in conns:
            conns.remove(websocket)
        # При отключении не трогаем seat_map — leave API отвечает за выход
        # Но если игроков стало меньше порога, сбросим флаг start
        if len(seat_map.get(table_id, [])) < MIN_PLAYERS:
            game_states.get(table_id, {}).pop('started', None)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {}) or {}
