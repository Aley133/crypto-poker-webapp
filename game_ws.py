from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    payload = state.copy()
    players = state["players"]
    usernames = state.get("usernames", {})

    payload["players"] = [
        {"user_id": uid, "username": usernames.get(uid, str(uid))}
        for uid in players
    ]
    payload["players_count"] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Подписываем query params
    uid_str = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid = str(uid_str)

    # Регистрируем подключение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Инициализируем state, если первый раз
    state = game_states.setdefault(table_id, {"usernames": {}})
    # Обновляем username
    state.setdefault("usernames", {})[uid] = username

    # Динамический список игроков из активных WS-соединений
    # Берём user_id из query_params каждого WS
    players = [ws_.query_params.get("user_id") for ws_ in conns]
    state["players"] = [str(u) for u in players]

    # 1) Broadcast ожидание или старт
    await broadcast(table_id)

    # 2) Если теперь достаточно игроков и ещё не стартовали — старт раздачи
    if len(state["players"]) >= MIN_PLAYERS and not state.get("started", False):
        start_hand(table_id)
        await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            player_id = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            # Применяем action; внутри start_hand уже обновляется state["players"]
            apply_action(table_id, player_id, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        conns.remove(websocket)
        # При отключении пересобираем динамический список
        players = [ws_.query_params.get("user_id") for ws_ in conns]
        if players:
            state["players"] = [str(u) for u in players]
            await broadcast(table_id)
        else:
            game_states.pop(table_id, None)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
