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
    """
    Рассылает текущее состояние стола всем подключённым WS-клиентам
    """
    state = game_states.get(table_id)
    if state is None:
        return

    # Клонируем состояние для отправки
    payload = state.copy()

    # Получаем отображение user_id -> username
    usernames = state.get("usernames", {})

    # Список игроков (user_id из seat_map)
    player_ids = seat_map.get(table_id, [])

    # Формируем список игроков с их юзернеймами
    players = []
    for pid in player_ids:
        try:
            uid = int(pid)
        except ValueError:
            uid = pid
        name = usernames.get(uid, str(pid))
        players.append({
            "user_id": pid,
            "username": name
        })

    payload["players"] = players
    payload["players_count"] = len(connections.get(table_id, []))

    # Отправляем всем активным WS-соединениям
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принимаем соединение
    await websocket.accept()

    # Если стейт для стола не инициализирован — отвергаем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Извлекаем user_id и username из query
    user_id_str = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", user_id_str)
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        user_id = None

    # Сохраняем username в state
    if user_id is not None:
        game_states[table_id].setdefault("usernames", {})[user_id] = username

    # Регистрируем WS в списке подключений
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        # Стол полный
        await websocket.close(code=1013)
        return
    conns.append(websocket)

    try:
        # Старт игры или рассылка текущего стейта
        cnt = len(conns)
        if cnt < MIN_PLAYERS:
            # Ждём второго игрока
            await broadcast(table_id)
        elif not game_states[table_id].get("started", False):
            # Первый момент, когда игроки готовы — стартуем раздачу
            start_hand(table_id)
            game_states[table_id]["started"] = True
            await broadcast(table_id)
        else:
            # Игра уже идёт — просто рассылка состояния
            await broadcast(table_id)

        # Цикл для приёма действий игроков
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            uid = int(msg.get("user_id", -1))
            action = msg.get("action")
            amount = int(msg.get("amount", 0))
            apply_action(table_id, uid, action, amount)
            await broadcast(table_id)

    except WebSocketDisconnect:
        # Удаляем соединение
        conns.remove(websocket)
        # Если игроков стало меньше MIN_PLAYERS — сбрасываем состояние
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].clear()
        # Оповещаем оставшихся
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    Для отладки: возвращает состояние игры по HTTP
    """
    return game_states.get(table_id, {}) or {}
