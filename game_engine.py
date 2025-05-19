# game_engine.py

import random
from typing import Dict, List, Set
from game_data import seat_map

# Храним состояния столов и WS-соединения
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}   # <— возвращаем connections!

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
ROUNDS         = ["pre-flop", "flop", "turn", "river", "showdown"]


def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < 2:
        return

    prev_idx   = game_states.get(table_id, {}).get("dealer_index", -1)
    dealer_idx = (prev_idx + 1) % len(players)
    sb_idx     = (dealer_idx + 1) % len(players)
    bb_idx     = (dealer_idx + 2) % len(players)
    sb_uid     = players[sb_idx]
    bb_uid     = players[bb_idx]

    deck        = new_deck()
    hole_cards  = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Стеки и блайнды
    stacks = {uid: STARTING_STACK for uid in players}
    stacks[sb_uid] -= BLIND_SMALL
    stacks[bb_uid] -= BLIND_BIG

    contributions = {
        uid: (
            BLIND_SMALL if uid == sb_uid
            else BLIND_BIG if uid == bb_uid
            else 0
        )
        for uid in players
    }

    first_to_act = players[(bb_idx + 1) % len(players)]

    game_states[table_id] = {
        "players":        players,
        "dealer_index":   dealer_idx,
        "deck":           deck,
        "hole_cards":     hole_cards,
        "community":      [],
        "stacks":         stacks,
        "pot":            BLIND_SMALL + BLIND_BIG,
        "current_bet":    BLIND_BIG,
        "contributions":  contributions,
        "current_round":  "pre-flop",
        "current_player": first_to_act,
        "started":        True,
        "acted":          set(),   # кто уже ходил в этом раунде
        "usernames":      game_states.get(table_id, {}).get("usernames", {}),
    }


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    state = game_states.get(table_id)
    if not state:
        return

    uid = str(uid)
    # Проверяем, что игрок существует и что это его ход
    if uid not in state["stacks"] or state["current_player"] != uid:
        return

    stacks      = state["stacks"]
    contrib     = state["contributions"]
    cb          = state["current_bet"]
    community   = state["community"]
    deck        = state["deck"]
    round_name  = state["current_round"]

    active = [p for p, s in stacks.items() if s > 0]

    # --- 1) Выполнение действия ---
    if action == "call":
        to_call = cb - contrib[uid]
        if stacks[uid] >= to_call:
            stacks[uid]   -= to_call
            state["pot"]  += to_call
            contrib[uid]  += to_call

    elif action == "check":
        if contrib[uid] != cb:
            return

    elif action == "fold":
        stacks[uid] = 0
        active.remove(uid)

    elif action == "bet":
        if amount > cb and stacks[uid] >= amount:
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid]     -= diff
            state["pot"]    += diff
            contrib[uid]     = amount

    elif action == "raise":
        if amount > cb and stacks[uid] >= (amount - contrib[uid]):
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid]     -= diff
            state["pot"]    += diff
            contrib[uid]     = amount

    else:
        return

    state["acted"].add(uid)

    # Если остался один — он забирает банк
    if len(active) == 1:
        winner = active[0]
        stacks[winner] += state["pot"]
        state["current_round"] = "showdown"
        state["started"]       = False
        return

    # --- 2) Переход улицы, если все активные сравнялись и походили ---
    if (
        all(contrib[p] == state["current_bet"] for p in active)
        and all(p in state["acted"] for p in active)
    ):
        state["acted"] = set()
        idx = ROUNDS.index(round_name)
        if idx < len(ROUNDS) - 1:
            next_round = ROUNDS[idx + 1]
            state["current_round"] = next_round

            if round_name == "pre-flop":
                deck.pop()
                state["community"] = [deck.pop() for _ in range(3)]
            elif round_name in ("flop", "turn"):
                deck.pop()
                state["community"].append(deck.pop())
            # river→showdown — без карт

            # Сброс ставок
            state["current_bet"]   = 0
            state["contributions"] = {p: 0 for p in active}
            # current_player остаётся тем, кто ходил последним
    else:
        # --- 3) Просто чередуем ход ---
        if len(active) == 2:
            a, b = active
            state["current_player"] = b if uid == a else a
        else:
            idx = active.index(uid)
            state["current_player"] = active[(idx + 1) % len(active)]
