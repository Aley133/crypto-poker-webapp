from typing import Dict, List
from fastapi import HTTPException

from game_data import seat_map
from game_engine import game_states

# ----- Table configurations -----
TABLE_LEVELS = {
    "low": {
        "sb": 0.02,
        "bb": 0.05,
        "min_deposit": 2.5,
        "max_deposit": 25,
    },
    "mid": {
        "sb": 0.25,
        "bb": 0.50,
        "min_deposit": 12.5,
        "max_deposit": 125,
    },
    "vip": {
        "sb": 2.00,
        "bb": 5.00,
        "min_deposit": 250,
        "max_deposit": 1250,
    },
}

# Mapping table_id -> level key
TABLES: Dict[int, str] = {}

MIN_PLAYERS = 2
MAX_PLAYERS = 6

# Pre-create one table of each level
_next_id = 1
for lvl in TABLE_LEVELS.keys():
    TABLES[_next_id] = lvl
    seat_map[_next_id] = []
    game_states.setdefault(_next_id, {})
    _next_id += 1

def get_table_config(table_id: int) -> Dict:
    if table_id not in TABLES:
        raise HTTPException(status_code=404, detail="Table not found")
    level = TABLES[table_id]
    cfg = TABLE_LEVELS[level].copy()
    cfg["level"] = level
    cfg["max_players"] = MAX_PLAYERS
    return cfg


def list_tables() -> List[Dict]:
    out = []
    for tid, lvl in TABLES.items():
        cfg = TABLE_LEVELS[lvl]
        users = seat_map.get(tid, [])
        out.append({
            "id": tid,
            "level": lvl,
            "small_blind": cfg["sb"],
            "big_blind": cfg["bb"],
            "min_deposit": cfg["min_deposit"],
            "max_deposit": cfg["max_deposit"],
            "players": len(users),
        })
    return out


def create_table(level: str) -> Dict:
    if level not in TABLE_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    global _next_id
    tid = _next_id
    _next_id += 1
    TABLES[tid] = level
    seat_map[tid] = []
    game_states[tid] = {}
    cfg = TABLE_LEVELS[level]
    return {
        "id": tid,
        "level": level,
        "small_blind": cfg["sb"],
        "big_blind": cfg["bb"],
        "min_deposit": cfg["min_deposit"],
        "max_deposit": cfg["max_deposit"],
        "players": 0,
    }


def join_table(user_id: str, table_id: int, deposit: float, seat_idx: int) -> Dict:
    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        users.remove(user_id)
    users.append(user_id)
    return {"status": "ok", "players": users}


def leave_table(table_id: int, user_id: str) -> Dict:
    users = seat_map.get(table_id, [])
    if user_id not in users:
        raise HTTPException(status_code=400, detail="User not at table")
    users.remove(user_id)
    if len(users) < MIN_PLAYERS:
        game_states.get(table_id, {}).pop("started", None)
    return {"status": "ok", "players": users}


def get_balance(table_id: int, user_id: str) -> Dict:
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}


def get_players(table_id: int) -> List[str]:
    return list(seat_map.get(table_id, []))
