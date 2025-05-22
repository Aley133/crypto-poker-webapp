import random
from typing import Dict, List
from game_data import seat_map

# В памяти: состояние столов и WS-соединения
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Константы
STARTING_STACK = 1000
BLIND_SMALL    = 1
BLIND_BIG      = 2
ROUNDS         = ["pre-flop", "flop", "turn", "river", "showdown"]


def new_deck() -> List[str]:
    """Генерирует и перемешивает новую колоду из 52 карт."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """
    Запускает новую раздачу:
      - ротация дилера
      - автоматический постинг блайндов
      - раздача карманных карт
      - установка pre-flop
    """
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < 2:
        return

    prev_dealer = game_states.get(table_id, {}).get("dealer_index", -1)
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

    contributions = {
        uid: (BLIND_SMALL if uid == sb_uid else BLIND_BIG if uid == bb_uid else 0)
        for uid in players
    }

    first_to_act = players[(bb_i + 1) % len(players)]

    game_states[table_id] = {
        "players": players,
        "dealer_index": dealer_index,
        "deck": deck,
        "hole_cards": hole_cards,
        "community": [],
        "stacks": stacks,
        "pot": BLIND_SMALL + BLIND_BIG,
        "current_bet": BLIND_BIG,
        "contributions": contributions,
        "current_round": "pre-flop",
        "current_player": first_to_act,
        "started": True,
        "usernames": game_states.get(table_id, {}).get("usernames", {}),
    }


def apply_action(table_id: int, uid: str, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока и переключает раунды торговли:
      - только если uid == current_player
      - call/check/fold/bet/raise
      - чередование между двумя игроками
      - автоматическое выкладывание flop/turn/river/showdown
    """
    state = game_states.get(table_id)
    if not state:
        return

    uid = str(uid)
    if uid not in state["stacks"]:
        return

    # Только текущий игрок может ходить
    if state["current_player"] != uid:
        return

    stacks  = state["stacks"]
    contrib = state["contributions"]
    cb      = state["current_bet"]

    # 1) Выполняем действие
    if action == "call":
        to_call = cb - contrib[uid]
        if stacks[uid] >= to_call:
            stacks[uid]     -= to_call
            state["pot"]    += to_call
            contrib[uid]    += to_call

    elif action == "check":
        if contrib[uid] != cb:
            return

    # Обработка сброса (fold)
    if action == 'fold':
        # Помечаем фолд текущего игрока
        state.setdefault('folds', {})[player_id] = True

        # Находим оппонента
        opponent = next(pid for pid in state['players'] if pid != player_id)

        # Формируем финальный массив общих карт (community + оставшиеся)
        remaining = state.get('remaining_cards', [])
        final_board = state.get('community', []) + remaining

        # Обновляем state для конца игры
        state['community'] = final_board
        state['winner'] = opponent
        state['game_over'] = True
        state['game_over_reason'] = 'fold'

        # Составляем раскрытые руки
        # hole_cards хранится в state
        state['revealed_hands'] = {
            player_id: state['hole_cards'].get(player_id, []),
            opponent: state['hole_cards'].get(opponent, [])
        }

        # Очищаем флаг started для следующей раздачи
        state['started'] = False
        return

    elif action == "bet":
        if amount > cb and stacks[uid] >= amount:
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid]    -= diff
            state["pot"]   += diff
            contrib[uid]   = amount

    elif action == "raise":
        if amount > cb and stacks[uid] >= (amount - contrib[uid]):
            state["current_bet"] = amount
            diff = amount - contrib[uid]
            stacks[uid]    -= diff
            state["pot"]   += diff
            contrib[uid]   = amount

    else:
        return

    # 2) Чередование хода
    active = [p for p, s in stacks.items() if s > 0]
    if len(active) == 2:
        # если двое — просто переключаем
        a, b = active
        state["current_player"] = b if uid == a else a
    else:
        idx = active.index(uid)
        state["current_player"] = active[(idx + 1) % len(active)]

    # 3) Переход улицы, если все сравняли вклад
    if all(contrib[p] == state["current_bet"] for p in active):
        rnd = state["current_round"]
        deck = state["deck"]

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

        # Сброс для нового раунда
        state["current_bet"] = 0
        state["contributions"] = {p: 0 for p in active}
        # current_player остаётся тем, кто ходил последним
