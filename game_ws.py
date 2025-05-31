import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_engine import game_states, connections, start_hand, apply_action, DECISION_TIME, RESULT_DELAY

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


def compute_allowed_actions(state, uid: str):
    actions = []
    contribs = state.get('contributions', {})
    stacks = state.get('stacks', {})
    my_contrib = contribs.get(uid, 0)
    my_stack = stacks.get(uid, 0)
    current_bet = state.get('current_bet', 0)
    to_call = max(0, current_bet - my_contrib)
    is_current = str(state.get('current_player')) == str(uid)
    phase = state.get("phase")
    players = state.get("players", [])
    dealer_idx = state.get("dealer_index", -1)
    num_players = len(players)
    sb_idx = (dealer_idx + 1) % num_players if num_players >= 2 else -1
    first_to_act_uid = players[sb_idx] if sb_idx != -1 else None

    if is_current:
        actions.append('fold')
        if phase == "pre-flop" and uid == first_to_act_uid:
            if to_call > 0 and my_stack >= to_call:
                actions.append('call')
            # Первый игрок префлопа — только fold, call
            ordered = [act for act in ['fold','call','bet','raise','check'] if act in actions]
            print(f"[ACTIONS DEBUG] uid={uid} phase={phase} cb={current_bet} contrib={my_contrib} to_call={to_call} allowed={ordered} current_player={state.get('current_player')}")
            return ordered
        if to_call > 0:
            if my_stack >= to_call:
                actions.append('call')
            if my_stack > to_call:
                actions.append('raise')
        else:
            actions.append('check')
            if current_bet == 0 and my_stack > 0:
                actions.append('bet')
    else:
        if to_call > 0 and my_stack >= to_call:
            actions.append('call')
    ordered = [act for act in ['fold','call','bet','raise','check'] if act in actions]
    print(f"[ACTIONS DEBUG] uid={uid} phase={phase} cb={current_bet} contrib={my_contrib} to_call={to_call} allowed={ordered} current_player={state.get('current_player')}")
    return ordered

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    N = 6
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
        uid = ws.query_params.get("user_id")
        # Добавляем allowed_actions для каждого игрока
        payload["allowed_actions"] = compute_allowed_actions(state, str(uid))
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

    N = 6
    conns = connections.setdefault(table_id, [])
    state = game_states.setdefault(table_id, {})
    seats = state.setdefault("seats", [None] * N)
    player_seats = state.setdefault("player_seats", {})
    usernames = state.setdefault("usernames", {})
    players = state.setdefault("players", [])

    # Садим нового игрока, если не сидит
    already = uid in players
    if not already:
        for i in range(N):
            if seats[i] is None:
                seats[i] = uid
                player_seats[uid] = i
                break

    usernames[uid] = username
    players = [u for u in seats if u]
    state.update({"players": players, "usernames": usernames, "seats": seats, "player_seats": player_seats})

    if websocket not in conns:
        conns.append(websocket)
    if len(conns) > N:
        await websocket.close(code=1013)
        return

    # Старт новой раздачи
    if len(players) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
        start_hand(table_id)

    await broadcast(table_id)

    if state.get("phase") == "result":
        asyncio.create_task(_auto_restart(table_id))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            pid = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            apply_action(table_id, pid, action, amount)
            # После действия отправляем новое состояние всем
            await broadcast(table_id)
            if game_states[table_id].get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))
    finally:
        # Очистка при отключении
        if uid in player_seats:
            idx = player_seats.pop(uid)
            seats[idx] = None
        usernames.pop(uid, None)
        if uid in players:
            players.remove(uid)
        state.update({"players": [u for u in seats if u], "usernames": usernames, "seats": seats, "player_seats": player_seats})
        await broadcast(table_id)
        if websocket in conns:
            conns.remove(websocket)
