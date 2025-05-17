### game_ws.py
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from tables import join_table, leave_table, seat_map, MIN_PLAYERS
from game_engine import start_hand as engine_start_hand
from typing import Dict, List

router = APIRouter()
# Active WebSocket connections per table
connections: Dict[int, List[WebSocket]] = {}
# Persistent game states per table
game_states: Dict[int, dict] = {}

@router.websocket("/ws/game/{table_id}")
async def ws_endpoint(websocket: WebSocket, table_id: int):
    # Extract user from query params
    params = websocket.query_params
    user_id = params.get("user_id")
    if not user_id:
        await websocket.close(code=4001)
        return

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
                # Только если достаточно игроков
                if len(seat_map.get(table_id, [])) < MIN_PLAYERS:
                    continue
                # Делегируем логику раздачи в game_engine
                engine_start_hand(table_id)
                # Устанавливаем флаг started в состоянии
                state = game_states.setdefault(table_id, {})
                state["started"] = True
                await broadcast(table_id)
            # TODO: handle other WS actions like betting, folding...

    except WebSocketDisconnect:
        # Cleanup on disconnect
        if websocket in connections.get(table_id, []):
            connections[table_id].remove(websocket)
        # Remove player from seat map
        leave_table(table_id, user_id)
        # Reset "started" if too few players
        state = game_states.get(table_id, {})
        if state and len(connections.get(table_id, [])) < MIN_PLAYERS:
            state.pop("started", None)
        await broadcast(table_id)

async def broadcast(table_id: int):
    conns = connections.get(table_id, [])
    state = game_states.get(table_id, {})
    players = state.get("players", seat_map.get(table_id, []))
    payload = {
        "type": "state_update",
        "players": players,
        "state": state,
    }
    for conn in conns:
        await conn.send_json(payload)
