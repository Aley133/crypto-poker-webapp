# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

# Минимальное и максимальное число игроков для старта и джойна
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    """
    Отправляет текущее состояние игры всем подключённым WS-клиентам.
    Добавляет динамическое поле players_count по числу соединений.
    """
    state = game_states.get(table_id)
    if state is None:
        return
    # Составляем полезную нагрузку с копией состояния
    payload = state.copy()
    # Динамическое поле: текущее число подключённых игроков
    payload["players_count"] = len(connections.get(table_id, []))
    for ws in connections.get(table_id, []):
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

    # Список WS для данного стола
    conns = connections.setdefault(table_id, [])
    # Ограничение на максимальное число игроков
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)  # Try again later
        return

    # Регистрируем нового клиента
    conns.append(websocket)
    # Если игроков стало меньше минимума — сбрасываем флаг started
    if len(conns) < MIN_PLAYERS:
        game_states[table_id].pop("started", None)
    # Оповещаем всех о текущем состоянии (ожидание или игра)
    await broadcast(table_id)

    # Как только достигнут минимум — стартуем игру один раз
    if len(conns) >= MIN_PLAYERS and not game_states[table_id].get("started", False):
        start_hand(table_id)
        game_states[table_id]["started"] = True
        await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            apply_action(
                table_id,
                int(msg.get("user_id", -1)),
                msg.get("action"),
                int(msg.get("amount", 0))
            )
            await broadcast(table_id)
    except WebSocketDisconnect:
        # Убираем соединение при дисконнекте
        conns.remove(websocket)
        # Если стало меньше игроков — сбрасываем started и оповещаем
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].pop("started", None)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {}) or {}
