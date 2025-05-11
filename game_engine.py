# game_engine.py
import random
from typing import Dict, List

# Импортируем seat_map, куда записываются игроки
from game_data import seat_map

# Состояния и соединения перенесём в engine
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Стартовый стек (можете поменять)
STARTING_STACK = 1000

def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    """Инициализирует новую раздачу по table_id."""
    players = seat_map.get(table_id, [])
    if not players:
        return

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: STARTING_STACK for uid in players}

    game_states[table_id] = {
        "hole_cards": hole,
        "community": [],
        "stacks": stacks,
        "pot": 0,
        "current_player": players[0],
        # "deck": deck
    }

def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """Простейшая механика ставок."""
    state = game_states.get(table_id)
    if not state or uid not in state["stacks"]:
        return

    if action == "bet" and amount > 0:
        if state["stacks"][uid] >= amount:
            state["stacks"][uid] -= amount
            state["pot"] += amount
    # TODO: check, fold, raise и т.д.

    # переключаем ход
    active = [p for p,s in state["stacks"].items() if s > 0]
    idx = active.index(state["current_player"])
    state["current_player"] = active[(idx + 1) % len(active)]
