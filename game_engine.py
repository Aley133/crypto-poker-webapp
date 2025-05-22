import random
from typing import Dict, List, Set, Optional
from game_data import seat_map

# Хранилища состояний и WS-соединений
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
MIN_PLAYERS    = 2

# Порядок улиц
ROUNDS = ["pre-flop", "flop", "turn", "river", "showdown"]


def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """
    Запускает новую раздачу: дилер, блайнды, раздача карт, сброс состояния.
    """
    state = game_states.get(table_id)
    if not state:
        return
    players: List[str] = state.get("players", [])
    if len(players) < MIN_PLAYERS:
        game_states.pop(table_id, None)
        return

    prev_dealer = state.get("dealer_index", -1)
    dealer_index = (prev_dealer + 1) % len(players)
    sb_i = (dealer_index + 1) % len(players)
    bb_i = (dealer_index + 2) % len(players)
    sb_uid = players[sb_i]
    bb_uid = players[bb_i]

    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    stacks = {uid: STARTING_STACK for uid in players}
    stacks[sb_uid] -= BLIND_SMALL
    stacks[bb_uid] -= BLIND_BIG

    contributions = {uid: 0 for uid in players}
    contributions[sb_uid] = BLIND_SMALL
    contributions[bb_uid] = BLIND_BIG

    state.update({
        "dealer_index": dealer_index,
        "deck": deck,
        "hole_cards": hole_cards,
        "community": [],
        "stacks": stacks,
        "pot": BLIND_SMALL + BLIND_BIG,
        "current_bet": BLIND_BIG,
        "contributions": contributions,
        "current_round": ROUNDS[0],
        "current_player": players[(bb_i + 1) % len(players)],
        "started": True,
        "folds": set(),
        "acted": set(),
    })
    for k in ["winner", "game_over", "game_over_reason", "revealed_hands"]:
        state.pop(k, None)

    game_states[table_id] = state


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    """
    Обрабатывает ход: fold, check, call, bet, raise;
    переключает текущего игрока, улицы и завершает/рестартит раздачу.
    """
    state = game_states.get(table_id)
    if not state:
        return
    uid = str(uid)

    players: List[str] = state.get("players", [])
    if uid not in state.get("stacks", {}):
        return
    if state.get("current_player") != uid:
        return

    folds: Set[str] = set(state.get("folds", set()))
    stacks: Dict[str, int] = state.get("stacks", {})
    contrib: Dict[str, int] = state.get("contributions", {})
    cb = state.get("current_bet", 0)

    # 1) Fold
    if action == "fold":
        folds.add(uid)
        state["folds"] = folds
        remaining = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
        # Если остался один — завершаем руку
        if len(remaining) == 1:
            winner = remaining[0]
            state.update({
                "winner": winner,
                "game_over": True,
                "game_over_reason": "fold",
                "revealed_hands": {p: state["hole_cards"][p] for p in players},
                "started": False,
            })
            if len(players) >= MIN_PLAYERS:
                start_hand(table_id)
            return
        # Иначе находим следующего активного в порядке players
        idx = players.index(uid)
        for offset in range(1, len(players)):
            cand = players[(idx + offset) % len(players)]
            if cand not in folds and stacks.get(cand, 0) > 0:
                state["current_player"] = cand
                break
        return

    # 2) Check
    if action == "check":
        if contrib.get(uid, 0) != cb:
            return
    # 3) Call
    elif action == "call":
        to_call = cb - contrib.get(uid, 0)
        if stacks.get(uid, 0) >= to_call:
            stacks[uid] -= to_call
            state["pot"] += to_call
            contrib[uid] += to_call
    # 4) Bet
    elif action == "bet":
        if amount > cb and stacks.get(uid, 0) >= amount:
            state["current_bet"] = amount
            diff = amount - contrib.get(uid, 0)
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount
    # 5) Raise
    elif action == "raise":
        need = amount - contrib.get(uid, 0)
        if amount > cb and stacks.get(uid, 0) >= need:
            state["current_bet"] = amount
            stacks[uid] -= need
            state["pot"] += need
            contrib[uid] = amount
    else:
        return

    # 6) Отмечаем ход
    acted: Set[str] = set(state.get("acted", set()))
    acted.add(uid)
    state["acted"] = acted

    # 7) Переход улицы, когда все активные сделали ход
    active = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
    if acted >= set(active):
        state["acted"] = set()
        rnd = state.get("current_round")
        deck = state.get("deck", [])
        idx = ROUNDS.index(rnd)
        # Burn и раздать следующий
        if rnd in ["pre-flop", "flop", "turn"]:
            deck.pop()
            count = 3 if rnd == "pre-flop" else 1
            state["community"] += [deck.pop() for _ in range(count)]
            state["current_round"] = ROUNDS[idx + 1]
        elif rnd == "river":
            state["current_round"] = "showdown"
        if state["current_round"] == "showdown":
            state["revealed_hands"] = {p: state["hole_cards"][p] for p in players}
            state["winner"] = active[0]  # TODO: сравнение комбинаций
            state["game_over"] = True
            state["game_over_reason"] = "showdown"
            state["started"] = False
            if len(players) >= MIN_PLAYERS:
                start_hand(table_id)
            return
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}

    # 8) Чередование хода
    if len(active) > 1:
        idx = active.index(uid)
        state["current_player"] = active[(idx + 1) % len(active)]

    game_states[table_id] = state
