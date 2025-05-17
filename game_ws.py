# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_data import seat_map, game_states, username_map
from typing import Dict

router = APIRouter()
# table_id → { user_id: WebSocket, ... }
connections: Dict[int, Dict[str, WebSocket]] = {}

@router.websocket("/ws/{table_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, table_id: int, user_id: str):
    await websocket.accept()
    connections.setdefault(table_id, {})[user_id] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            # сюда можно добавить обработку действий («bet», «fold» и т.п.)
            # например: await handle_action(table_id, user_id, json.loads(data))
            # после чего отправить обновлённый state:
            await broadcast_state(table_id)
    except WebSocketDisconnect:
        pass
    finally:
        # при отключении удаляем коннекшен
        connections.get(table_id, {}).pop(user_id, None)
        if not connections.get(table_id):
            connections.pop(table_id, None)

async def broadcast_state(table_id: int):
    state = game_states.get(table_id, {})
    for uid, ws in list(connections.get(table_id, {}).items()):
        payload = serialize_state_for_user(table_id, uid)
        await ws.send_json(payload)

def serialize_state_for_user(table_id: int, user_id: str) -> dict:
    state = game_states.get(table_id, {})
    return {
        'your_hole': state.get('hole_cards', {}).get(user_id, []),
        'community': state.get('community', []),
        'stacks': state.get('stacks', {}),
        'pot': state.get('pot', 0),
        'current_player': state.get('current_player'),
        'players': [
            { 'user_id': uid, 'username': username_map.get(uid, 'Unknown') }
            for uid in state.get('players', [])
        ]
    }
