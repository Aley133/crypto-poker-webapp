# game_engine.py
import random
from typing import Dict, List, Set
from game_data import seat_map

# Состояние столов и WebSocket-соединения
# game_states всегда инициализирован для каждого стола, даже при одном игроке
# connections хранит список WebSocket-соединений по table_id
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
    Запускает или обновляет состояние раздачи для стола:
      - Инициализация базового стейта при первой регистрации стола (ожидание игроков)
      - При наличии ≥2 игроков: ротация дилера, постинг блайндов, раздача карт
    """
    # Обновляем список игроков (строки)
    players = [str(uid) for uid in seat_map.get(table_id, [])]
    # Если стейта ещё нет, создаём минимальный для ожидания
    state = game_states.setdefault(table_id, {
        'started': False,
        'players': players,
        'usernames': {},
    })
    # Обновляем список игроков в стейте
    state['players'] = players
    # Если мало игроков — остаёмся в ожидании
    if len(players) < 2:
        return

    # Теперь у нас ≥2 игроков — запускаем новую раздачу
    prev_dealer = state.get('dealer_index', -1)
    dealer_index = (prev_dealer + 1) % len(players)

    sb = players[(dealer_index + 1) % len(players)]
    bb = players[(dealer_index + 2) % len(players)]

    # Инициализация стеков (восстанавливаем из предыдущих или даём стартовый)
    stacks = state.get('stacks', {uid: STARTING_STACK for uid in players})
    stacks[sb] = max(0, stacks.get(sb, STARTING_STACK) - BLIND_SMALL)
    stacks[bb] = max(0, stacks.get(bb, STARTING_STACK) - BLIND_BIG)

    # Текущая ставка и вклады игроков
    current_bet = BLIND_BIG
    contributions = {
        uid: (BLIND_SMALL if uid == sb else BLIND_BIG if uid == bb else 0)
        for uid in players
    }

    # Подготовка колоды и раздача
    deck = new_deck()
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Собираем новый стейт
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
        'round_actions': set(),
        'current_player': players[(players.index(bb) + 1) % len(players)],
        'current_round': 'pre-flop',
        'started': True,
        'usernames': state.get('usernames', {}),
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывает ход игрока и при необходимости переходит к следующему раунду.
    Поддерживает действия: call, check, fold, bet, raise.
    """
    uid = str(uid)
    state = game_states.get(table_id)
    if not state or uid not in state.get('stacks', {}):
        return

    stacks = state['stacks']
    contributions = state['contributions']
    cb = state['current_bet']
    active = [p for p, st in stacks.items() if st > 0]

    # Отмечаем, что игрок сделал ход
    state['round_actions'].add(uid)

    # Выполняем действие
    if action == 'call':
        to_call = cb - contributions.get(uid, 0)
        if stacks.get(uid, 0) >= to_call:
            stacks[uid] -= to_call
            state['pot'] += to_call
            contributions[uid] = contributions.get(uid, 0) + to_call
    elif action == 'check':
        if contributions.get(uid, 0) != cb:
            return
    elif action == 'fold':
        stacks[uid] = 0
    elif action == 'bet':
        if amount > cb and stacks.get(uid, 0) >= amount:
            diff = amount - contributions.get(uid, 0)
            state['current_bet'] = amount
            stacks[uid] -= diff
            state['pot'] += diff
            contributions[uid] = amount
    elif action == 'raise':
        if amount > cb and stacks.get(uid, 0) >= (amount - contributions.get(uid, 0)):
            diff = amount - contributions.get(uid, 0)
            state['current_bet'] = amount
            stacks[uid] -= diff
            state['pot'] += diff
            contributions[uid] = amount

    # Смена игрока
    if state.get('current_player') in active:
        idx = active.index(state['current_player'])
        state['current_player'] = active[(idx + 1) % len(active)]

    # Проверка конца раунда: все активные игроки сделали ход и сравняли вклад
    if state['round_actions'] >= set(active) and all(contributions.get(p, 0) == state['current_bet'] for p in active):
        deck = state['deck']
        cr = state['current_round']
        # Переход на следующую улицу
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
            state['started'] = False

        # Сброс ставок для нового раунда
        state['current_bet'] = 0
        state['contributions'] = {p: 0 for p in active}
        state['round_actions'] = set()

        # Первый ход — слева от дилера среди активных
        dealer_idx = state['dealer_index']
        for i in range(1, len(state['players'])+1):
            nxt = state['players'][(dealer_idx + i) % len(state['players'])]
            if stacks.get(nxt, 0) > 0:
                state['current_player'] = nxt
                break

    # Сохраняем обновлённый стейт
    game_states[table_id] = state
