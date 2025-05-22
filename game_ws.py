from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    # Собираем payload, как ждёт UI
    payload = {
        "started":        state.get("started", False),
        "players_count":  len(state["players"]),
        "players":        [
            {"user_id": uid, "username": state["usernames"].get(uid, uid)}
            for uid in state["players"]
        ],
        "community":      state.get("community", []),
        "current_player": state.get("current_player"),
        "pot":            state.get("pot", 0),
        "current_bet":    state.get("current_bet", 0),
        "contributions":  state.get("contributions", {}),
        "stacks":         state.get("stacks", {}),
        "hole_cards":     state.get("hole_cards", {}),
        "usernames":      state.get("usernames", {}),
    }

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    uid      = websocket.query_params["user_id"]
    username = websocket.query_params.get("username", uid)

    # 1) Добавляем WS-подключение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # 2) Инициализируем/обновляем состояние стол, usernames + players
    state = game_states.setdefault(table_id, {"players": [], "usernames": {}})
    state["usernames"][uid] = username
    state["players"]       = [ws_.query_params["user_id"] for ws_ in conns]

    # 3) Если набралось достаточно народу и рука не стартовала — стартуем
    if len(state["players"]) >= MIN_PLAYERS and not state.get("started", False):
        start_hand(table_id)

    # 4) Рассылаем текущее состояние всем
    await broadcast(table_id)

    try:
        while True:
            text = await websocket.receive_text()
            msg  = json.loads(text)
            pid    = msg["user_id"]
            action = msg["action"]
            amount = int(msg.get("amount", 0) or 0)

            # 5) Обрабатываем ход
            apply_action(table_id, pid, action, amount)

            # 6) Если после действия надо запустить новую руку (например, после fold)
            state = game_states[table_id]
            if len(state["players"]) >= MIN_PLAYERS and not state.get("started", False):
                start_hand(table_id)

            # 7) Рассылаем обновлённое состояние
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 8) Отключили — убираем WS, обновляем players и, возможно, рестарт
        conns.remove(websocket)
        remaining = [ws_.query_params["user_id"] for ws_ in conns]
        if remaining:
            state = game_states[table_id]
            state["players"] = remaining
            if len(remaining) >= MIN_PLAYERS and not state.get("started", False):
                start_hand(table_id)
            await broadcast(table_id)
        else:
            # Никого не осталось — очищаем state
            game_states.pop(table_id, None)
