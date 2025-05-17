# game_ws.py
from fastapi import APIRouter, WebSocket
from typing import Dict
from game_data import seat_map, game_states, username_map

router = APIRouter()
# хранение активных WS-коннекшенов: table_id → user_id → WebSocket
connections: Dict[int, Dict[str, WebSocket]] = {}

@router.websocket("/ws/{table_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, table_id: int, user_id: str):
    await websocket.accept()
    # регистрируем соединение
    connections.setdefault(table_id, {})[user_id] = websocket

    try:
        while True:
            msg = await websocket.receive_json()
            # здесь можно обрабатывать действия (bet, fold и т.д.)
            # после обработки – рассылаем обновлённое состояние:
            await broadcast_state(table_id)
    except:
        pass
    finally:
        # при любом закрытии убираем коннекшен
        connections[table_id].pop(user_id, None)
        if not connections[table_id]:
            connections.pop(table_id, None)

async def broadcast_state(table_id: int):
    """Рассылаем всем за столом их персональный view."""
    state = game_states.get(table_id, {})
    players = state.get('players', [])
    for uid in players:
        ws = connections.get(table_id, {}).get(uid)
        if not ws:
            continue
        payload = serialize_state_for_user(table_id, uid)
        await ws.send_json(payload)

def serialize_state_for_user(table_id: int, user_id: str) -> dict:
    """Готовим JSON-ответ для конкретного игрока."""
    state = game_states.get(table_id, {})
    return {
        'your_hole': state.get('hole_cards', {}).get(user_id, []),
        'community': state.get('community', []),
        'stacks': state.get('stacks', {}),
        'pot': state.get('pot', 0),
        'current_player': state.get('current_player'),
        'players': [
            {
                'user_id': uid,
                'username': username_map.get(uid, 'Unknown')
            }
            for uid in state.get('players', [])
        ]
    }
