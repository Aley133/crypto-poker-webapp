from fastapi import HTTPException
from game_data import seat_map
from game_engine import game_states, MIN_PLAYERS


MIN_PLAYERS = 2

BLINDS = {
    1: (1, 2, 100),
    2: (2, 4, 200),
    3: (5, 10, 500),
}

# Initialize game_states for predefined tables
for tid in BLINDS.keys():
    game_states.setdefault(tid, {})

def list_tables() -> list:
    """
    Returns list of all tables with parameters and current player counts.
    """
    tables = []
    for tid, (sb, bb, bi) in BLINDS.items():
        users = seat_map.get(tid, [])
        tables.append({
            "id": tid,
            "small_blind": sb,
            "big_blind": bb,
            "buy_in": bi,
            "players": len(users),
        })
    return tables

def create_table(level: int) -> dict:
    """
    Creates a new table for the given level. Returns its parameters.
    """
    if level not in BLINDS:
        raise HTTPException(status_code=400, detail="Invalid level")
    new_id = max(BLINDS.keys(), default=0) + 1
    sb, bb, bi = BLINDS[level]
    BLINDS[new_id] = (sb, bb, bi)
    seat_map[new_id] = []
    game_states[new_id] = {}
    return {
        "id": new_id,
        "small_blind": sb,
        "big_blind": bb,
        "buy_in": bi,
        "players": 0,
    }

def join_table(table_id: int, user_id: str) -> dict:
    """
    Adds the user to the table if not present. Returns status and players.
    """
    users = seat_map.setdefault(table_id, [])
    if user_id not in users:
        users.append(user_id)
    return {"status": "ok", "players": users}

def leave_table(table_id: int, user_id: str) -> dict:
    """
    Removes the user from the table if present. Returns status and players.
    """
    users = seat_map.get(table_id, [])
    if user_id in users:
        users.remove(user_id)
    # Reset "started" flag if too few players
    state = game_states.get(table_id, {})
    if len(users) < MIN_PLAYERS:
        state.pop("started", None)
    return {"status": "ok", "players": users}

def get_balance(table_id: int, user_id: str) -> dict:
    """
    Returns the current stack of the user at the table.
    """
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}
