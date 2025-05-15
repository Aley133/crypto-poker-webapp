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
    """
    state = game_states.get(table_id)
    if not state:
        return
    for ws in connections.get(table_id, []):
        try:
            await ws.send_json(state)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принять соединение
    await websocket.accept()

    # Проверяем существование стола
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # WS-коннекты для этого стола
    conns = connections.setdefault(table_id, [])
    # Не больше MAX_PLAYERS
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)  # Try again later
        return

    # Регистрируем нового клиента
    conns.append(websocket)
    # Оповещаем всех (увидят «ожидание» или уже стартанут)
    await broadcast(table_id)

    # При достижении MIN_PLAYERS — запускаем первую раздачу
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
        conns.remove(websocket)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {})
