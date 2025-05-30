from fastapi import HTTPException

from game_data import seat_map
from game_engine import game_states

# Глобальный словарь с настройками блайндов по уровням
BLINDS = {
    1: (1, 2, 100),
    2: (2, 4, 200),
    3: (5, 10, 500),
}

# Минимальное число игроков для старта
MIN_PLAYERS = 2

# Инициализируем состояния для предустановленных столов
for tid in BLINDS.keys():
    game_states.setdefault(tid, {})


def list_tables() -> list:
    """
    Возвращает список всех столов с параметрами и числом игроков.
    """
    out = []
    for tid, (sb, bb, bi) in BLINDS.items():
        users = seat_map.get(tid, [])
        out.append({
            "id": tid,
            "small_blind": sb,
            "big_blind": bb,
            "buy_in": bi,
            "players": len(users)
        })
    return out


def create_table(level: int) -> dict:
    """
    Создает новый стол по заданному уровню. Возвращает его параметры.
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
