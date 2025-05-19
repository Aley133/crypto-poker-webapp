# game_engine.py
import random
from typing import Dict, List
from game_data import seat_map

game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

STARTING_STACK = 1000

def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2,11)] + list("JQKA")
    suits = ["♠","♥","♦","♣"]
    deck = [r+s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    # Получаем список юзеров из seat_map
    players = seat_map.get(table_id, [])
    if not players:
        return

    # Сохраняем старую мапу user_id → username, если она есть
    old_state = game_states.get(table_id, {})
    usernames = old_state.get("usernames", {})

    # Новая колода и раздача карманных карт
    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Инициализация стеков
    stacks = {uid: STARTING_STACK for uid in players}

    # Собираем новое состояние, включая usernames
    game_states[table_id] = {
        "hole_cards": hole,
        "community": [],
        "stacks": stacks,
        "pot": 0,
        "current_player": players[0],
        "usernames": usernames,
    }

def apply_action(table_id: int, uid: int, action: str, amount: int=0):
    state = game_states.get(table_id)
    if not state or uid not in state["stacks"]:
        return
    if action == "bet" and amount>0:
        if state["stacks"][uid]>=amount:
            state["stacks"][uid]-=amount
            state["pot"]+=amount
    # TODO: check/fold etc.
    active = [p for p,s in state["stacks"].items() if s>0]
    idx = active.index(state["current_player"])
    state["current_player"] = active[(idx+1)%len(active)]
