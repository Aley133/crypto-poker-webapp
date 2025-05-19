import random
from typing import Dict, List
from game_data import seat_map

# Состояния столов и соединений
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2


def new_deck() -> List[str]:
    """Генерирует и перемешивает новую колоду из 52 карт."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """Запускает новую раздачу: блайнды, раздача, pre-flop."""
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < 2:
        return

    prev = game_states.get(table_id, {}).get("dealer_index", -1)
    dealer_index = (prev + 1) % len(players)

    sb_i = (dealer_index + 1) % len(players)
    bb_i = (dealer_index + 2) % len(players)
    sb = players[sb_i]
    bb = players[bb_i]

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}

    stacks = {uid: STARTING_STACK for uid in players}
    stacks[sb] -= BLIND_SMALL
    stacks[bb] -= BLIND_BIG

    contributions = {
        uid: (BLIND_SMALL if uid == sb else BLIND_BIG if uid == bb else 0)
        for uid in players
    }

    # Сохраняем всё в состоянии стола
    game_states[table_id] = {
        "players": players,
        "dealer_index": dealer_index,
        "deck": deck,
        "hole_cards": hole,
        "community": [],
        "stacks": stacks,
        "pot": BLIND_SMALL + BLIND_BIG,
        "current_bet": BLIND_BIG,
        "contributions": contributions,
        "current_round": "pre-flop",
        "current_player": players[(bb_i + 1) % len(players)],
        "started": True,
        "usernames": game_states.get(table_id, {}).get("usernames", {}),
    }


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    """Обрабатывает действия игроков и переключает раунды торговли."""
    state = game_states.get(table_id)
    # если стола нет или юзер не за столом — игнорируем
    if not state or uid not in state["stacks"]:
        return

    # enforce turn: только current_player может делать действие
    if state["current_player"] != uid:
        return
        
    stacks = state["stacks"]
    contrib = state["contributions"]
    cb = state["current_bet"]

    # Основные действия
    if action == "call":
        to_call = cb - contrib[uid]
        if stacks[uid] >= to_call:
            stacks[uid] -= to_call
            state["pot"] += to_call
            contrib[uid] += to_call

    elif action == "check":
        if contrib[uid] != cb:
            return

    elif action == "fold":
        stacks[uid] = 0

    elif action == "bet":
        if amount > cb and stacks[uid] >= amount:
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount

    elif action == "raise":
        if amount > cb and stacks[uid] >= (amount - contrib[uid]):
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount

    # Перевод хода
    active = [p for p, st in stacks.items() if st > 0]
    idx = active.index(state["current_player"])
    state["current_player"] = active[(idx + 1) % len(active)]

    # Переход улицы, если все сравнялись
    if all(contrib[p] == state["current_bet"] for p in active):
        deck = state["deck"]
        rnd  = state["current_round"]

        if rnd == "pre-flop":
            deck.pop()  # burn
            state["community"] = [deck.pop() for _ in range(3)]
            state["current_round"] = "flop"
        elif rnd == "flop":
            deck.pop()
            state["community"].append(deck.pop())
            state["current_round"] = "turn"
        elif rnd == "turn":
            deck.pop()
            state["community"].append(deck.pop())
            state["current_round"] = "river"
        elif rnd == "river":
            state["current_round"] = "showdown"

        # Сброс ставок для нового раунда
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}
        # Ход игрока слева от дилера
        players = state["players"]
        next_idx = (state["dealer_index"] + 1) % len(players)
        state["current_player"] = players[next_idx]
