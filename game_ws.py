### game_ws.py
```python
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from tables import join_table, leave_table, seat_map
from game_engine import (
    create_deck,
    deal_hole_cards,
    initialize_stacks,
    MIN_PLAYERS,
)
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
                players = seat_map.get(table_id, []).copy()
                # Only start if minimum players met
                if len(players) < MIN_PLAYERS:
                    continue
                # Prepare deck and deal
                deck = create_deck()
                hole_cards = deal_hole_cards(deck, len(players))
                stacks = initialize_stacks(players)
                # Store full game state including players and deck
                game_states[table_id] = {
                    "players": players,
                    "deck": deck,
                    "hole_cards": hole_cards,
                    "community": [],
                    "stacks": stacks,
                    "pot": 0,
                    "current_player": players[0],
                    "started": True,
                }
                await broadcast(table_id)
            # TODO: handle other WS actions like betting, folding...

    except WebSocketDisconnect:
        # Cleanup on disconnect
        if websocket in conns:
            conns.remove(websocket)
        # Remove player from seat map as well
        leave_table(table_id, user_id)
        # If too few connections, reset "started"
        state = game_states.get(table_id)
        if state and len(conns) < MIN_PLAYERS:
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
```

### tables.py
```python
from fastapi import APIRouter, HTTPException
from typing import Dict, List

router = APIRouter(prefix="/api")
# Mapping from table_id to list of user_ids
seat_map: Dict[int, List[str]] = {}

@router.post("/join")
async def join_table(table_id: int, user_id: str):
    users = seat_map.setdefault(table_id, [])
    # Prevent duplicate joins
    if user_id not in users:
        users.append(user_id)
    return {"table_id": table_id, "users": users}

@router.post("/leave")
async def leave_table(table_id: int, user_id: str):
    users = seat_map.get(table_id, [])
    if user_id in users:
        users.remove(user_id)
    return {"table_id": table_id, "users": users}

@router.get("/tables")
async def list_tables():
    return {"tables": list(seat_map.keys())}

@router.get("/tables/{table_id}/users")
async def get_table_users(table_id: int):
    users = seat_map.get(table_id, [])
    return {"table_id": table_id, "users": users}
