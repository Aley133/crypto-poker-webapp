from fastapi import HTTPException

from game_data import seat_map
from game_engine import game_states
import db_utils

# Глобальный словарь: table_id → (small_blind, big_blind, max_buy_in)
BLINDS = {
    1: (1, 2, 100),
    2: (2, 4, 200),
    3: (5, 10, 500),
}

# Минимальный бай-ин (можно настроить под каждый стол или вынести в отдельный dict)
GLOBAL_MIN_BUY_IN = 6.5  

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


def join_table(table_id: int, user_id: str, deposit: float) -> dict:
    # 1) Проверяем, что такой стол существует
    if table_id not in BLINDS:
        raise HTTPException(status_code=400, detail="Неверный идентификатор стола")

    sb, bb, max_buy_in = BLINDS[table_id]
    min_buy_in = GLOBAL_MIN_BUY_IN   # либо вычислять per-table

    # 2) Валидация размера депозита по лимитам стола
    if not (min_buy_in <= deposit <= max_buy_in):
        raise HTTPException(
            status_code=400,
            detail=f"Депозит должен быть от {min_buy_in:.2f} до {max_buy_in:.2f} USD"
        )

    # 3) Проверяем баланс пользователя и списываем депозит
    balance = db_utils.get_balance_db(user_id)
    if deposit > balance:
        raise HTTPException(status_code=400, detail="Недостаточно средств на балансе")

    db_utils.set_balance_db(user_id, balance - deposit)

    # 4) «Садим» пользователя за стол
    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        users.remove(user_id)  # на случай переподключения
    users.append(user_id)

    # 5) Обновляем его стек в состоянии игры
    state = game_states.setdefault(table_id, {})
    stacks = state.setdefault("stacks", {})
    stacks[user_id] = deposit

    # 6) Если игроков стало меньше минимума — сбрасываем флаг старта
    if len(users) < MIN_PLAYERS:
        state.pop("started", None)

    return {
        "status": "ok",
        "players": users,
        "your_stack": deposit
    }


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
