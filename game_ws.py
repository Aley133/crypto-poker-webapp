# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action
from tables import list_tables

router = APIRouter()

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return
    for ws in connections.get(table_id, []):
        await ws.send_json(state)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # При подключении необходимо принять WebSocket соединение
    await websocket.accept()
    # Проверяем, существует ли такой стол
    if table_id not in game_states:
        # Стол не найден, закрываем соединение
        await websocket.close(code=1008)
        return
    # Регистрируем соединение
    connections.setdefault(table_id, []).append(websocket)
    # Если игра ещё не стартанула, начинаем новую раздачу
    if not game_states[table_id].get("started", False):
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
        connections[table_id].remove(websocket)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    # Возвращает текущее состояние игры по столу
    return game_states.get(table_id, {})
