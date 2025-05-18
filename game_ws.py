import sys
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from tables import join_table, leave_table, seat_map
from game_engine import game_states, connections, start_hand, MIN_PLAYERS


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

async def broadcast(table_id: int):
    """
    Отправляет game_states[table_id] всем WebSocket в connections[table_id].
    """
    state = game_states.get(table_id, {})
    payload = json.dumps(state)
    conns = connections.setdefault(table_id, [])
    for ws in conns.copy():
        try:
            await ws.send_text(payload)
        except:
            conns.remove(ws)



@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    user_id = int(websocket.query_params["user_id"])
    username = websocket.query_params.get("username", str(user_id))

    print(f"[ws_game] ACCEPTED table={table_id} user={user_id}", flush=True)

    # 1) Гарантируем, что игрок в seat_map
    join_table(table_id, str(user_id))
    players = seat_map.get(table_id, [])
    print(f"[ws_game] seat_map now: {players}", flush=True)

    # 2) Регистрируем WS‐соединение
    state = game_states.setdefault(table_id, {})
    state.setdefault("usernames", {})[user_id] = username
    conns = connections.setdefault(table_id, [])
    # (опционально удаляем старые коннекты этого user_id)
    conns.append(websocket)
    print(f"[ws_game] total conns: {len(conns)}, real players: {len(players)}", flush=True)

    try:
        # А) Если игроков меньше нужного — ждем
        if len(players) < MIN_PLAYERS:
            print(f"[ws_game] WAITING — only {len(players)} players", flush=True)
            await broadcast(table_id)

        # B) Если игроков достаточно и рука не стартовала — стартуем
        elif not state.get("started", False):
            print(f"[ws_game] START_HAND for players={players}", flush=True)
            start_hand(table_id)
            print(f"[ws_game] STATE after start_hand: {game_states[table_id]}", flush=True)
            await broadcast(table_id)

        # C) Игра в процессе — просто обновляем
        else:
            print(f"[ws_game] ONGOING broadcast", flush=True)
            await broadcast(table_id)

        # 3) Цикл приёма ходов…
        while True:
            data = await websocket.receive_text()
            # ваша логика apply_action, обновление ставки и т.п.
            await broadcast(table_id)

    except WebSocketDisconnect:
        print(f"[ws_game] DISCONNECT user={user_id}", flush=True)
        if websocket in conns:
            conns.remove(websocket)

        # Удаляем игрока и сбрасываем state, если нужно
        leave_table(table_id, str(user_id))
        print(f"[ws_game] AFTER leave_table: players={seat_map[table_id]}, state={game_states[table_id]}", flush=True)

        await broadcast(table_id)
        

@router.get("/api/game_state")
async def api_game_state(table_id: int):
    """
    HTTP API для получения свежего состояния игры (необходимо для отладки).
    """
    return game_states.get(table_id, {}) or {}
