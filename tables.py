from fastapi import HTTPException

from game_data import seat_map
from game_engine import game_states
from db_utils import set_balance_db

# Конфигурация уровней столов
TABLE_LEVELS = {
    "low":  {"sb": 0.02, "bb": 0.05, "min_deposit": 2.5, "max_deposit": 25},
    "mid":  {"sb": 0.25, "bb": 0.50, "min_deposit": 12.5, "max_deposit": 125},
    "vip":  {"sb": 2.00, "bb": 5.00, "min_deposit": 250, "max_deposit": 1250},
}

# Перечень созданных столов: id -> {level:str}
TABLES = {
    1: {"level": "low"},
    2: {"level": "mid"},
    3: {"level": "vip"},
}

# Минимальное число игроков для старта
MIN_PLAYERS = 2

# Инициализируем состояния для предустановленных столов
for tid in TABLES.keys():
    game_states.setdefault(tid, {})
    seat_map.setdefault(tid, [])


def list_tables() -> list:
    """Возвращает список всех столов с их параметрами."""
    out = []
    for tid, meta in TABLES.items():
        level = meta["level"]
        cfg = TABLE_LEVELS[level]
        out.append({
            "id": tid,
            "level": level,
            "sb": cfg["sb"],
            "bb": cfg["bb"],
            "min_deposit": cfg["min_deposit"],
            "max_deposit": cfg["max_deposit"],
            "players": len(seat_map.get(tid, [])),
        })
    return out


def create_table(level: str) -> dict:
    """Создает новый стол указанного уровня."""
    if level not in TABLE_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    new_id = max(TABLES.keys(), default=0) + 1
    TABLES[new_id] = {"level": level}
    seat_map[new_id] = []
    game_states[new_id] = {}
    cfg = TABLE_LEVELS[level]
    return {
        "id": new_id,
        "level": level,
        "sb": cfg["sb"],
        "bb": cfg["bb"],
        "min_deposit": cfg["min_deposit"],
        "max_deposit": cfg["max_deposit"],
        "players": 0,
    }


def get_table_config(table_id: int) -> dict:
    """Возвращает конфигурацию стола."""
    meta = TABLES.get(table_id)
    if not meta:
        raise HTTPException(404, "Table not found")
    cfg = TABLE_LEVELS[meta["level"]].copy()
    cfg["level"] = meta["level"]
    cfg["max_players"] = 6
    return cfg


def join_table(user_id: str, table_id: int, deposit: float, seat_idx: int) -> dict:
    """Регистрация игрока за столом с указанием депозита и места."""
    cfg = get_table_config(table_id)
    if deposit < cfg["min_deposit"] or deposit > cfg["max_deposit"]:
        raise HTTPException(400, "Deposit out of range")

    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        users.remove(user_id)
    users.append(user_id)

    # Сохраняем депозит как баланс игрока
    set_balance_db(user_id, deposit)

    state = game_states.setdefault(
        table_id,
        {
            "seats": [None] * cfg.get("max_players", 6),
            "player_seats": {},
            "players": [],
            "stacks": {},
            "usernames": {},
        },
    )

    if not (0 <= seat_idx < cfg.get("max_players", 6)):
        raise HTTPException(400, "Invalid seat")
    if state["seats"][seat_idx] is not None:
        raise HTTPException(400, "Seat already taken")

    state["seats"][seat_idx] = user_id
    state["player_seats"][user_id] = seat_idx
    state["stacks"][user_id] = deposit
    if user_id not in state["players"]:
        state["players"].append(user_id)

    return {"status": "ok", "players": users}


def leave_table(table_id: int, user_id: str) -> dict:
    """
    Убирает пользователя со стола. Возвращает статус и список оставшихся игроков.
    """
    users = seat_map.get(table_id, [])
    if user_id not in users:
        raise HTTPException(status_code=400, detail="User not at table")
    users.remove(user_id)
    # Сбрасываем флаг начала игры, если игроков стало меньше минимума
    if len(users) < MIN_PLAYERS:
        game_states.get(table_id, {}).pop("started", None)
    return {"status": "ok", "players": users}


def get_balance(table_id: int, user_id: str) -> dict:
    """
    Возвращает баланс (стек) пользователя на столе.
    """
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}


def get_players(table_id: int) -> list:
    """Список id игроков за столом."""
    return seat_map.get(table_id, [])
