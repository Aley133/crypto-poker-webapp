import random
from typing import Dict, List
from game_data import seat_map

# В памяти: состояния столов и WebSocket-соединения
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
MIN_PLAYERS    = 2  # минимальное число для старта новой раздачи

# Типы раундов
ROUNDS = ["pre-flop", "flop", "turn", "river", "showdown"]


def new_deck() -> List[str]:
    """Генерирует и перемешивает колоду из 52 карт."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """
    Запускает новую раздачу:
      - Ротация дилера и блайндов
      - Раздача карманных карт
      - Начало pre-flop
    """
    prev = game_states.get(table_id, {})
    players = prev.get("players") or [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < MIN_PLAYERS:
        game_states.pop(table_id, None)
        return

    prev_usernames = prev.get("usernames", {})
    prev_dealer = prev.get("dealer_index", -1)
    dealer_index = (prev_dealer + 1) % len(players)

    sb_i = (dealer_index + 1) % len(players)
    bb_i = (dealer_index + 2) % len(players)
    sb_uid = players[sb_i]
    bb_uid = players[bb_i]

    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    stacks = {uid: STARTING_STACK for uid in players}
    stacks[sb_uid] = max(0, stacks[sb_uid] - BLIND_SMALL)
    stacks[bb_uid] = max(0, stacks[bb_uid] - BLIND_BIG)

    contributions = {uid: 0 for uid in players}
    contributions[sb_uid] = BLIND_SMALL
    contributions[bb_uid] = BLIND_BIG

    pot = BLIND_SMALL + BLIND_BIG
    first_to_act = players[(bb_i + 1) % len(players)]

    state = {
        "players": players,
        "dealer_index": dealer_index,
        "usernames": prev_usernames,
        "deck": deck,
        "hole_cards": hole_cards,
        "community": [],
        "stacks": stacks,
        "pot": pot,
        "current_bet": BLIND_BIG,
        "contributions": contributions,
        "current_round": "pre-flop",
        "current_player": first_to_act,
        "started": True,
        "folds": {},
    }
    for k in ["winner", "game_over", "game_over_reason", "revealed_hands"]:
        state.pop(k, None)

    game_states[table_id] = state


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока:
      - call/check/fold/bet/raise
      - чередование ходов
      - переходы улиц
      - fold и showdown с рестартом
    """
    state = game_states.get(table_id)
    if not state:
        return

    uid = str(uid)
    if uid not in state.get("stacks", {}):
        return

    if state.get("current_player") != uid:
        return

    stacks = state["stacks"]
    contrib = state["contributions"]
    cb = state.get("current_bet", 0)

    # Fold — автоматическая победа оппонента
    if action == "fold":
        state["folds"][uid] = True
        opponent = next(pid for pid in state["players"] if pid != uid)
        state["winner"] = opponent
        state["game_over"] = True
        state["game_over_reason"] = "fold"
        state["revealed_hands"] = {uid: state["hole_cards"][uid], opponent: state["hole_cards"][opponent]}
        state["started"] = False
        if len(state["players"]) >= MIN_PLAYERS:
            start_hand(table_id)
        return

    # Standard actions
    if action == "call":
        to_call = cb - contrib.get(uid, 0)
        if stacks.get(uid, 0) >= to_call:
            stacks[uid] -= to_call
            state["pot"] += to_call
            contrib[uid] += to_call
    elif action == "check":
        if contrib.get(uid, 0) != cb:
            return
    elif action == "bet":
        if amount > cb and stacks.get(uid, 0) >= amount:
            state["current_bet"] = amount
            diff = amount - contrib.get(uid, 0)
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount
    elif action == "raise":
        if amount > cb and stacks.get(uid, 0) >= (amount - contrib.get(uid, 0)):
            state["current_bet"] = amount
            diff = amount - contrib.get(uid, 0)
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount
    else:
        return

    # Чередование хода
    active = [p for p, s in stacks.items() if s > 0]
    if len(active) == 2:
        a, b = active
        state["current_player"] = b if uid == a else a
    else:
        idx = active.index(uid)
        state["current_player"] = active[(idx + 1) % len(active)]

    # Переход улицы при равных вкладах
    if all(contrib.get(p, 0) == state.get("current_bet", 0) for p in active):
        rnd = state.get("current_round")
        deck = state.get("deck", [])
        if rnd == "pre-flop":
            deck.pop()
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
            players = state["players"]
            state["revealed_hands"] = {pid: state["hole_cards"][pid] for pid in players}
            # TODO: сравнение комбинаций
            state["winner"] = players[0]
            state["game_over"] = True
            state["game_over_reason"] = "showdown"
            state["started"] = False
            if len(players) >= MIN_PLAYERS:
                start_hand(table_id)
            return
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}
