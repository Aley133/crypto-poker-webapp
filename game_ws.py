# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import json

from game_engine import (
    game_states,
    connections,
    start_hand,
    apply_action,
)

router = APIRouter()

async def broadcast(table_id: int):
    """
    Отправляет текущее состояние игры всем подключенным клиентам.
    """
    state = game_states.get(table_id)
    if not state:
        return
    for ws in connections.get(table_id, []):
        await ws.send_json(state)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    """
    WebSocket-эндпоинт для игрового стола table_id.
    При первом подключении запускает руку (если нужно) и рассылает стейт.
    Затем слушает действия игроков и применяет их через game_engine.apply_action.
    """
    await websocket.accept()
    # Регистрируем подключение
    connections.setdefault(table_id, []).append(websocket)

    # Если рука ещё не стартовала — запускаем, иначе просто шлём текущий стейт
    if table_id not in game_states:
        start_hand(table_id)
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)
            uid     = int(msg.get("user_id", 0))
            action  = msg.get("action", "")
            amount  = int(msg.get("amount", 0))

            # Применяем действие к состоянию
            apply_action(table_id, uid, action, amount)

            # Рассылаем обновлённый стейт всем участникам
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем подключение при отключении
        connections[table_id].remove(websocket)

@router.get("/api/game_state")
async def api_game_state(table_id: int = Query(..., description="ID стола")):
    """
    REST-маршрут для получения текущего состояния раздачи.
    Вернёт {} если рука не запущена.
    """
    return game_states.get(table_id, {})
