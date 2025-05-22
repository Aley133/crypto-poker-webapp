from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import time
from game_engine import game_states, connections, start_hand, apply_action, DECISION_TIME

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
        "winner": state.get("winner"),
        "revealed_hands": state.get("revealed_hands"),
        "split_pots": state.get("split_pots"),
    }

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    uid = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid)

    # 1) Регистрируем WS-подключение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # 2) Гарантируем поля state
    state = game_states.setdefault(table_id, {})
    state.setdefault("players", [])
    state.setdefault("usernames", {})

    # 3) Обновляем username и список игроков
    state["usernames"][uid] = username
    state["players"] = [ws_.query_params.get("user_id") for ws_ in conns]

    # 4) При достаточном количестве игроков стартуем руку, если ещё не стартовали
    if len(state["players"]) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
        start_hand(table_id)

    # 5) Первый broadcast после подключения
    await broadcast(table_id)

    # 6) Проверяем рестарт после result
    st = game_states.get(table_id, {})
    if st.get("phase") == "result" and time.time() > st.get("result_delay_deadline", 0):
        start_hand(table_id)
        st["phase"] = "pre-flop"
        st["timer_deadline"] = time.time() + DECISION_TIME
        await broadcast(table_id)

    try:
        while True:
            # 7) Принимаем действие от клиента
            data = await websocket.receive_text()
            msg = json.loads(data)
            pid = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            # 8) Применяем действие
            apply_action(table_id, pid, action, amount)

            # 9) Broadcast после хода
            await broadcast(table_id)

            # 10) Проверяем рестарт после result
            st = game_states.get(table_id, {})
            if st.get("phase") == "result" and time.time() > st.get("result_delay_deadline", 0):
                start_hand(table_id)
                st["phase"] = "pre-flop"
                st["timer_deadline"] = time.time() + DECISION_TIME
                await broadcast(table_id)

    except WebSocketDisconnect:
        # 11) Обрабатываем отключение клиента
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
