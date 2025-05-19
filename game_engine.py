# game_engine.py
import random
from typing import Dict, List
from game_data import seat_map

# Хранение состояния по столам
# game_states[table_id] = {
#    'hole_cards': {...},
#    'community': [...],
#    'stacks': {...},
#    'pot': int,
#    'current_player': uid,
#    'dealer_index': int,
#    'started': bool,
#    'usernames': {uid: username}
# }
game_states: Dict[int, dict] = {}
# WebSocket-соединения: connections[table_id] = [WebSocket, ...]
connections: Dict[int, List] = {}

# Начальные настройки
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
    Инициализирует новую раздачу для стола:
    - ротация дилера
    - постинг блайндов
    - раздача карманных карт
    - установка current_bet и начальных contributions
    - выбор первого ходящего
    """
    players = seat_map.get(table_id, [])
    if len(players) < 2:
        return

    # Возьмём текущее состояние, если есть
    state = game_states.get(table_id, {})

    # 1) Ротация дилера
    prev = state.get('dealer_index', -1)
    dealer_index = (prev + 1) % len(players)
    state['dealer_index'] = dealer_index

    # 2) Позиции блайндов
    sb_index = (dealer_index + 1) % len(players)
    bb_index = (dealer_index + 2) % len(players)
    sb_uid = players[sb_index]
    bb_uid = players[bb_index]

    # 3) Инициализация (или восстановление) стеков
    stacks = state.get(
        'stacks',
        {uid: STARTING_STACK for uid in players}
    )
    stacks[sb_uid] = max(0, stacks.get(sb_uid, STARTING_STACK) - BLIND_SMALL)
    stacks[bb_uid] = max(0, stacks.get(bb_uid, STARTING_STACK) - BLIND_BIG)

    # 4) Установка текущей ставки и вкладов игроков
    state['current_bet'] = BLIND_BIG
    state['contributions'] = {
        uid: (
            BLIND_SMALL if uid == sb_uid
            else BLIND_BIG if uid == bb_uid
            else 0
        )
        for uid in players
    }

    # 5) Раздача карманных карт
    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # 6) Сборка нового состояния
    game_states[table_id] = {
        'hole_cards': hole_cards,
        'community': [],
        'stacks': stacks,
        'pot': BLIND_SMALL + BLIND_BIG,
        'current_bet': BLIND_BIG,
        'contributions': state['contributions'],
        'current_player': players[(bb_index + 1) % len(players)],
        'dealer_index': dealer_index,
        'started': True,
        'usernames': state.get('usernames', {}),
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает действия игроков:
      - call
      - check
      - fold
      - bet (первая ставка > current_bet)
      - raise (увеличение > current_bet)
    После действия переводит ход следующему активному игроку.
    """
    state = game_states.get(table_id)
    if not state or uid not in state['stacks']:
        return

    stacks = state['stacks']
    contrib = state['contributions']
    cb = state['current_bet']

    if action == 'call':
        to_call = cb - contrib[uid]
        if stacks[uid] >= to_call:
            stacks[uid] -= to_call
            state['pot'] += to_call
            contrib[uid] += to_call

    elif action == 'check':
        # Можно чекнуть только если вклад уже равен current_bet
        if contrib[uid] != cb:
            return

    elif action == 'fold':
        # Игрок выбыл из руки
        stacks[uid] = 0

    elif action == 'bet':
        # Первая ставка: amount > current_bet
        if amount > cb and stacks[uid] >= amount:
            state['current_bet'] = amount
            to_put = amount - contrib[uid]
            stacks[uid] -= to_put
            state['pot'] += to_put
            contrib[uid] = amount

    elif action == 'raise':
        # Увеличение: amount > current_bet
        if amount > cb and stacks[uid] >= (amount - contrib[uid]):
            state['current_bet'] = amount
            diff = amount - contrib[uid]
            stacks[uid] -= diff
            state['pot'] += diff
            contrib[uid] = amount

    # Перевод хода следующему игроку с положительным стеком
    active = [p for p, st in stacks.items() if st > 0]
    if state.get('current_player') in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]

    game_states[table_id] = state
