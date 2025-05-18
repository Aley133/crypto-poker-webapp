# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from tables import join_table, leave_table

from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

# Минимальное и максимальное число игроков
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    """
    Шлёт всем WS-клиентам текущее состояние игры,
    дополняя его списком игроков с их username и
    полем players_count.
    """
    state = game_states.get(table_id)
    if state is None:
        return

    # Берём копию «сырого» state
    payload = state.copy()

    # Маппинг из user_id → username 
    # (пополняется в ws_game при подключении)
    usernames = state.get("usernames", {})

    # Игроки приходят из HTTP-логики game_engine
    player_ids = state.get("players", [])

    # Формируем новый payload["players"]
    payload["players"] = [
        {
            "user_id": pid,
            "username": usernames.get(pid, str(pid))
        }
        for pid in player_ids
    ]

    # Сколько WS-соединений сейчас активно на этом столе
    payload["players_count"] = len(connections.get(table_id, []))

    # Рассылаем всем
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass


@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    # Получаем user_id и username из query params
    user_id = int(websocket.query_params["user_id"])
    username = websocket.query_params.get("username", str(user_id))
    join_table(table_id, str(user_id))
    state = game_states.setdefault(table_id, {})
    state.setdefault("usernames", {})[user_id] = username
    conns = connections.setdefault(table_id, [])
    conns.append(websocket)

    try:
        # 1) Если игроков меньше минимума — просто бродкастим
        if len(conns) < MIN_PLAYERS:
            await broadcast(table_id)

        # 2) Если игроков достаточно и рука ещё не стартована — стартуем
        elif not state.get("started", False):
            start_hand(table_id)
            state["started"] = True
            await broadcast(table_id)

        # 3) Если игра уже идёт — просто обновляем
        else:
            await broadcast(table_id)

        # 4) Обработка входящих сообщений (ходов)
        while True:
            data = await websocket.receive_text()
            # тут ваша логика ходов, например:
            # await handle_action(table_id, user_id, data)
            # await broadcast(table_id)

    except WebSocketDisconnect:
        # Убираем WS-соединение
        if websocket in conns:
            conns.remove(websocket)

        # Убираем игрока из стола и, при необходимости, сбрасываем состояние
        try:
            leave_table(table_id, str(user_id))
        except:
            pass

        # Оповещаем оставшихся
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
