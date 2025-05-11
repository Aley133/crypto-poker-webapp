# game_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, List
import json
import random

from game_data import seat_map

router = APIRouter()

# Константа стартового стека
STARTING_STACK = 1000

# Для каждого table_id — список WS-коннекшенов и состояние текущей раздачи
connections: Dict[int, List[WebSocket]] = {}
game_states:   Dict[int, dict]      = {}

def new_deck() -> List[str]:
    """Создает и перемешивает колоду из 52 карт."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    """Инициализирует новую раздачу: две карты игрокам, сброс банка и стеков."""
    players = seat_map.get(table_id, [])
    if not players:
        return

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: STARTING_STACK for uid in players}

    game_states[table_id] = {
        "hole_cards": hole,
        "community":   [],
        "stacks":      stacks,
        "pot":         0,
        "current_player": players[0],
        # "deck": deck  # можно сохранять оставшиеся карты для флоп/терн/ривер
    }

async def broadcast(table_id: int):
    """Рассылает всем подключенным WS текущее состояние руки."""
    state = game_states.get(table_id)
    if not state:
        return
    for ws in connections.get(table_id, []):
        await ws.send_json(state)

@router.websocket("/ws/game/{table_id}")
async def ws_game(websocket: WebSocket, table_id: int):
    await websocket.accept()
    connections.setdefault(table_id, []).append(websocket)

    # Если рука уже идёт — сразу шлём стейт новому клиенту
    if table_id in game_states:
        await websocket.send_json(game_states[table_id])
    else:
        # иначе стартуем новую раздачу и рассылаем всем
        start_hand(table_id)
        await broadcast(table_id)

    try:
        while True:
            text = await websocket.receive_text()
            msg  = json.loads(text)
            uid     = msg.get("user_id")
            action  = msg.get("action")
            amount  = msg.get("amount", 0)

            state = game_states[table_id]

            # Простая логика ставки
            if action == "bet" and amount > 0:
                if state["stacks"].get(uid, 0) >= amount:
                    state["stacks"][uid] -= amount
                    state["pot"] += amount

            # TODO: реализацию check, fold, raise и т.д.

            # Переход хода к следующему игроку с нечёрным стеком
            active = [p for p,s in state["stacks"].items() if s > 0]
            idx = active.index(state["current_player"])
            state["current_player"] = active[(idx + 1) % len(active)]

            # TODO: раздача community-карт по раундам

            await broadcast(table_id)

    except WebSocketDisconnect:
        connections[table_id].remove(websocket)

@router.get("/api/game_state")
async def api_game_state(table_id: int = Query(...)):
    """Возвращает JSON с состоянием текущей раздачи (или {} если нет)."""
    return game_states.get(table_id, {})
