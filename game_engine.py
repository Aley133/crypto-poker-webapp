import random
import time
from typing import Dict, List, Set, Tuple

from game_data import seat_map  # Удалите, если действительно не используете

# ---------- Хранилища состояний и WS‐соединений ----------
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# ---------- Константы ----------
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
MIN_PLAYERS    = 2

# Время показа результата перед новой раздачей
RESULT_DELAY   = 5
# Время на ход игрока (секунды)
DECISION_TIME  = 30  

# Порядок улиц
ROUNDS = ["pre-flop", "flop", "turn", "river", "showdown"]

# Ранжирование комбинаций (используется в функции evaluate_hand)
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
    """
    Генерирует и тасует новую колоду карт.
    """
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    deck = [r + s for r in ranks for s in SUITS]
    random.shuffle(deck)
    return deck


def evaluate_hand(cards: List[str]) -> Tuple[int, List[int]]:
    """
    Оценивает руку из списка карт (hole + community).
    Возвращает кортеж (ранг_комбинации, tiebreaker_list).
    """
    vals = [RANK_ORDER[c[:-1]] for c in cards]
    suits = [c[-1] for c in cards]
    vals.sort(reverse=True)

    # Пытаемся найти флеш
    flush_suit = next((s for s in SUITS if suits.count(s) >= 5), None)
    flush_cards = (
        sorted(
            [v for v, su in zip(vals, suits) if su == flush_suit],
            reverse=True
        )[:5]
    ) if flush_suit else []

    # Ищем стрит
    unique_vals = sorted(set(vals), reverse=True)
    straight_high = 0
    for i in range(len(unique_vals) - 4):
        window = unique_vals[i:i+5]
        if window[0] - window[-1] == 4:
            straight_high = window[0]
            break
    # Специальный случай «колесо» (A-2-3-4-5)
    if set([14, 5, 4, 3, 2]).issubset(unique_vals):
        straight_high = 5

    # Группируем по количеству совпадений (для пар/сетов/etc)
    counts = {v: vals.count(v) for v in set(vals)}
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)

    # Определяем категорию руки и tiebreaker
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
    """
    Начинает новую раздачу: раздаёт hole‐карты, выставляет блайнды, инициализирует стейт.
    """
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
    # Списываем блайнды
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
        "current_round": ROUNDS[0],  # "pre-flop"
        "current_player": players[(bb + 1) % len(players)],  # первый ход после big blind
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
    stacks = state["stacks"]                    # {uid: стек}
    contrib = state["contributions"]            # {uid: сумма, внесённая в банк на этой улице}
    folds = set(state.get("folds", set()))      # множество тех, кто сделал fold
    cb = state.get("current_bet", 0)            # текущая ставка (для call/check)
    deadline = state.get("timer_deadline", now)

    # Если время на ход вышло — считаем fold
    if now > deadline:
        action = "fold"

    # Проверяем, что именно этот игрок сейчас ходит
    if uid not in stacks or state.get("current_player") != uid:
        return

    # === 1) Обработка fold ===
    if action == "fold":
        folds.add(uid)
        state["folds"] = folds

        # Если после fold остался только один игрок — шоудаун
        alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
        if len(alive) == 1:
            winner = alive[0]
            # Раскрываем все hole‐карты для UI
            revealed = {p: state["hole_cards"].get(p, []) for p in state["hole_cards"].keys()}
            state.update({
                "revealed_hands": revealed,
                "winner": winner,
                "game_over": True,
                "game_over_reason": "fold",
                "split_pots": {winner: state.get("pot", 0)},
                "phase": "result",
                "result_delay_deadline": time.time() + RESULT_DELAY,
                "started": False,
            })
            return

        # Передаём ход следующему за uid игроку
        idx = players.index(uid)
        for i in range(1, len(players)):
            cand = players[(idx + i) % len(players)]
            if cand not in folds and stacks.get(cand, 0) > 0:
                state["current_player"] = cand
                break
        state["timer_deadline"] = now + DECISION_TIME

    # === 2) Обработка check / call / bet / raise ===
    elif action == "check":
        # Нельзя чекать, если вклад меньше текущей ставки
        if contrib.get(uid, 0) != cb:
            return

    elif action == "call":
        needed = cb - contrib.get(uid, 0)
        to_call = min(needed, stacks[uid])
        stacks[uid] -= to_call
        state["pot"] += to_call
        contrib[uid] += to_call

    # === Новая логика для “bet/raise” ===
    # Теперь “bet” или “raise” обрабатываются едино: 
    # - если cb > 0 и amount == cb, это считается call‐ом (complete the bet);
    # - если cb > 0 и amount > cb, это raise;
    # - если cb == 0 и amount > 0, это настоящий bet.
    elif action in ("bet", "raise"):
        if cb > 0:
            if amount == cb:
                # Это complete bet (call)
                needed = cb - contrib.get(uid, 0)
                to_call = min(needed, stacks[uid])
                stacks[uid] -= to_call
                state["pot"] += to_call
                contrib[uid] += to_call
            elif amount > cb and stacks.get(uid, 0) >= (amount - contrib.get(uid, 0)):
                # Это raise
                state["current_bet"] = amount
                diff = amount - contrib.get(uid, 0)
                stacks[uid] -= diff
                state["pot"] += diff
                contrib[uid] = amount
            else:
                return
        else:
            # cb == 0 → это настоящий bet (первый в этой улице)
            if amount > 0 and stacks.get(uid, 0) >= amount:
                state["current_bet"] = amount
                diff = amount - contrib.get(uid, 0)
                stacks[uid] -= diff
                state["pot"] += diff
                contrib[uid] = amount
            else:
                return

    else:
        # Некорректное действие (например, попытка bet < cb, или call без достаточного вклада) — выходим
        return

    # Сохраняем изменения в стеках и вкладе
    state["stacks"] = stacks
    state["contributions"] = contrib

    # === 3) Логика учёта сделанных ходов (state["acted"]) ===
    if action in ("bet", "raise"):
        # Начинаем новый круг торгов: сбрасываем прежнее и «записываем» только этого игрока
        state["acted"] = {uid}
    else:
        acted = set(state.get("acted", set()))
        acted.add(uid)
        state["acted"] = acted

    state["timer_deadline"] = now + DECISION_TIME

    # === 4) Проверка: завершился ли круг торгов? ===
    alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
    if state["acted"] >= set(alive):
        # Круг торгов окончен — переходим на следующую улицу
        state["acted"] = set()
        state["timer_deadline"] = now + DECISION_TIME

        rnd = state.get("current_round")
        deck = state.get("deck", [])
        idx = ROUNDS.index(rnd)

        # === СБРОС ВКЛАДОВ И СТАВКИ ПРИ СМЕНЕ УЛИЦЫ ===
        # На новой улице все вклады начинаются заново, текущая ставка обнуляется.
        # То есть contributions[p] = 0 для всех живых, current_bet = 0.
        state["current_bet"] = 0
        for p in alive:
            state["contributions"][p] = 0

        # === Раздача community‐карт (флоп/терн/ривер) ===
        if rnd in ["pre-flop", "flop", "turn"]:
            # Сжигаем картинку
            if deck:
                deck.pop()
            # Выкладываем 3 карты на флоп или 1 карту на терн/ривер
            cnt = 3 if rnd == "pre-flop" else 1
            for _ in range(cnt):
                if deck:
                    state["community"].append(deck.pop())
            # Переход к следующему раунду
            state["current_round"] = ROUNDS[idx + 1]
        elif rnd == "river":
            # После ривера сразу шоудаун
            state["current_round"] = "showdown"

        state["deck"] = deck

    # === 5) Шоудаун, если новая улица — showdown ===
    if state.get("current_round") == "showdown":
        alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]

        # Собираем полные руки (hole + community)
        hands = {}
        for p in state["hole_cards"].keys():
            hole = state["hole_cards"].get(p, [])
            boards = state["community"]
            hands[p] = hole + boards

        # Оцениваем каждую руку
        scores = {p: evaluate_hand(hands[p]) for p in hands.keys()}
        best_rank = max(score[0] for score in scores.values())
        contenders = [p for p, score in scores.items() if score[0] == best_rank]
        max_tb = max(scores[p][1] for p in contenders)
        winners = [p for p in contenders if scores[p][1] == max_tb]

        pot_total = state.get("pot", 0)
        share, rem = divmod(pot_total, len(winners))
        split = {w: share for w in winners}
        if rem:
            # Остаток получает дилер
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
            "started": False,
        })
        game_states[table_id] = state
        return

    # === 6) Передаём ход следующему игроку (если игра не закончена) ===
    alive = [p for p in players if p not in folds and stacks.get(p, 0) > 0]
    if len(alive) > 1 and uid in alive:
        idx_alive = alive.index(uid)
        state["current_player"] = alive[(idx_alive + 1) % len(alive)]

    # === 7) “Пузырёк” для UI: сохраняем последнее действие игрока ===
    state.setdefault("player_actions", {})
    state["player_actions"][uid] = {
        "type": action,
        "amount": amount if action in ("bet", "raise") else None,
        "ts": now
    }
    # Удаляем старые действия старше 1.8 сек
    state["player_actions"] = {
        k: v for k, v in state["player_actions"].items()
        if now - v["ts"] < 1.8
    }

    # === 8) Сохраняем обновлённое состояние ===
    game_states[table_id] = state
    return {"status": "action applied"}
