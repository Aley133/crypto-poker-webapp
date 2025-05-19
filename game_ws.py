# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

MIN_PLAYERS = 2
MAX_PLAYERS = 6


async def broadcast(table_id: int):
    """
    Рассылает всем клиентам актуальный state столa.
    """
    state = game_states.get(table_id)
    if not state:
        return

    # Копируем защитно
    payload = state.copy()
    players = state.get("players", [])
    usernames = state.get("usernames", {})

    # Формируем читаемый список игроков
    payload["players"] = [
        {"user_id": uid, "username": usernames.get(uid, str(uid))}
        for uid in players
    ]
    payload["players_count"] = len(connections.get(table_id, []))

    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            # Если кто-то отключился посреди рассылки
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # 1) Принимаем WS и создаём state, если его нет
    await websocket.accept()
    state = game_states.setdefault(table_id, {
        "started": False,
        "players": [],
        "usernames": {}
    })

    # 2) Читаем user_id/username и сохраняем
    uid_str  = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid       = str(uid_str)
    state.setdefault("usernames", {})[uid] = username

    # 3) Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # 4) Обновляем порядок игроков из seat_map
    state["players"] = [str(u) for u in seat_map.get(table_id, [])]

    # 5) Если именно сейчас нас стало MIN_PLAYERS и мы ещё не стартовали — стартуем
    if len(conns) >= MIN_PLAYERS and not state.get("started", False):
        start_hand(table_id)
        state["started"] = True

    # 6) Один раз рассылаем текущее состояние (ожидание или сразу старт)
    await broadcast(table_id)

    try:
        while True:
            # 7) Принимаем ход, обрабатываем и шлём обновлённый state
            data = await websocket.receive_text()
            msg  = json.loads(data)

            player_id = str(msg.get("user_id"))
            action    = msg.get("action", "")
            amount    = int(msg.get("amount", 0) or 0)

            apply_action(table_id, player_id, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 8) При отключении убираем WS и, если игроков стало мало, сбрасываем всё
        if websocket in conns:
            conns.remove(websocket)
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для отладки: вернуть текущее состояние стола.
    """
    return game_states.get(table_id, {}) or {}
