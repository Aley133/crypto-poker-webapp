import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_engine import (
    game_states,
    connections,
    start_hand,
    apply_action,
    DECISION_TIME,
    RESULT_DELAY,
)
from auth import validate_telegram_init_data

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    N = MAX_PLAYERS
    seats = state.get("seats", [None] * N)
    player_seats = state.get("player_seats", {})

    players_payload = []
    for seat_idx, uid in enumerate(seats):
        if not uid:
            continue
        players_payload.append({
            "user_id": uid,
            "username": state.get("usernames", {}).get(uid, uid),
            "seat": seat_idx,
        })

    payload = {
        "phase": state.get("phase", "waiting"),
        "started": state.get("started", False),
        "players_count": len([u for u in seats if u]),
        "players": players_payload,
        "seats": seats,
        "community": state.get("community", []),
        "current_player": state.get("current_player"),
        "pot": state.get("pot", 0),
        "current_bet": state.get("current_bet", 0),
        "contributions": state.get("contributions", {}),
        "stacks": state.get("stacks", {}),
        "hole_cards": state.get("hole_cards", {}),
        "usernames": state.get("usernames", {}),
        "timer_deadline": state.get("timer_deadline"),
        "result_delay_deadline": state.get("result_delay_deadline"),
        "winner": state.get("winner"),
        "revealed_hands": state.get("revealed_hands"),
        "split_pots": state.get("split_pots"),
        "dealer_index": state.get("dealer_index"),
        "player_actions": state.get("player_actions", {}),
    }

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            try:
                await ws.close()
            except:
                pass
            connections.get(table_id, []).remove(ws)

async def broadcast_state(table_id: int):
    """Alias used by TableManager"""
    await broadcast(table_id)

async def _auto_restart(table_id: int):
    await asyncio.sleep(RESULT_DELAY)
    state = game_states.get(table_id)
    if state and state.get("phase") == "result":
        start_hand(table_id)
        state["phase"] = "pre-flop"
        state["timer_deadline"] = time.time() + DECISION_TIME
        await broadcast(table_id)

@router.websocket("/ws/game/{table_id}/{user_id}/{seat}")
async def ws_game(websocket: WebSocket, table_id: int, user_id: str, seat: int):
    init_data = websocket.query_params.get("initData")
    if not init_data or not validate_telegram_init_data(init_data):
        await websocket.close(code=1008)
        return
    await websocket.accept()

    N = MAX_PLAYERS
    state = game_states.setdefault(
        table_id,
        {
            "seats": [None] * N,
            "player_seats": {},
            "players": [],
            "usernames": {},
            "stacks": {},
        },
    )

    if seat >= N or state["seats"][seat] != user_id:
        await websocket.close(code=1008)
        return

    conns = connections.setdefault(table_id, [])
    if websocket not in conns:
        conns.append(websocket)
    await broadcast(table_id)

    if state.get("phase") == "result":
        asyncio.create_task(_auto_restart(table_id))

    try:
        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            msg = json.loads(data)
            pid = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            apply_action(table_id, pid, action, amount)

            await broadcast(table_id)

            st = game_states.get(table_id, {})
            if st.get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in conns:
            conns.remove(websocket)
