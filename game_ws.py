# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

# Минимальное и максимальное число игроков для старта и максимальное для подключения
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    """
    Отправляет текущее состояние игры всем подключённым WS-клиентам.
    Добавляет поле players_count по числу активных WS-соединений.
    """
    state = game_states.get(table_id)
    if state is None:
        return
    payload = state.copy()
    # Динамическое поле: текущее число подключённых WS-клиентов
    payload['players_count'] = len(connections.get(table_id, []))
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принимаем соединение
    await websocket.accept()

    # Проверяем, что стол существует
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Получаем список WS-соединений для этого стола
    conns = connections.setdefault(table_id, [])
    # Проверяем ограничение по максимуму
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return

    # Регистрируем нового WS-клиента
    conns.append(websocket)
    try:
        # Сколько активных подключений сейчас
        count_conns = len(conns)
        # Если недостаточно игроков — уведомляем о ожидании
        if count_conns < MIN_PLAYERS:
            await broadcast(table_id)
        # Если набрано достаточно и ещё не начинали — стартуем
        elif not game_states[table_id].get('started', False):
            start_hand(table_id)
            game_states[table_id]['started'] = True
            await broadcast(table_id)
        # Иначе рассылаем текущее состояние
        else:
            await broadcast(table_id)

        # Обработка входящих сообщений
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
        # При отключении удаляем соединение
        if websocket in conns:
            conns.remove(websocket)
        # Если игроков стало меньше минимума — сбрасываем старт
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].pop('started', None)
        # Оповещаем остальных
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {}) or {}
