### tables.py
from fastapi import APIRouter, HTTPException
from game_data import seat_map
from game_engine import game_states

router = APIRouter(prefix="/api")
# Минимальное число игроков для старта
MIN_PLAYERS = 2

# Global blinds settings per level
BLINDS = {
    1: (1, 2, 100),
    2: (2, 4, 200),
    3: (5, 10, 500),
}

# Initialize game_states for predefined tables
for tid in BLINDS.keys():
    game_states.setdefault(tid, {})

@router.post("/join")
async def join_table(table_id: int, user_id: str):
    users = seat_map.setdefault(table_id, [])
    if user_id not in users:
        users.append(user_id)
    return {"status": "ok", "players": users}

@router.post("/leave")
async def leave_table(table_id: int, user_id: str):
    users = seat_map.get(table_id, [])
    if user_id in users:
        users.remove(user_id)
    state = game_states.get(table_id, {})
    if len(users) < MIN_PLAYERS:
        state.pop("started", None)
    return {"status": "ok", "players": users}

@router.get("/tables")
async def list_tables(level: int | None = None) -> dict:
    """
    Если level задан, фильтруем столы по идентификатору таблицы == level.
    Иначе возвращаем все.
    """
    out = []
    for tid, (sb, bb, bi) in BLINDS.items():
        if level is not None and tid != level:
            continue
        users = seat_map.get(tid, [])
        out.append({
            "id": tid,
            "small_blind": sb,
            "big_blind": bb,
            "buy_in": bi,
            "players": len(users),
        })
    return {"tables": out}

@router.post("/create")
async def create_table(level: int) -> dict:
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

@router.get("/tables/{table_id}/users")
async def get_table_users(table_id: int) -> dict:
    users = seat_map.get(table_id, [])
    return {"table_id": table_id, "players": users}

@router.get("/game_state")
async def get_game_state(table_id: int) -> dict:
    # Return current players and game state for a table
    players = seat_map.get(table_id, [])
    state = game_states.get(table_id, {})
    return {"players": players, "state": state}

@router.get("/balance")
async def get_balance(table_id: int, user_id: str) -> dict:
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}
