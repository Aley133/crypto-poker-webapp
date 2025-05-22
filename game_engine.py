import random
from typing import Dict, List, Set
from game_data import seat_map

# В памяти: состояния столов и WS-соединения
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
MIN_PLAYERS    = 2

# Раунды
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
      - Ротация дилера, постинг блайндов
      - Раздача карманных карт
      - Сброс историй действий
      - Начало pre-flop
    """
    state = game_states.get(table_id, {})
    players = state.get("players", [])
    if len(players) < MIN_PLAYERS:
        game_states.pop(table_id, None)
        return

    prev_usernames = state.get("usernames", {})
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

    pot = BLIND_SMALL + BLIND_BIG
    first_to_act = players[(bb_i + 1) % len(players)]

    # Инициализируем историю действий для нового раунда
    acted: Set[str] = set()

    # Обновляем состояние
    state.update({
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
        "acted": acted,
    })

    # Очистка прошлых результатов
    for k in ["winner", "game_over", "game_over_reason", "revealed_hands"]:
        state.pop(k, None)

    game_states[table_id] = state


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока и переключает раунды торговли:
      - call/check/fold/bet/raise
      - чередование ходов
      - переходы улиц только после действий всех
      - обработка fold и showdown с рестартом
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
    acted: Set[str] = state.get("acted", set())
    active = [p for p, s in stacks.items() if s > 0]

    # 1) Fold — автоматическая победа
    if action == "fold":
        state["folds"][uid] = True
        opponent = next(pid for pid in state["players"] if pid != uid)
        state.update({
            "winner": opponent,
            "game_over": True,
            "game_over_reason": "fold",
            "revealed_hands": {uid: state["hole_cards"][uid], opponent: state["hole_cards"][opponent]},
            "started": False,
        })
        # Рестарт
        if len(state["players"]) >= MIN_PLAYERS:
            start_hand(table_id)
        return

    # 2) Standard actions
    if action == "call":
        to_call = cb - contrib.get(uid, 0)
        if stacks[uid] >= to_call:
            stacks[uid] -= to_call
            state["pot"] += to_call
            contrib[uid] += to_call
    elif action == "check":
        if contrib.get(uid, 0) != cb:
            return
    elif action == "bet":
        if amount > cb and stacks[uid] >= amount:
            state["current_bet"] = amount
            diff = amount - contrib.get(uid, 0)
            stacks[uid] -= diff
            state["pot"] += diff
            contrib[uid] = amount
    elif action == "raise":
        need = amount - contrib.get(uid, 0)
        if amount > cb and stacks[uid] >= need:
            state["current_bet"] = amount
            stacks[uid] -= need
            state["pot"] += need
            contrib[uid] = amount
    else:
        return

    # Добавляем игрока в список уже сделавших ход
    acted.add(uid)
    state["acted"] = acted

    # 3) Чередование
    if len(active) == 2:
        a, b = active
        next_player = b if uid == a else a
    else:
        idx = active.index(uid)
        next_player = active[(idx + 1) % len(active)]
    state["current_player"] = next_player

    # 4) Переход улицы: когда все активные игроки совершили ход
    if acted >= set(active):
        # Сброс истории действий
        state["acted"] = set()
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
            # Showdown: раскрываем все карты и определяем победителя
            state["revealed_hands"] = {pid: state["hole_cards"][pid] for pid in state["players"]}
            # TODO: реализовать сравнение комбинаций и определить winner
            state["winner"] = state["players"][0]
            state["game_over"] = True
            state["game_over_reason"] = "showdown"
            state["started"] = False
            if len(state["players"]) >= MIN_PLAYERS:
                start_hand(table_id)
            return
        # После флопа/терна/ривера готовимся к следующему кругу ставок
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}

    game_states[table_id] = state
