# game_engine.py

import random
from game_data import seat_map, game_states, username_map, game_locks

STARTING_STACK = 1000

def new_deck():
    suits = ['H','D','C','S']
    ranks = [str(n) for n in range(2,11)] + list('JQKA')
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

async def join_table(table_id: int, user_id: str, username: str):
    """Добавляем пользователя за стол и сохраняем ник."""
    lock = game_locks[table_id]
    async with lock:
        if user_id not in seat_map[table_id]:
            seat_map[table_id].append(user_id)
        username_map[user_id] = username

async def leave_table(table_id: int, user_id: str):
    """Убираем пользователя из стола, чистим его часть state."""
    lock = game_locks[table_id]
    async with lock:
        players = seat_map.get(table_id, [])
        if user_id in players:
            players.remove(user_id)
        state = game_states.get(table_id)
        if state:
            state['hole_cards'].pop(user_id, None)
            state['stacks'].pop(user_id, None)
            # Переназначаем current_player, если нужно
            if state.get('current_player') == user_id and players:
                state['current_player'] = players[0]
            state['players'] = list(players)
            # Если никого не осталось — сбрасываем всё полностью
            if not players:
                game_states.pop(table_id, None)

async def start_hand(table_id: int):
    """Новая раздача: каждому по 2 карты, сбрасываем банк и community."""
    lock = game_locks[table_id]
    async with lock:
        players = seat_map.get(table_id, [])
        if not players:
            return

        deck = new_deck()
        hole = {uid: [deck.pop(), deck.pop()] for uid in players}

        state = game_states.setdefault(table_id, {})
        state.update({
            'players': list(players),
            'hole_cards': hole,
            'community': [],
            'stacks': {uid: STARTING_STACK for uid in players},
            'pot': 0,
            'current_player': players[0],
            'deck': deck,
        })
