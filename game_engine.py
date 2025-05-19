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

# Настройки игры
STARTING_STACK = 1000
BLIND_SMALL = 1
BLIND_BIG = 2


def new_deck() -> List[str]:
    """
    Генерирует и перемешивает колоду из 52 карт.
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
    - установка первого хода
    """
    players = seat_map.get(table_id, [])
    if len(players) < 2:
        return

    state = game_states.get(table_id, {})
    # Ротация дилера
    prev = state.get('dealer_index', -1)
    dealer = (prev + 1) % len(players)
    state['dealer_index'] = dealer

    # Малый и большой блайнд
    sb = players[(dealer + 1) % len(players)]
    bb = players[(dealer + 2) % len(players)]

    # Инициализация стеков
    stacks = state.get('stacks', {uid: STARTING_STACK for uid in players})
    stacks[sb] = max(0, stacks.get(sb, STARTING_STACK) - BLIND_SMALL)
    stacks[bb] = max(0, stacks.get(bb, STARTING_STACK) - BLIND_BIG)

    # Раздача карт
    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Сборка нового состояния
    game_states[table_id] = {
        'hole_cards': hole,
        'community': [],
        'stacks': stacks,
        'pot': BLIND_SMALL + BLIND_BIG,
        'current_player': players[(players.index(bb) + 1) % len(players)],
        'dealer_index': dealer,
        'started': True,
        'usernames': state.get('usernames', {})
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока: bet, check, fold и т.д.
    Пока реализована только ставка.
    """
    state = game_states.get(table_id)
    if not state or uid not in state['stacks']:
        return
    if action == 'bet' and amount > 0:
        if state['stacks'][uid] >= amount:
            state['stacks'][uid] -= amount
            state['pot'] += amount
    # TODO: остальные действия

    # Смена текущего игрока
    active = [p for p, st in state['stacks'].items() if st > 0]
    if state['current_player'] in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]
    game_states[table_id] = state
