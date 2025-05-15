# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map

router = APIRouter()

# Минимальное число игроков для старта и максимальное для подключения
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    """
    Отправляет текущее состояние игры всем подключённым WS-клиентам,
    включая динамический players_count по числу игроков в seat_map.
    """
    state = game_states.get(table_id)
    if state is None:
        return
    payload = state.copy()
    # берем число реально присоединившихся через API join
    payload['players_count'] = len(seat_map.get(table_id, []))
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # принимать соединение
    await websocket.accept()
    # проверка существования стола
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Ограничиваем подключение по WebSocket (максимум)
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)  # Try again later
        return

    # регистрируем WS-клиента
    conns.append(websocket)
    # текущее число игроков по API
    count = len(seat_map.get(table_id, []))

    # Если недостаточно игроков — оповестим о ожидании
    if count < MIN_PLAYERS:
        await broadcast(table_id)
    # Если набрали нужное число и ещё не стартовали — стартуем
    elif not game_states[table_id].get('started', False):
        start_hand(table_id)
        game_states[table_id]['started'] = True
        await broadcast(table_id)
    # Иначе просто шлем текущее состояние
    else:
        await broadcast(table_id)

    try:
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
        # удаляем WS при дисконнекте
        if websocket in conns:
            conns.remove(websocket)
        # на отключение не меняем seat_map, т.к. leave пока не реализован
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {}) or {}
