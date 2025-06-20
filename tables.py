from fastapi import HTTPException

from game_data import seat_map
from game_engine import game_states

# Конфигурация столов: блайнды и диапазон buy-in
TABLES = {
    1: {
        "small_blind": 1,
        "big_blind": 2,
        "min_buy_in": 2.5,
        "max_buy_in": 15.0,
    },
    2: {
        "small_blind": 2,
        "big_blind": 4,
        "min_buy_in": 12.5,
        "max_buy_in": 50.0,
    },
    3: {
        "small_blind": 5,
        "big_blind": 10,
        "min_buy_in": 75.0,
        "max_buy_in": 500.0,
    },
}

# Минимальное число игроков для старта
MIN_PLAYERS = 2

# Инициализируем состояния для предустановленных столов
for tid in TABLES.keys():
    game_states.setdefault(tid, {})


def list_tables() -> list:
    """
    Возвращает список всех столов с параметрами и числом игроков.
    """
    out = []
    for tid, cfg in TABLES.items():
        users = seat_map.get(tid, [])
        out.append({
            "id": tid,
            "small_blind": cfg["small_blind"],
            "big_blind": cfg["big_blind"],
            "min_buy_in": cfg["min_buy_in"],
            "max_buy_in": cfg["max_buy_in"],
            "players": len(users)
        })
    return out


def create_table(level: int) -> dict:
    """
    Создает новый стол по заданному уровню. Возвращает его параметры.
    """
    if level not in TABLES:
        raise HTTPException(status_code=400, detail="Invalid level")
    new_id = max(TABLES.keys(), default=0) + 1
    cfg = TABLES[level]
    TABLES[new_id] = cfg.copy()
    seat_map[new_id] = []
    game_states[new_id] = {}
    return {
        "id": new_id,
        "small_blind": cfg["small_blind"],
        "big_blind": cfg["big_blind"],
        "min_buy_in": cfg["min_buy_in"],
        "max_buy_in": cfg["max_buy_in"],
        "players": 0
    }


def join_table(table_id: int, user_id: str) -> dict:
    """
    Добавляет пользователя за стол или обновляет его присутствие.
    Возвращает статус и список игроков.
    """
    users = seat_map.setdefault(table_id, [])
    # Если пользователь уже за столом, удаляем старую запись для переподключения
    if user_id in users:
        users.remove(user_id)
    users.append(user_id)
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
