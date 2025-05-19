# game_engine.py
import random
from typing import Dict, List, Set
from game_data import seat_map

# Состояние столов и WebSocket-соединения
game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

# Настройки игры
STARTING_STACK = 1000
BLIND_SMALL   = 1
BLIND_BIG     = 2


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
      - Инициализация deck, community, contributions, round_actions, current_round
    """
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    if len(players) < 2:
        return

    prev = game_states.get(table_id, {})
    prev_dealer = prev.get('dealer_index', -1)
    dealer_index = (prev_dealer + 1) % len(players)

    sb = players[(dealer_index + 1) % len(players)]
    bb = players[(dealer_index + 2) % len(players)]

    stacks = prev.get('stacks', {uid: STARTING_STACK for uid in players})
    stacks[sb] = max(0, stacks.get(sb, STARTING_STACK) - BLIND_SMALL)
    stacks[bb] = max(0, stacks.get(bb, STARTING_STACK) - BLIND_BIG)

    current_bet = BLIND_BIG
    contributions = {uid: (BLIND_SMALL if uid == sb else BLIND_BIG if uid == bb else 0) for uid in players}

    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Инициализация состояния
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
        'round_actions': set(),  # кто ходил в текущем раунде
        'current_player': players[(players.index(bb) + 1) % len(players)],
        'current_round': 'pre-flop',
        'started': True,
        'usernames': prev.get('usernames', {}),
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока и при необходимости переходит на следующую улицу.
    Логика раунда: call, check, fold, bet, raise.
    Перевод хода, учёт round_actions для полного раунда.
    """
    uid = str(uid)
    state = game_states.get(table_id)
    if not state or uid not in state['stacks']:
        return

    stacks = state['stacks']
    contributions = state['contributions']
    cb = state['current_bet']
    # помечаем, что игрок ходил
    state['round_actions'].add(uid)

    # Действия
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

    # Смена игрока
    active = [p for p, st in stacks.items() if st > 0]
    if state['current_player'] in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]

    # Проверка конца раунда: все активные сходили
    if state['round_actions'] >= set(active) and all(contributions[p] == state['current_bet'] for p in active):
        # переход на следующую улицу
        deck = state['deck']
        cr = state['current_round']
        if cr == 'pre-flop':
            deck.pop()
            state['community'] = [deck.pop() for _ in range(3)]
            state['current_round'] = 'flop'
        elif cr == 'flop':
            deck.pop()
            state['community'].append(deck.pop())
            state['current_round'] = 'turn'
        elif cr == 'turn':
            deck.pop()
            state['community'].append(deck.pop())
            state['current_round'] = 'river'
        else:
            state['current_round'] = 'showdown'

        # сброс ставок
        state['current_bet'] = 0
        state['contributions'] = {p: 0 for p in active}
        state['round_actions'] = set()
        # первый ход слева от дилера
        dealer_idx = state['dealer_index']
        players = state['players']
        for i in range(1, len(players)+1):
            nxt = players[(dealer_idx + i) % len(players)]
            if state['stacks'].get(nxt, 0) > 0:
                state['current_player'] = nxt
                break

    game_states[table_id] = state

