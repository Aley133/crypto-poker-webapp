from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from tables import join_table, leave_table, seat_map
from game_engine import create_deck, deal_hole_cards, initialize_stacks
from tables import MIN_PLAYERS
from typing import Dict, List

router = APIRouter()
# Active WebSocket connections per table
connections: Dict[int, List[WebSocket]] = {}
# Persistent game states per table
game_states: Dict[int, Dict] = {}

@router.websocket("/ws/{table_id}/{user_id}")
async def ws_endpoint(websocket: WebSocket, table_id: int, user_id: str):
    await websocket.accept()
    # Register connection
    conns = connections.setdefault(table_id, [])
    conns.append(websocket)
    # Ensure user is in the seat map
    join_table(table_id, user_id)
    # Broadcast updated lobby/state
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start_hand":
+        # Только если достаточно игроков
+        if len(seat_map.get(table_id, [])) < MIN_PLAYERS:
+            continue
+        # Делегируем логику раздачи в game_engine.start_hand
+        start_hand(table_id)
+        # Выставляем флаг 'started' вручную
+        game_states[table_id].setdefault("started", True)
+        await broadcast(table_id)
            # TODO: handle other WS actions like betting, folding...

    except WebSocketDisconnect:
        # Cleanup on disconnect
        if websocket in connections.get(table_id, []):
            connections[table_id].remove(websocket)
        # Remove player from seat map as well
        leave_table(table_id, user_id)
        # Reset "started" if too few players
        state = game_states.get(table_id)
        if state and len(connections.get(table_id, [])) < MIN_PLAYERS:
            state.pop("started", None)
        await broadcast(table_id)

async def broadcast(table_id: int):
    conns = connections.get(table_id, [])
    state = game_states.get(table_id, {})
    # Always include the current seat_map if state has no players
    players = state.get("players", seat_map.get(table_id, []))
    payload = {
        "type": "state_update",
        "players": players,
        "state": state,
    }
    for conn in conns:
        await conn.send_json(payload)
