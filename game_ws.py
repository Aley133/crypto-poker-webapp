import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game_engine import game_states, connections, start_hand, apply_action, DECISION_TIME, RESULT_DELAY

router = APIRouter()
MIN_PLAYERS = 2
MAX_PLAYERS = 6


def compute_allowed_actions(state, uid: str):
    """
    Возвращает список разрешённых действий для игрока uid на основе текущего состояния.
    Действия: 'fold', 'call', 'check', 'bet', 'raise'.
    """
    actions = []
    # Всегда можно сбросить (fold)
    actions.append('fold')

    # Подготовка параметров
    contribs = state.get('contributions', {})
    stacks  = state.get('stacks', {})
    my_contrib = contribs.get(uid, 0)
    my_stack   = stacks.get(uid, 0)
    current_bet = state.get('current_bet', 0)
    to_call = max(0, current_bet - my_contrib)

    is_current = str(state.get('current_player')) == str(uid)

    if is_current:
        # На своем ходу: call или check
        if to_call > 0 and my_stack >= to_call:
            actions.append('call')
        elif to_call == 0:
            actions.append('check')
        # Bet или Raise
        if current_bet == 0:
            if my_stack > 0:
                actions.append('bet')
        else:
            if my_stack > to_call:
                actions.append('raise')
    else:
        # Вне хода: можно заранее call, если есть что коллить
        if to_call > 0 and my_stack >= to_call:
            actions.append('call')
        # Предварительный check/ bet не доступны вне хода

    # Сохраняем порядок: fold, call, bet, raise, check
    ordered = []
    for act in ['fold','call','bet','raise','check']:
        if act in actions:
            ordered.append(act)
    return ordered

async def broadcast(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return

    N = 6
    seats = state.get("seats", [None] * N)
    player_seats = state.get("player_seats", {})

    # Общий payload без actions
    base = {
        "phase": state.get("phase", "waiting"),
        "started": state.get("started", False),
        "players_count": len([u for u in seats if u]),
        "players": [],
        "seats": seats,
        "community": state.get("community", []),
        "current_player": state.get("current_player"),
        "pot": state.get("pot", 0),
        "current_bet": state.get("current_bet", 0),
        "contributions": state.get("contributions", {}),
        "stacks": state.get("stacks", {}),
        "hole_cards": state.get("hole_cards", {}),
        "usernames": state.get("usernames", {}),
        "timer_deadline": state.get("timer_deadline"),
        "result_delay_deadline": state.get("result_delay_deadline"),
        "winner": state.get("winner"),
        "revealed_hands": state.get("revealed_hands"),
        "split_pots": state.get("split_pots"),
        "dealer_index": state.get("dealer_index"),
        "player_actions": state.get("player_actions", {}),
    }

    # Формируем список игроков
    for seat_idx, uid in enumerate(seats):
        if uid is None:
            continue
        base['players'].append({
            'user_id': uid,
            'username': state.get('usernames', {}).get(uid, uid),
            'seat': seat_idx,
        })

    # Отправляем персонализированный payload каждому WS
    for ws in list(connections.get(table_id, [])):
        uid = ws.query_params.get('user_id')
        payload = base.copy()
        # Добавляем разрешенные действия для этого пользователя
        payload["allowed_actions"] = compute_allowed_actions(state, str(uid))
        
        try:
            await ws.send_json(payload)
        except Exception:
            try:
                await ws.close()
            except:
                pass
            connections.get(table_id, []).remove(ws)

async def _auto_restart(table_id: int):
    await asyncio.sleep(RESULT_DELAY)
    state = game_states.get(table_id)
    if state and state.get("phase") == "result":
        start_hand(table_id)
        state["phase"] = "pre-flop"
        state["timer_deadline"] = time.time() + DECISION_TIME
        await broadcast(table_id)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()

    uid = websocket.query_params.get("user_id")
    username = websocket.query_params.get("username", uid)

    N = 6
    conns = connections.setdefault(table_id, [])
    state = game_states.setdefault(table_id, {})
    seats = state.setdefault("seats", [None] * N)
    player_seats = state.setdefault("player_seats", {})
    usernames = state.setdefault("usernames", {})
    players = state.setdefault("players", [])

    # Садим нового игрока, если не сидит
    already = uid in players
    if not already:
        for i in range(N):
            if seats[i] is None:
                seats[i] = uid
                player_seats[uid] = i
                break

    usernames[uid] = username
    players = [u for u in seats if u]
    state.update({"players": players, "usernames": usernames, "seats": seats, "player_seats": player_seats})

    if websocket not in conns:
        conns.append(websocket)
    if len(conns) > N:
        await websocket.close(code=1013)
        return

    # Старт новой раздачи
    if len(players) >= MIN_PLAYERS and state.get("phase") != "pre-flop":
        start_hand(table_id)

    await broadcast(table_id)

    if state.get("phase") == "result":
        asyncio.create_task(_auto_restart(table_id))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            pid = str(msg.get("user_id"))
            action = msg.get("action")
            amount = int(msg.get("amount", 0) or 0)

            apply_action(table_id, pid, action, amount)
            # После действия отправляем новое состояние всем
            await broadcast(table_id)
            if game_states[table_id].get("phase") == "result":
                asyncio.create_task(_auto_restart(table_id))
    finally:
        # Очистка при отключении
        if uid in player_seats:
            idx = player_seats.pop(uid)
            seats[idx] = None
        usernames.pop(uid, None)
        if uid in players:
            players.remove(uid)
        state.update({"players": [u for u in seats if u], "usernames": usernames, "seats": seats, "player_seats": player_seats})
        await broadcast(table_id)
        if websocket in conns:
            conns.remove(websocket)
