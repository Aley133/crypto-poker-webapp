import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from flask import request
from flask_socketio import SocketIO, join_room, leave_room, emit
from game_engine import RoomManager, game_states, connections, start_hand, apply_action, DECISION_TIME, RESULT_DELAY

router = APIRouter()
socketio = SocketIO(cors_allowed_origins='*')
room_manager = RoomManager()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


@socketio.on('sitAtTable')
def on_sit(data):
    """Handle player taking a seat with deposit"""
    sid = request.sid
    room_id = data.get('roomId')
    seat = data['seatIndex']
    deposit = data['deposit']
    room = room_manager.get_room(room_id)

    # save player as waiting
    room.players[seat] = {
        'sid': sid,
        'deposit': deposit,
        'status': 'waiting'
    }
    join_room(room_id)

    waiting = [p for p in room.players.values() if p.get('status') == 'waiting']
    if len(waiting) >= 2:
        blinds = {'sb': 0.05, 'bb': 0.10}
        room.start_hand(blinds)
        emit('gameStarted', {'blinds': blinds}, room=room_id)
    else:
        emit('waitingForOpponent', {'msg': 'Ожидание второго игрока...'}, room=sid)

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    N = MAX_PLAYERS
    seats = state.get("seats", [None] * N)
    player_seats = state.get("player_seats", {})
    statuses = state.get("player_status", {})

    players_payload = []
    for seat_idx, uid in enumerate(seats):
        if not uid:
            continue
        players_payload.append({
            "user_id": uid,
            "username": state.get("usernames", {}).get(uid, uid),
            "seat": seat_idx,
            "connected": statuses.get(uid, True),
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
    statuses = state.setdefault("player_status", {})

    # Проверяем: уже сидит или нет
    already_seated = uid in player_seats
    if already_seated:
        seat_idx = player_seats[uid]
        if seats[seat_idx] != uid:
            seats[seat_idx] = uid
    else:
        for s in range(N):
            if seats[s] is None:
                seats[s] = uid
                player_seats[uid] = s
                break
    statuses[uid] = True

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
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break
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
    except WebSocketDisconnect:
        pass
    finally:
        statuses[uid] = False
        state["player_status"] = statuses
        if websocket in conns:
            conns.remove(websocket)
        await broadcast(table_id)
