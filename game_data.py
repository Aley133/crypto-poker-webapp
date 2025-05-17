# game_data.py

from collections import defaultdict
import asyncio

# table_id → [user_id, ...]
seat_map = defaultdict(list)

# table_id → {
#    "players": [...],
#    "hole_cards": { user_id: [c1, c2], ... },
#    "community": [...],
#    "stacks": { user_id: stack, ... },
#    "pot": int,
#    "current_player": user_id,
#    "deck": [...],
# }
game_states = {}

# user_id → telegram username
username_map = {}

# table_id → asyncio.Lock(), чтобы защищать state при конкурентных обращениях
game_locks = defaultdict(asyncio.Lock)
