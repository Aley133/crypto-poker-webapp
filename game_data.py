# game_data.py
from collections import defaultdict

# table_id → [user_id,...]
seat_map = defaultdict(list)

# table_id → {
#    players: [user_id,...],
#    hole_cards: {user_id: [c1,c2], ...},
#    community: [...],
#    stacks: {user_id: stack_size, ...},
#    pot: int,
#    current_player: user_id,
#    deck: [...],
# }
game_states = {}

# user_id → telegram username (не чистим при выходе)
username_map = {}
