from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, List
import json
import random

from game_data import seat_map

router = APIRouter()

# --- Game state and WebSocket connections ---
# Для каждого table_id — список WS-коннекшенов и текущее состояние руки
connections: Dict[int, List[WebSocket]] = {}
game_states: Dict[int, dict] = {}

# --- Deck and hand initialization ---
def new_deck() -> List[str]:
    """Create and shuffle a new 52-card deck."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [rank + suit for rank in ranks for suit in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    """Initialize a new hand: deal two cards, reset bets and stacks."""
    players = list(seat_map.get(table_id, []))
    if not players:
        return

    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}
    starting_stack = 1000
    stacks = {uid: starting_stack for uid in players}

    game_states[table_id] = {
        "hole_cards": hole_cards,
        "community": [],
        "stacks": stacks,
        "pot": 0,
        "current_player": players[0],
        # Если нужно, можно сохранить остаток колоды в state:
        # "deck": deck
    }

async def broadcast(table_id: int):
    """Send current game state to all connected clients."""
    state = game_states.get(table_id)
    if not state:
        return
    for ws in connections.get(table_id, []):
        await ws.send_json(state)

# --- WebSocket endpoint for game flow ---
@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    connections.setdefault(table_id, []).append(websocket)

    # On first connection, start a new hand
    if table_id not in game_states:
        start_hand(table_id)
        await broadcast(table_id)

    try:
        while True:
            text = await websocket.receive_text()
            msg = json.loads(text)
            uid = msg.get("user_id")
            action = msg.get("action")
            amount = msg.get("amount", 0)

            state = game_states[table_id]
            # Simple bet logic
            if action == "bet" and amount > 0:
                state["stacks"][uid] -= amount
                state["pot"] += amount
            # TODO: add check, fold, etc.

            # Rotate turn
            players = list(state["stacks"].keys())
            idx = players.index(state["current_player"])
            state["current_player"] = players[(idx + 1) % len(players)]

            # TODO: deal community cards after betting rounds

            await broadcast(table_id)

    except WebSocketDisconnect:
        connections[table_id].remove(websocket)

# --- REST endpoint to fetch current game state ---
@router.get("/api/game_state")
async def api_game_state(table_id: int = Query(...)):
    """Return current hand state or empty dict if no hand."""
    return game_states.get(table_id, {})
