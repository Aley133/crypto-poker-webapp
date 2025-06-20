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
from tables import TABLES
from db_utils import update_balance_db, get_balance_db

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

async def _auto_restart(table_id: int):
    await asyncio.sleep(RESULT_DELAY)
    state = game_states.get(table_id)
    if state and state.get("phase") == "result":
        start_hand(table_id)
        state["phase"] = "pre-flop"
        state["timer_deadline"] = time.time() + DECISION_TIME
        await broadcast(table_id)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    uid = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid)

    N = MAX_PLAYERS
    conns = connections.setdefault(table_id, [])
    state = game_states.setdefault(table_id, {})
    seats = state.setdefault("seats", [None] * N)
    player_seats = state.setdefault("player_seats", {})
    usernames = state.setdefault("usernames", {})
    players = state.setdefault("players", [])
    stacks = state.setdefault("stacks", {})

    usernames[uid] = username
    state["usernames"] = usernames

    if websocket not in conns:
        conns.append(websocket)
    if len(conns) > N:
        await websocket.close(code=1013)
        return

    await broadcast(table_id)

    try:
        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            msg = json.loads(data)
            action = msg.get("action")

            if action == "get_table_info":
                cfg = TABLES.get(table_id)
                if cfg:
                    await websocket.send_json({
                        "action": "table_info",
                        "min_buy_in": cfg["min_buy_in"],
                        "max_buy_in": cfg["max_buy_in"],
                        "small_blind": cfg["small_blind"],
                        "big_blind": cfg["big_blind"],
                    })
                continue

            if action == "sit":
                seat = int(msg.get("seat", 0))
                buy_in = float(msg.get("buy_in", 0))
                cfg = TABLES.get(table_id)
                if not cfg or not (cfg["min_buy_in"] <= buy_in <= cfg["max_buy_in"]):
                    await websocket.send_json({"action": "error", "message": "Некорректный buy-in"})
                    continue
                if seat < 0 or seat >= N or seats[seat] is not None:
                    await websocket.send_json({"action": "error", "message": "Место уже занято"})
                    continue
                bal = get_balance_db(uid)
                if bal < buy_in:
                    await websocket.send_json({"action": "error", "message": "Недостаточно баланса"})
                    continue
                update_balance_db(uid, -buy_in)
                seats[seat] = uid
                player_seats[uid] = seat
                stacks[uid] = int(buy_in)
                players = [u for u in seats if u]
                state.update({
                    "seats": seats,
                    "player_seats": player_seats,
                    "players": players,
                    "stacks": stacks,
                })
                await websocket.send_json({"action": "sit_ok", "seat": seat, "buy_in": buy_in})
                if len(players) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
                    start_hand(table_id)
                await broadcast(table_id)
                continue

            if action == "leave":
                if uid in player_seats:
                    seat_idx = player_seats.pop(uid)
                    if 0 <= seat_idx < N and seats[seat_idx] == uid:
                        seats[seat_idx] = None
                    stack = stacks.pop(uid, 0)
                    update_balance_db(uid, stack)
                    players = [u for u in seats if u]
                    state.update({
                        "seats": seats,
                        "player_seats": player_seats,
                        "players": players,
                        "stacks": stacks,
                    })
                    await websocket.send_json({"action": "leave_ok", "returned_balance": stack})
                    await broadcast(table_id)
                else:
                    await websocket.send_json({"action": "error", "message": "User not seated"})
                continue

            # === Игровые действия ===
            pid = str(msg.get("user_id") or uid)
            amount = int(msg.get("amount", 0) or 0)
            apply_action(table_id, pid, action, amount)

            s = game_states[table_id]
            s["players"] = [u for u in s.get("seats", [None] * N) if u]
            await broadcast(table_id)

            st = game_states.get(table_id, {})
            if st.get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))
    except WebSocketDisconnect:
        # Нормальное закрытие клиентом
        pass
    finally:
        if uid in player_seats:
            seat_idx = player_seats.pop(uid)
            if 0 <= seat_idx < N and seats[seat_idx] == uid:
                seats[seat_idx] = None
            stack = stacks.pop(uid, 0)
            update_balance_db(uid, stack)
        usernames.pop(uid, None)
        players = [u for u in seats if u]
        state.update({
            "seats": seats,
            "player_seats": player_seats,
            "players": players,
            "usernames": usernames,
            "stacks": stacks,
        })
        await broadcast(table_id)
        if websocket in conns:
            conns.remove(websocket)
