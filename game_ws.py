# game_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

from game_engine import game_states, connections, start_hand, apply_action
from game_data import seat_map  # чтобы получить список игроков за столом

router = APIRouter()

# Минимальное и максимальное число игроков для старта и подключения
MIN_PLAYERS = 2
MAX_PLAYERS = 6

async def broadcast(table_id: int):
    """
    Отправляет всем WS-клиентам на столе текущее состояние игры,
    добавляя массив players с user_id и username и текущее players_count.
    """
    state = game_states.get(table_id)
    if state is None:
        return

    # Получаем маппинг user_id → username из состояния
    usernames = state.get("usernames", {})

    # Строим список игроков в порядке seat_map (HTTP join_table)
    players = [
        {"user_id": uid, "username": usernames.get(uid, uid)}
        for uid in seat_map.get(table_id, [])
    ]

    # Собираем payload
    payload = {
        **state,  # hole_cards, community, stacks, pot, current_player, started…
        "players": players,
        "players_count": len(connections.get(table_id, [])),
    }

    # Шлём каждому
    for ws in list(connections.get(table_id, [])):
        try:
            await ws.send_json(payload)
        except:
            pass

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    # Принимаем WS-соединение
    await websocket.accept()

    # Если стола нет — отклоняем
    if table_id not in game_states:
        await websocket.close(code=1008)
        return

    # Парсим user_id и username из query params
    # (username может передаваться из лобби через URL)
    user_id = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", user_id)

    # Регистрируем username в состоянии стола
    game_states[table_id].setdefault("usernames", {})[user_id] = username

    # Регистрируем новое соединение
    conns = connections.setdefault(table_id, [])
    if len(conns) >= MAX_PLAYERS:
        # слишком много игроков
        await websocket.close(code=1013)
        return

    conns.append(websocket)

    try:
        # Определяем, начинать ли новую раздачу
        count_conns = len(conns)
        if count_conns < MIN_PLAYERS:
            # ждём, пока наберётся минимум
            await broadcast(table_id)
        elif not game_states[table_id].get("started", False):
            # стартуем первую раздачу
            start_hand(table_id)
            game_states[table_id]['started'] = True
            await broadcast(table_id)
        else:
            # уже идёт игра — просто шлём текущее состояние
            await broadcast(table_id)

        # Цикл обработки входящих сообщений
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            apply_action(
                table_id,
                int(msg.get('user_id', -1)),
                msg.get('action'),
                int(msg.get('amount', 0))
            )

            await broadcast(table_id)

    except WebSocketDisconnect:
        # При отключении удаляем WS-соединение
        if websocket in conns:
            conns.remove(websocket)

        # Сбрасываем флаг старта, если слишком мало игроков
        if len(conns) < MIN_PLAYERS:
            game_states[table_id].pop('started', None)

        # Оповещаем остальных игроков
        await broadcast(table_id)

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения текущего состояния игры.
    """
    return game_states.get(table_id, {}) or {}
