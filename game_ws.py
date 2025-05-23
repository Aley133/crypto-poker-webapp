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

    payload = {
        "phase": state.get("phase", "waiting"),
        "started": state.get("started", False),
        "players_count": len(state.get("players", [])),
        "players": [
            {"user_id": uid, "username": state.get("usernames", {}).get(uid, uid)}
            for uid in state.get("players", [])
        ],
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
            pass

async def _auto_restart(table_id: int):
    # Ждём RESULT_DELAY секунд
    await asyncio.sleep(RESULT_DELAY)
    state = game_states.get(table_id)
    # Если всё ещё в фазе result — рестартим
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

    # Регистрация соединения
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Гарантируем базовое состояние
    state = game_states.setdefault(table_id, {})
    state.setdefault("players", [])
    state.setdefault("usernames", {})

    # Обновляем список игроков и юзернеймы
    state["usernames"][uid] = username
    state["players"] = [ws_.query_params.get("user_id") for ws_ in conns]

    # Старт новой раздачи, если нужно
    if len(state["players"]) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
        start_hand(table_id)

    # Первый broadcast
    await broadcast(table_id)

    # Если только что перешли в result — запускаем фоновый рестарт
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

            # После каждого хода рассылаем обновлённое состояние
            await broadcast(table_id)

            # Если мы сейчас в result — создаём таск, чтобы рестартить через RESULT_DELAY
            st = game_states.get(table_id, {})
            if st.get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))

    except WebSocketDisconnect:
        conns.remove(websocket)
        remaining = [ws_.query_params.get("user_id") for ws_ in conns]
        if remaining:
            state = game_states.setdefault(table_id, {})
            state["players"] = remaining
            # При необходимости рестартим
            if len(remaining) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
                start_hand(table_id)
            await broadcast(table_id)
        else:
            game_states.pop(table_id, None)
