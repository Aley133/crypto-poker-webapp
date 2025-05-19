from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


async def broadcast(table_id: int):
    """
    Отправляет всем подключённым клиентам JSON с текущим state.
    """
    state = game_states.get(table_id)
    if not state:
        return

    payload = state.copy()
    # Подставляем наглядный список игроков
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
            # игнорируем разрывы
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Если state не инициализировано — закрываем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Читаем user_id и username
    uid_str = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid_str)
    uid = str(uid_str)

    # Сохраняем username
    game_states[table_id].setdefault("usernames", {})[uid] = username

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    # Если набралось достаточно игроков — стартуем руку
    if len(conns) >= MIN_PLAYERS and not game_states[table_id].get("started", False):
        start_hand(table_id)

    # Первый broadcast (ожидание или начало)
    await broadcast(table_id)

    try:
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)
            # Парсим
            player_id = str(msg.get("user_id"))
            action    = msg.get("action")
            amount    = int(msg.get("amount", 0) or 0)

            # Применяем ход
            apply_action(table_id, player_id, action, amount)
            # Посылаем обновлённый state
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем из списка
        if websocket in conns:
            conns.remove(websocket)
        # Если игроков стало меньше MIN_PLAYERS — сбрасываем state
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        await broadcast(table_id)


@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """Для отладки: вернуть текущее состояние стола."""
    return game_states.get(table_id, {}) or {}
