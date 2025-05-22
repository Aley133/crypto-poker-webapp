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

    # Ротация дилера
    prev_dealer = state.get("dealer_index", -1)
    dealer_index = (prev_dealer + 1) % len(players)

    # Определяем small/big blind
    sb_i = (dealer_index + 1) % len(players)
    bb_i = (dealer_index + 2) % len(players)
    sb_uid = players[sb_i]
    bb_uid = players[bb_i]

    # Колода и карманные карты
    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Стеки и блайнды
    stacks = {uid: STARTING_STACK for uid in players}
    stacks[sb_uid] -= BLIND_SMALL
    stacks[bb_uid] -= BLIND_BIG

    contributions = {uid: 0 for uid in players}
    contributions[sb_uid] = BLIND_SMALL
    contributions[bb_uid] = BLIND_BIG

    # Начальные параметры
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
        "folds": set(),        # players who folded this hand
        "acted": set(),        # players who acted on current street
    })
    # Удаляем прошлые результаты
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

    # Пропускаем нерелевантные
    if uid not in state.get("stacks", {}):
        return
    if state.get("current_player") != uid:
        return

    # Списки игроков
    players: List[str] = state.get("players", [])
    folds: Set[str] = set(state.get("folds", set()))
    active = [p for p in players if p not in folds and state["stacks"].get(p, 0) > 0]

    # 1) Fold
    if action == "fold":
        folds.add(uid)
        state["folds"] = folds

        # Если остался единственный
        remaining = [p for p in active if p != uid]
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
        # Иначе передаём ход следующему
        next_idx = active.index(uid)
        state["current_player"] = remaining[next_idx % len(remaining)]
        return

    # 2) Standard actions
    contrib = state["contributions"]
    cb = state.get("current_bet", 0)
    stacks = state["stacks"]

    if action == "check":
        if contrib[uid] != cb:
            return
    elif action == "call":
        to_call = cb - contrib[uid]
        if stacks[uid] >= to_call:
            stacks[uid] -= to_call
            state["pot"] += to_call
            contrib[uid] += to_call
    elif action == "bet":
        if amount > cb and stacks[uid] >= amount:
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount
    elif action == "raise":
        need = amount - contrib[uid]
        if amount > cb and stacks[uid] >= need:
            state["current_bet"] = amount
            stacks[uid] -= need
            state["pot"] += need
            contrib[uid] = amount
    else:
        return

    # Отмечаем ход
    acted: Set[str] = set(state.get("acted", set()))
    acted.add(uid)
    state["acted"] = acted

    # 3) Переход улицы, если все активные сделали ход
    if acted >= set(active):
        state["acted"] = set()
        rnd = state.get("current_round")
        deck = state.get("deck", [])
        cur_idx = ROUNDS.index(rnd)

        # Burn + deal next street
        if rnd in ["pre-flop", "flop", "turn"]:
            deck.pop()
            count = 3 if rnd == "pre-flop" else 1
            state["community"] += [deck.pop() for _ in range(count)]
            state["current_round"] = ROUNDS[cur_idx + 1]
        elif rnd == "river":
            state["current_round"] = "showdown"
        # Showdown
        if state["current_round"] == "showdown":
            state["revealed_hands"] = {p: state["hole_cards"][p] for p in players}
            # TODO: реализовать сравнение покерных комбинаций
            state["winner"] = active[0]
            state["game_over"] = True
            state["game_over_reason"] = "showdown"
            state["started"] = False
            if len(players) >= MIN_PLAYERS:
                start_hand(table_id)
            return
        # Сброс ставок и вкладов
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}

    # 4) Чередование хода
    active = [p for p in players if p not in folds and state["stacks"].get(p, 0) > 0]
    if len(active) > 1:
        idx = active.index(uid)
        state["current_player"] = active[(idx + 1) % len(active)]

    game_states[table_id] = state
