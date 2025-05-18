# Весь файл game_engine.py
import random
from typing import Dict, List
from game_data import seat_map

game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

STARTING_STACK = 1000

def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2,11)] + list("JQKA")
    suits = ["♠","♥","♦","♣"]
    deck = [r+s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    raw = seat_map.get(table_id, [])
    players = [int(u) for u in raw]
    if len(players) < 2:
        return

    old = game_states.get(table_id, {})
    usernames = old.get("usernames", {})

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: STARTING_STACK for uid in players}

    SB, BB = 5, 10
    sb_idx = 1 % len(players)
    bb_idx = 2 % len(players)
    sb_pid = players[sb_idx]
    bb_pid = players[bb_idx]

    bets = {uid: 0 for uid in players}
    stacks[sb_pid] -= SB; bets[sb_pid] = SB
    stacks[bb_pid] -= BB; bets[bb_pid] = BB
    pot = SB + BB

    first_pid = players[(bb_idx + 1) % len(players)]

    game_states[table_id] = {
        "hole_cards": hole,
        "community": [],
        "deck": deck,
        "stacks": stacks,
        "bets": bets,
        "pot": pot,
        "current_bet": BB,
        "current_player": first_pid,
        "stage": "preflop",
        "folded": set(),
        "usernames": usernames,
    }

def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    """
    Обрабатывать действия игроков: fold, check, call, bet, raise.
    Игнорировать все остальные сообщения (sync и т.п.).
    """
    state = game_states.get(table_id)
    # Пропускаем до начала руки или при sync
    if not state or 'stacks' not in state:
        return
    # Если игрок не активен или неправильный uid
    if uid not in state['stacks']:
        return

    # Игрок может ходить только если он текущий
    if uid != state['current_player']:
        return

    players = [int(u) for u in seat_map.get(table_id, [])]
    folded  = state.get('folded', set())
    active  = [p for p in players if p not in folded and state['stacks'][p] > 0]

    # Обработка конкретного действия
    if action == 'fold':
        folded.add(uid)
    elif action == 'check':
        if state['bets'][uid] != state['current_bet']:
            return
    elif action == 'call':
        to_call = state['current_bet'] - state['bets'][uid]
        to_call = min(to_call, state['stacks'][uid])
        state['stacks'][uid] -= to_call
        state['bets'][uid]   += to_call
        state['pot']         += to_call
    elif action in ('bet','raise'):
        if amount <= state['current_bet']:
            return
        delta = amount - state['bets'][uid]
        put   = min(delta, state['stacks'][uid])
        state['stacks'][uid] -= put
        state['bets'][uid]   += put
        state['pot']         += put
        state['current_bet'] = state['bets'][uid]
    else:
        # неизвестное действие — игнорируем
        return

    # Обновляем список активных
    active = [p for p in players if p not in folded and state['stacks'][p] > 0]
    # Если остался один — шоудаун
    if len(active) <= 1:
        state['stage'] = 'showdown'
        return

    # Переход хода
    idx = active.index(uid)
    state['current_player'] = active[(idx + 1) % len(active)]

    # Проверка окончания раунда ставок
    if all(state['bets'][p] == state['current_bet'] for p in active):
        next_stage = {
            'preflop':'flop', 'flop':'turn', 'turn':'river', 'river':'showdown'
        }[state['stage']]
        state['stage'] = next_stage
        # Сброс ставок и подготовка
        for p in active:
            state['bets'][p] = 0
        state['current_bet'] = 0
        # Раздача общих карт
        if next_stage == 'flop':
            for _ in range(3): state['community'].append(state['deck'].pop())
        elif next_stage in ('turn','river'):
            state['community'].append(state['deck'].pop())
        # Первый ход — первый активный
        state['current_player'] = active[0]
