import random
import time
from typing import Dict, List, Set, Tuple
from game_data import seat_map

# Хранилища состояний и WS-соединений
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
MIN_PLAYERS    = 2
# Время показа результата перед новой раздачей
RESULT_DELAY   = 5
DECISION_TIME  = 30  # секута на ход

# Порядок улиц
ROUNDS = ["pre-flop", "flop", "turn", "river", "showdown"]

# Ранжирование комбинаций
HAND_RANKS = {
    'high_card': 1,
    'one_pair': 2,
    'two_pair': 3,
    'three_of_a_kind': 4,
    'straight': 5,
    'flush': 6,
    'full_house': 7,
    'four_of_a_kind': 8,
    'straight_flush': 9,
}
RANK_ORDER = {r: i for i, r in enumerate(
    ['2','3','4','5','6','7','8','9','10','J','Q','K','A'], start=2)}
SUITS = ['♠','♥','♦','♣']


def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    deck = [r + s for r in ranks for s in SUITS]
    random.shuffle(deck)
    return deck


def evaluate_hand(cards: List[str]) -> Tuple[int, List[int]]:
    vals = [RANK_ORDER[c[:-1]] for c in cards]
    suits = [c[-1] for c in cards]
    vals.sort(reverse=True)
    flush_suit = next((s for s in SUITS if suits.count(s) >= 5), None)
    flush_cards = sorted(
        [v for v, su in zip(vals, suits) if su == flush_suit],
        reverse=True)[:5] if flush_suit else []

    unique_vals = sorted(set(vals), reverse=True)
    straight_high = 0
    for i in range(len(unique_vals) - 4):
        window = unique_vals[i:i+5]
        if window[0] - window[-1] == 4:
            straight_high = window[0]
            break
    if set([14, 5, 4, 3, 2]).issubset(unique_vals):
        straight_high = 5

    counts = {v: vals.count(v) for v in set(vals)}
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)

    if flush_suit and straight_high:
        category, tiebreaker = 'straight_flush', [straight_high]
    elif groups[0][1] == 4:
        four = groups[0][0]
        kicker = max(v for v in vals if v != four)
        category, tiebreaker = 'four_of_a_kind', [four, kicker]
    elif groups[0][1] == 3 and groups[1][1] >= 2:
        category, tiebreaker = 'full_house', [groups[0][0], groups[1][0]]
    elif flush_suit:
        category, tiebreaker = 'flush', flush_cards
    elif straight_high:
        category, tiebreaker = 'straight', [straight_high]
    elif groups[0][1] == 3:
        th = groups[0][0]
        kickers = sorted([v for v in vals if v != th], reverse=True)[:2]
        category, tiebreaker = 'three_of_a_kind', [th] + kickers
    elif groups[0][1] == 2 and groups[1][1] == 2:
        hp, lp = groups[0][0], groups[1][0]
        kicker = max(v for v in vals if v not in (hp, lp))
        category, tiebreaker = 'two_pair', [hp, lp, kicker]
    elif groups[0][1] == 2:
        pair = groups[0][0]
        kickers = sorted([v for v in vals if v != pair], reverse=True)[:3]
        category, tiebreaker = 'one_pair', [pair] + kickers
    else:
        category, tiebreaker = 'high_card', vals[:5]

    return HAND_RANKS[category], tiebreaker


def start_hand(table_id: int):
    state = game_states.get(table_id)
    if not state:
        return
    players = state.get("players", [])
    if len(players) < MIN_PLAYERS:
        game_states.pop(table_id, None)
        return

    prev = state.get("dealer_index", -1)
    dealer = (prev + 1) % len(players)
    sb, bb = (dealer + 1) % len(players), (dealer + 2) % len(players)
    sb_uid, bb_uid = players[sb], players[bb]

    deck = new_deck()
    hole = {u: [deck.pop(), deck.pop()] for u in players}

    stacks = {u: STARTING_STACK for u in players}
    stacks[sb_uid] -= BLIND_SMALL
    stacks[bb_uid] -= BLIND_BIG

    contributions = {u: 0 for u in players}
    contributions[sb_uid] = BLIND_SMALL
    contributions[bb_uid] = BLIND_BIG

    state.update({
        "dealer_index": dealer,
        "deck": deck,
        "hole_cards": hole,
        "community": [],
        "stacks": stacks,
        "pot": BLIND_SMALL + BLIND_BIG,
        "current_bet": BLIND_BIG,
        "contributions": contributions,
        "current_round": ROUNDS[0],
        "current_player": players[(bb + 1) % len(players)],
        "started": True,
        "folds": set(),
        "acted": set(),
        "timer_deadline": time.time() + DECISION_TIME,
        "split_pots": {},
    })

    state["phase"] = "pre-flop"
    state.pop("result_delay_deadline", None)
    for k in ("winner", "game_over", "game_over_reason", "revealed_hands", "split_pots"):
        state.pop(k, None)

    game_states[table_id] = state


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    now = time.time()
    state = game_states.get(table_id)
    if not state:
        return
    uid = str(uid)
    players = state.get("players", [])
    stacks = state["stacks"]
    contrib = state["contributions"]
    folds = set(state.get("folds", set()))
    cb = state.get("current_bet", 0)
    deadline = state.get("timer_deadline", now)

    if now > deadline:
        action = "fold"

    if uid not in stacks or state.get("current_player") != uid:
        return

    if action == "fold":
        folds.add(uid)
        state["folds"] = folds
        # Фильтруем игроков по наличию стека и не в fold
        alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
        if len(alive) == 1:
            winner = alive[0]
            # раскрываем только те руки, которые были разданы
            revealed = {p: state["hole_cards"].get(p, []) for p in state["hole_cards"].keys()}
            state.update({
                "revealed_hands": revealed,
                "winner": winner,
                "game_over": True,
                "game_over_reason": "fold",
                "split_pots": {winner: state.get("pot", 0)},
                "phase": "result",
                "result_delay_deadline": time.time() + RESULT_DELAY,
            })
            state["started"] = False
            return
        idx = players.index(uid)
        for i in range(1, len(players)):
            cand = players[(idx + i) % len(players)]
            if cand not in folds and stacks.get(cand, 0) > 0:
                state["current_player"] = cand
                break
        state["timer_deadline"] = now + DECISION_TIME

    # Обработка ставок и коллов
    if action == "check":
        if contrib.get(uid, 0) != cb:
            return
    elif action == "call":
        to_call = cb - contrib.get(uid, 0)
        stacks[uid] -= to_call
        state["pot"] += to_call
        contrib[uid] += to_call
    elif action == "bet" and amount > cb and stacks.get(uid, 0) >= amount:
        state["current_bet"] = amount
        diff = amount - contrib.get(uid, 0)
        stacks[uid] -= diff
        state["pot"] += diff
        contrib[uid] = amount
    elif action == "raise" and amount > cb and stacks.get(uid, 0) >= (amount - contrib.get(uid, 0)):
        state["current_bet"] = amount
        diff = amount - contrib.get(uid, 0)
        stacks[uid] -= diff
        state["pot"] += diff
        contrib[uid] = amount
    else:
        return

    acted = set(state.get("acted", set()))
    acted.add(uid)
    state["acted"] = acted
    state["timer_deadline"] = now + DECISION_TIME

    # Переход улицы
    alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
    if acted >= set(alive):
        state["acted"] = set()
        state["timer_deadline"] = now + DECISION_TIME
        rnd = state.get("current_round")
        deck = state.get("deck", [])
        idx = ROUNDS.index(rnd)
        if rnd in ["pre-flop", "flop","turn"]:
            deck.pop()
            cnt = 3 if rnd == "pre-flop" else 1
            state["community"] += [deck.pop() for _ in range(cnt)]
            state["current_round"] = ROUNDS[idx + 1]
        elif rnd == "river":
            state["current_round"] = "showdown"

    # Showdown
    if state.get("current_round") == "showdown":
        alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
        # раскрываем только те руки, которые были разданы
        hands = {p: state["hole_cards"].get(p, []) + state["community"] for p in state["hole_cards"].keys()}
        scores = {p: evaluate_hand(h) for p, h in hands.items()}
        best_rank = max(s[0] for s in scores.values())
        candidates = [p for p, s in scores.items() if s[0] == best_rank]
        max_tb = max(scores[p][1] for p in candidates)
        winners = [p for p in candidates if scores[p][1] == max_tb]
        pot = state.get("pot", 0)
        share, rem = divmod(pot, len(winners))
        split = {w: share for w in winners}
        if rem:
            dealer = players[state["dealer_index"]]
            split[dealer] = split.get(dealer, 0) + rem

        state.update({
            "revealed_hands": hands,
            "winner": winners[0] if len(winners) == 1 else winners,
            "split_pots": split,
            "game_over": True,
            "game_over_reason": "showdown",
            "phase": "result",
            "result_delay_deadline": time.time() + RESULT_DELAY,
        })
        state["started"] = False

    # Смена игрока
    alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
    if len(alive) > 1 and uid in alive:
        ai = alive.index(uid)
        state["current_player"] = alive[(ai + 1) % len(alive)]

    # фиксируем действие игрока (bubble для UI)
    state.setdefault("player_actions", {})
    state["player_actions"][uid] = {
        "type": action,
        "amount": amount if action in ("bet", "raise") else None,
        "ts": time.time()
    }
   # Оставляем только свежие действия (1.8 сек)
   state["player_actions"] = {
       k: v for k, v in state["player_actions"].items()
       if time.time() - v["ts"] < 1.8
   }

    game_states[table_id] = state
