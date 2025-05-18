import logging
from fastapi import WebSocket, WebSocketDisconnect

from tables import seat_map, game_states, join_table, leave_table
from game_engine import start_hand, MIN_PLAYERS
from broadcast import broadcast, connections

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
    user_id = int(websocket.query_params["user_id"])
    username = websocket.query_params.get("username", str(user_id))

    logging.info(f"[ws_game] ACCEPTED connection table={table_id} user={user_id} ({username})")

    # Гарантируем join в seat_map
    join_table(table_id, str(user_id))
    logging.info(f"[ws_game] AFTER join_table: seat_map={seat_map.get(table_id)}")

    # Регистрируем WS-коннект
    state = game_states.setdefault(table_id, {})
    state.setdefault("usernames", {})[user_id] = username
    conns = connections.setdefault(table_id, [])
    conns.append(websocket)
    logging.info(f"[ws_game] CONNECTIONS now: {len(conns)} sockets for table {table_id}")

    try:
        # Ветка ожидания
        if len(conns) < MIN_PLAYERS:
            logging.info(f"[ws_game] BROADCAST waiting: only {len(conns)} players")
            await broadcast(table_id)

        # Ветка старта новой руки
        elif not state.get("started", False):
            logging.info(f"[ws_game] START_HAND for players={seat_map.get(table_id)}")
            start_hand(table_id)
            logging.info(f"[ws_game] AFTER start_hand: state={game_states.get(table_id)}")
            await broadcast(table_id)

        # Ветка ongoing
        else:
            logging.info(f"[ws_game] BROADCAST ongoing: state={game_states.get(table_id)}")
            await broadcast(table_id)

        # Главный цикл приёма ходов
        while True:
            data = await websocket.receive_text()
            logging.info(f"[ws_game] RECEIVED from {user_id}: {data}")
            # …обработка хода…
            await broadcast(table_id)

    except WebSocketDisconnect:
        logging.info(f"[ws_game] DISCONNECT user={user_id} conns_before={len(conns)}")
        if websocket in conns:
            conns.remove(websocket)
        logging.info(f"[ws_game] conns_after_remove={len(conns)}")

        # Убираем игрока
        leave_table(table_id, str(user_id))
        logging.info(f"[ws_game] AFTER leave_table: seat_map={seat_map.get(table_id)}, state={game_states.get(table_id)}")

        logging.info(f"[ws_game] BROADCAST after disconnect")
        await broadcast(table_id)
        

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
