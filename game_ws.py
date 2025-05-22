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

    payload = state.copy()
    # Форматируем игроков для UI
    payload["players"] = [
        {"user_id": uid, "username": payload.get("usernames", {}).get(uid, str(uid))}
        for uid in state.get("players", [])
    ]
    payload["players_count"] = len(state.get("players", []))  # используем динамический список игроков(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    uid = str(websocket.query_params.get("user_id", ""))
    username = websocket.query_params.get("username", uid)

    # Регистрируем подключение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Инициализируем или обновляем state
    state = game_states.setdefault(table_id, {})
    state.setdefault("usernames", {})[uid] = username
    # Обновляем список игроков из активных WS
    players = [str(ws_.query_params.get("user_id")) for ws_ in conns]
    state["players"] = players

    # Если достаточно игроков и рука ещё не стартовала — стартуем
    if len(players) >= MIN_PLAYERS and not state.get("started", False):
        # Запуск новой руки
        start_hand(table_id)
    # Отправляем текущее состояние
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            player_id = str(msg.get("user_id", ""))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            apply_action(table_id, player_id, action, amount)
            # При любом изменении — проверяем, нужно ли стартовать новую руку
            state = game_states.get(table_id, {})
            if len(state.get("players", [])) >= MIN_PLAYERS and not state.get("started", False):
                start_hand(table_id)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Удаляем соединение и обновляем список игроков
        conns.remove(websocket)
        remaining = [str(ws_.query_params.get("user_id")) for ws_ in conns]
        if remaining:
            state = game_states.setdefault(table_id, {})
            state["players"] = remaining
            # Рестарт, если необходимо
            if len(remaining) >= MIN_PLAYERS and not state.get("started", False):
                start_hand(table_id)
            await broadcast(table_id)
        else:
            # Удаляем состояние, если нет игроков
            game_states.pop(table_id, None)

# REST-фоллбек для фронтенда, если где-то ещё используется
@router.get("/api/game_state")
async def api_game_state(table_id: int):
    return game_states.get(table_id, {}) or {}
