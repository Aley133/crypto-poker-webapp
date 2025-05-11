# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import json

from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state: return
    for ws in connections.get(table_id, []):
        await ws.send_json(state)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    connections.setdefault(table_id, []).append(websocket)
    if table_id not in game_states:
        start_hand(table_id)
    await broadcast(table_id)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            apply_action(table_id, int(msg["user_id"]), msg["action"], int(msg.get("amount",0)))
            await broadcast(table_id)
    except WebSocketDisconnect:
        connections[table_id].remove(websocket)

@router.get("/api/game_state")
async def api_game_state(table_id: int = Query(...)):
    return game_states.get(table_id, {})
