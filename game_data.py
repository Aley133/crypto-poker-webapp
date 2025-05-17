# game_data.py

from collections import defaultdict

# Хранилище игроков за каждым столом: table_id → [user_id, ...]
seat_map = defaultdict(list)

# Состояние игры по каждому столу:
# table_id → {
#    "players": [user_id, ...],        # список активных игроков за столом
#    "hole_cards": {                   # закрытые карты каждого игрока
#        user_id: [card1, card2],
#        ...
#    },
#    "community": [],                  # общие карты на столе
#    "stacks": {                       # фишки (стек) каждого игрока
#        user_id: stack_size,
#        ...
#    },
#    "pot": int,                       # текущий банк
#    "current_player": user_id,        # чей ход сейчас
#    "deck": [                         # оставшиеся карты в колоде
#        ...
#    ],
# }
game_states = {}

# Соответствие user_id → Telegram username (не очищается при выходе)
username_map = {}
