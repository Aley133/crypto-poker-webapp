import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_engine import game_states, connections, start_hand, apply_action, DECISION_TIME, RESULT_DELAY
from db_utils import get_balance_db, update_balance_db
from tables import get_table_config, leave_table

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
    state["seats"] = seats
    state["player_seats"] = player_seats
    players = [u for u in seats if u]
    state["players"] = players

    # Добавляем соединение
    if websocket not in conns:
        conns.append(websocket)
    if len(conns) > N:
        await websocket.close(code=1013)
        return

    # Старт новой раздачи если нужно
    if len(players) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
        start_hand(table_id)

    await broadcast(table_id)

    # Авто-ребут если только что result
    st = game_states.get(table_id, {})
    if st.get("phase") == "result":
        asyncio.create_task(_auto_restart(table_id))

    try:
        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            msg = json.loads(data)
            action = msg.get("action")

            if action == "get_table_info":
                cfg = get_table_config(table_id)
                await websocket.send_json({
                    "action": "table_info",
                    "table_id": table_id,
                    "min_buy_in": cfg["min_buy_in"],
                    "max_buy_in": cfg["max_buy_in"],
                })
                continue

            if action == "sit":
                seat = int(msg.get("seat", -1))
                buy_in = float(msg.get("buy_in", 0))
                cfg = get_table_config(table_id)
                if seat < 0 or seat >= N or seats[seat] is not None:
                    await websocket.send_json({"error": "seat_unavailable"})
                    continue
                if not (cfg["min_buy_in"] <= buy_in <= cfg["max_buy_in"]):
                    await websocket.send_json({"error": "invalid_buy_in"})
                    continue
                balance = get_balance_db(uid)
                if balance < buy_in:
                    await websocket.send_json({"error": "insufficient_balance"})
                    continue
                update_balance_db(uid, -buy_in)
                seats[seat] = uid
                player_seats[uid] = seat
                stacks[uid] = buy_in
                players = [u for u in seats if u]
                state["players"] = players
                state["stacks"] = stacks
                await websocket.send_json({
                    "action": "sit_ok",
                    "seat": seat,
                    "buy_in": buy_in,
                    "stack": buy_in,
                })
                if len(players) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
                    start_hand(table_id)
                await broadcast(table_id)
                continue

            if action == "leave":
                stack = stacks.pop(uid, 0)
                seat_idx = player_seats.pop(uid, None)
                if seat_idx is not None and 0 <= seat_idx < N and seats[seat_idx] == uid:
                    seats[seat_idx] = None
                players = [u for u in seats if u]
                state["players"] = players
                update_balance_db(uid, stack)
                try:
                    leave_table(table_id, uid)
                except Exception:
                    pass
                await websocket.send_json({"action": "leave_ok", "returned_balance": stack})
                await broadcast(table_id)
                continue

            # Остальные игровые действия
            pid = str(msg.get("user_id", uid))
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
        # Освобождаем место и чистим связи, возвращаем стек
        stack = stacks.pop(uid, 0)
        if uid in player_seats:
            seat_idx = player_seats.pop(uid)
            if 0 <= seat_idx < N and seats[seat_idx] == uid:
                seats[seat_idx] = None
        usernames.pop(uid, None)
        players = [u for u in seats if u]
        state["players"] = players
        state["usernames"] = usernames
        state["seats"] = seats
        state["player_seats"] = player_seats
        update_balance_db(uid, stack)
        if stack:
            try:
                leave_table(table_id, uid)
            except Exception:
                pass
        await broadcast(table_id)
        if websocket in conns:
            conns.remove(websocket)
