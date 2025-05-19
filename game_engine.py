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
    - Ротация дилера
    - Постинг блайндов
    - Раздача карманных карт
    - Установка первого хода
    """
    players = seat_map.get(table_id, [])
    if len(players) < 2:
        return

    # Получаем предыдущее состояние
    state = game_states.get(table_id, {})
    # Ротация дилера
    prev_dealer = state.get('dealer_index', -1)
    dealer_index = (prev_dealer + 1) % len(players)
    state['dealer_index'] = dealer_index

    # Определяем позиции блайндов
    sb_index = (dealer_index + 1) % len(players)
    bb_index = (dealer_index + 2) % len(players)
    sb_uid = players[sb_index]
    bb_uid = players[bb_index]

    # Инициализация стеков
    stacks = state.get('stacks', {uid: STARTING_STACK for uid in players})
    stacks[sb_uid] = max(0, stacks.get(sb_uid, STARTING_STACK) - BLIND_SMALL)
    stacks[bb_uid] = max(0, stacks.get(bb_uid, STARTING_STACK) - BLIND_BIG)

    # Создаём и раздаём карты
    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Формируем новое состояние
    game_states[table_id] = {
        'hole_cards': hole_cards,
        'community': [],
        'stacks': stacks,
        'pot': BLIND_SMALL + BLIND_BIG,
        'current_player': players[(bb_index + 1) % len(players)],
        'dealer_index': dealer_index,
        'started': True,
        'usernames': state.get('usernames', {})
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает действие игрока: 'bet' (ставка). Другие действия можно добавить.
    """
    state = game_states.get(table_id)
    if not state or uid not in state['stacks']:
        return

    if action == 'bet' and amount > 0:
        if state['stacks'][uid] >= amount:
            state['stacks'][uid] -= amount
            state['pot'] += amount
    # TODO: реализовать 'check', 'fold', 'raise'

    # Переход хода следующему активному игроку
    active = [p for p, st in state['stacks'].items() if st > 0]
    if state.get('current_player') in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]

    game_states[table_id] = state
