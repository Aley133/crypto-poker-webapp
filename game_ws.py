import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_engine import game_states, connections, start_hand, apply_action, DECISION_TIME, RESULT_DELAY

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    N = 6
    seats = state.get("seats", [None] * N)
    player_seats = state.get("player_seats", {})

    # Формируем payload игроков: seat обязателен
    players_payload = []
    for seat_idx, uid in enumerate(seats):
        if not uid:
            continue
        players_payload.append({
            "user_id": uid,
            "username": state.get("usernames", {}).get(uid, uid),
            "seat": seat_idx,
            # другие нужные поля (stack, contributions) можно добавить тут
        })

    payload = {
        "phase": state.get("phase", "waiting"),
        "started": state.get("started", False),
        "players_count": len([u for u in seats if u]),
        "players": players_payload,
        "seats": seats,  # список user_id либо None — для SIT на фронте
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

    N = 6
    conns = connections.setdefault(table_id, [])
    state = game_states.setdefault(table_id, {})
    seats = state.setdefault("seats", [None] * N)
    player_seats = state.setdefault("player_seats", {})
    usernames = state.setdefault("usernames", {})
    players = state.setdefault("players", [])

    # Проверяем: уже сидит или нет
    already_seated = False
    for s, occupant in enumerate(seats):
        if occupant == uid:
            already_seated = True
            break

    # Садим нового игрока, если не сидит
    if not already_seated:
        for s in range(N):
            if seats[s] is None:
                seats[s] = uid
                player_seats[uid] = s
                break

    usernames[uid] = username
    players = [u for u in seats if u]
    state["players"] = players
    state["usernames"] = usernames
    state["seats"] = seats
    state["player_seats"] = player_seats

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
            data = await websocket.receive_text()
            msg = json.loads(data)
            pid = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            apply_action(table_id, pid, action, amount)

            s = game_states[table_id]
            s["players"] = [u for u in s.get("seats", [None] * N) if u]
            await broadcast(table_id)

            st = game_states.get(table_id, {})
            if st.get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))
    finally:
        # Освобождаем место
        if uid in player_seats:
            seat_idx = player_seats[uid]
            if 0 <= seat_idx < N and seats[seat_idx] == uid:
                seats[seat_idx] = None
            del player_seats[uid]
        usernames.pop(uid, None)
        if uid in players:
            players.remove(uid)
        state["players"] = [u for u in seats if u]
        state["usernames"] = usernames
        state["seats"] = seats
        state["player_seats"] = player_seats
        await broadcast(table_id)
        if websocket in conns:
            conns.remove(websocket)

    # Чистим после WebSocketDisconnect
    # (оставим эту секцию для совместимости)
    try:
        pass
    except WebSocketDisconnect:
        if websocket in conns:
            conns.remove(websocket)
        remaining = [ws_.query_params.get("user_id") for ws_ in conns]
        if remaining:
            state = game_states.setdefault(table_id, {})
            state["players"] = remaining
            if len(remaining) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
                start_hand(table_id)
            await broadcast(table_id)
        else:
            game_states.pop(table_id, None)
