# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from game_data import seat_map
from game_engine import game_states, connections, start_hand, apply_action

router = APIRouter()

# Минимальное и максимальное число игроков
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    # Берём текущее состояние игры
    state = game_states.get(table_id)
    if state is None:
        return

    # Копируем состояние, чтобы не менять оригинал
    payload = state.copy()

    # Мапа user_id → username, которую мы обновляем при подключении WS
    usernames = state.get("usernames", {})

    # Получаем список user_id в порядке «стула» из seat_map
    player_ids = seat_map.get(table_id, [])

    # Формируем новый payload["players"] с реальными именами
    payload["players"] = [
        {
            "user_id": pid,
            "username": usernames.get(pid, str(pid))  # если имени нет — показываем pid
        }
        for pid in player_ids
    ]

    # Принятое количество ws-соединений
    payload["players_count"] = len(connections.get(table_id, []))

    # Разошлём всем клиентам
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принимаем WS
    await websocket.accept()

    # Если стола нет — отклоняем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Парсим user_id и username из query-параметров
    user_id_str = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        # Если не число — просто не сохраняем username-mapping
        user_id = None

    # Регистрируем username в состоянии (если корректный user_id)
    if user_id is not None:
        game_states[table_id].setdefault("usernames", {})[user_id] = username

    # Регистрируем соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        # Стол полон
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        # Логика старта или ожидания
        count_conns = len(conns)
        if count_conns < MIN_PLAYERS:
            await broadcast(table_id)
        elif not game_states[table_id].get("started", False):
            start_hand(table_id)
            game_states[table_id]["started"] = True
            await broadcast(table_id)
        else:
            await broadcast(table_id)

        # Цикл приёма ходов
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # apply_action ожидает int-пользователя и сумму
            apply_action(
                table_id,
                int(msg.get("user_id", -1)),
                msg.get("action"),
                int(msg.get("amount", 0))
            )
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 1) Убираем это соединение из списка
        if websocket in connections.get(table_id, []):
            connections[table_id].remove(websocket)

        # 2) Если теперь игроков < MIN_PLAYERS — сбрасываем только содержимое state (карты, ставки и т.п.)
        if len(connections.get(table_id, [])) < MIN_PLAYERS:
            game_states[table_id].clear()

        # 3) Оповещаем оставшихся (отрисовкой «Ожидаем игроков (x/2)»)
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
