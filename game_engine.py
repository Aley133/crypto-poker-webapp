# game_engine.py
import random
from game_data import seat_map, game_states, username_map

STARTING_STACK = 1000

def new_deck():
    suits = ['H','D','C','S']
    ranks = [str(n) for n in range(2,11)] + ['J','Q','K','A']
    deck = [r + s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def join_table(table_id: int, user_id: str, username: str):
    """Пользователь заходит за стол: 
       добавляем в список и сохраняем ник."""
    if user_id not in seat_map[table_id]:
        seat_map[table_id].append(user_id)
    username_map[user_id] = username

def leave_table(table_id: int, user_id: str):
    """Пользователь выходит: 
       убираем из списка и очищаем его карточки/стек."""
    players = seat_map.get(table_id, [])
    if user_id in players:
        players.remove(user_id)
    state = game_states.get(table_id)
    if state:
        state['hole_cards'].pop(user_id, None)
        state['stacks'].pop(user_id, None)
        # если остался хотя бы один – переносим current_player
        if players:
            state['players'] = list(players)
            if state.get('current_player') == user_id:
                state['current_player'] = players[0]
        else:
            # последний ушёл – сбрасываем всё состояние
            game_states.pop(table_id, None)

def start_hand(table_id: int):
    """Начать новую раздачу: 
       каждому свежие карты, стек — STARTING_STACK."""
    players = seat_map.get(table_id, [])
    if not players:
        return

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}

    # обновляем или создаём state
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
