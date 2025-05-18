import sys
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from tables import join_table, leave_table, seat_map
from game_engine import game_states, connections, start_hand, MIN_PLAYERS
from broadcast import broadcast

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

    # 1. Новый WS-коннект
    print(f"[ws_game] ACCEPTED connection table={table_id} user={user_id} ({username})",
          file=sys.stdout, flush=True)

    # 2. Убедимся, что пользователь в seat_map
    join_table(table_id, str(user_id))
    print(f"[ws_game] AFTER join_table: seat_map={seat_map.get(table_id)}",
          file=sys.stdout, flush=True)

    # 3. Зарегистрируем username и сокет
    state = game_states.setdefault(table_id, {})
    state.setdefault("usernames", {})[user_id] = username
    conns = connections.setdefault(table_id, [])
    conns.append(websocket)
    print(f"[ws_game] CONNECTIONS now: {len(conns)} sockets for table {table_id}",
          file=sys.stdout, flush=True)

    try:
        # 4a. Если игроков меньше минимума — просто ждем
        if len(conns) < MIN_PLAYERS:
            print(f"[ws_game] BROADCAST waiting: only {len(conns)} players",
                  file=sys.stdout, flush=True)
            await broadcast(table_id)

        # 4b. Если достаточно игроков и рука не стартовала — стартуем
        elif not state.get("started", False):
            print(f"[ws_game] BEFORE start_hand: state={game_states.get(table_id)}",
                  file=sys.stdout, flush=True)
            start_hand(table_id)
            print(f"[ws_game] AFTER start_hand: state={game_states.get(table_id)}",
                  file=sys.stdout, flush=True)
            await broadcast(table_id)

        # 4c. Игра уже идет — обновляем состояние
        else:
            print(f"[ws_game] BROADCAST ongoing: state={game_states.get(table_id)}",
                  file=sys.stdout, flush=True)
            await broadcast(table_id)

        # 5. Главный цикл приема ходов
        while True:
            data = await websocket.receive_text()
            print(f"[ws_game] RECEIVED from {user_id}: {data}",
                  file=sys.stdout, flush=True)
            # здесь ваша логика обработки действия…
            await broadcast(table_id)

    except WebSocketDisconnect:
        # 6. Обработка отключения
        print(f"[ws_game] DISCONNECT user={user_id}, conns_before={len(conns)}",
              file=sys.stdout, flush=True)
        if websocket in conns:
            conns.remove(websocket)
        print(f"[ws_game] conns_after_remove={len(conns)}",
              file=sys.stdout, flush=True)

        # 7. Убираем игрока из seat_map и очищаем state при необходимости
        leave_table(table_id, str(user_id))
        print(f"[ws_game] AFTER leave_table: seat_map={seat_map.get(table_id)}, "
              f"state={game_states.get(table_id)}",
              file=sys.stdout, flush=True)

        # 8. Оповещаем оставшихся игроков
        print(f"[ws_game] BROADCAST after disconnect", file=sys.stdout, flush=True)
        await broadcast(table_id)
        

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
