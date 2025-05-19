# game_engine.py
import random
from typing import Dict, List
from game_data import seat_map

# Хранение состояния столов и WS-соединений
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Настройки игры
STARTING_STACK = 1000
BLIND_SMALL = 1
BLIND_BIG = 2


def new_deck() -> List[str]:
    """
    Генерирует и перемешивает новую колоду из 52 карт.
    """
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """
    Запускает новую раздачу:
      - Ротация дилера
      - Постинг блайндов
      - Раздача карманных карт
      - Инициализация полей: deck, community, contributions и current_round
    """
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < 2:
        return

    state = game_states.get(table_id, {})
    prev_dealer = state.get('dealer_index', -1)
    dealer_index = (prev_dealer + 1) % len(players)

    sb = players[(dealer_index + 1) % len(players)]
    bb = players[(dealer_index + 2) % len(players)]

    # Инициализация стеков
    stacks = state.get('stacks', {uid: STARTING_STACK for uid in players})
    stacks[sb] = max(0, stacks.get(sb, STARTING_STACK) - BLIND_SMALL)
    stacks[bb] = max(0, stacks.get(bb, STARTING_STACK) - BLIND_BIG)

    # Ставки текущего раунда
    current_bet = BLIND_BIG
    contributions = {
        uid: (BLIND_SMALL if uid == sb else BLIND_BIG if uid == bb else 0)
        for uid in players
    }

    # Новый перемешанный deck и раздача карманных карт
    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Сохраняем состояние
    game_states[table_id] = {
        'players': players,
        'dealer_index': dealer_index,
        'deck': deck,
        'hole_cards': hole_cards,
        'community': [],
        'stacks': stacks,
        'pot': BLIND_SMALL + BLIND_BIG,
        'current_bet': current_bet,
        'contributions': contributions,
        'current_player': players[(players.index(bb) + 1) % len(players)],
        'current_round': 'pre-flop',
        'started': True,
        'usernames': state.get('usernames', {}),
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока (call, check, fold, bet, raise).
    После этого проверяет завершение раунда торговли и переходит к следующей улице.
    """
    uid = str(uid)
    state = game_states.get(table_id)
    if not state or uid not in state['stacks']:
        return

    stacks       = state['stacks']
    contributions = state['contributions']
    cb           = state['current_bet']

    # Ходы
    if action == 'call':
        to_call = cb - contributions[uid]
        if stacks[uid] >= to_call:
            stacks[uid] -= to_call
            state['pot'] += to_call
            contributions[uid] += to_call

    elif action == 'check':
        if contributions[uid] != cb:
            return

    elif action == 'fold':
        # Ставим стек=0, игрок выбыл
        stacks[uid] = 0

    elif action == 'bet':
        if amount > cb and stacks[uid] >= amount:
            state['current_bet'] = amount
            diff = amount - contributions[uid]
            stacks[uid] -= diff
            state['pot'] += diff
            contributions[uid] = amount

    elif action == 'raise':
        if amount > cb and stacks[uid] >= (amount - contributions[uid]):
            state['current_bet'] = amount
            diff = amount - contributions[uid]
            stacks[uid] -= diff
            state['pot'] += diff
            contributions[uid] = amount

    # Смена текущего игрока среди активных
    active = [p for p, st in stacks.items() if st > 0]
    if state['current_player'] in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]

    # Проверка конца раунда торговли
    if all(contributions[p] == state['current_bet'] for p in active):
        # Переходим к следующей улице
        deck = state['deck']
        if state['current_round'] == 'pre-flop':
            deck.pop()  # burn
            state['community'] = [deck.pop() for _ in range(3)]
            state['current_round'] = 'flop'
        elif state['current_round'] == 'flop':
            deck.pop()
            state['community'].append(deck.pop())
            state['current_round'] = 'turn'
        elif state['current_round'] == 'turn':
            deck.pop()
            state['community'].append(deck.pop())
            state['current_round'] = 'river'
        else:
            state['current_round'] = 'showdown'

        # Сброс ставок для нового раунда
        state['current_bet'] = 0
        state['contributions'] = {p: 0 for p in active}
        # Первый ход — слева от дилера
        dealer = state['dealer_index']
        players = state['players']
        start_idx = (players.index(str(dealer)) + 1) % len(players)
        # Найти следующего активного игрока
        for i in range(len(players)):
            p = players[(start_idx + i) % len(players)]
            if state['stacks'].get(p, 0) > 0:
                state['current_player'] = p
                break

    # Сохраняем state обратно
    game_states[table_id] = state

