import random
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Разрешаем все CORS, чтобы WebApp всегда достучался
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Модель одного кеш-стола
class Table(BaseModel):
    id: int
    small_blind: float
    big_blind: float
    buy_in: float
    players: str   # "занято/лимит"

# Заглушечный список столов
TABLES = [
    {"id": 1, "small_blind": 0.02, "big_blind": 0.05, "buy_in": 2.5, "limit": 6},
    {"id": 2, "small_blind": 0.05, "big_blind": 0.10, "buy_in": 7.5, "limit": 6},
    {"id": 3, "small_blind": 0.10, "big_blind": 0.20, "buy_in": 15.0, "limit": 6},
]

# Просто хранение занятых мест (в памяти)
seat_map = {t["id"]: set() for t in TABLES}

@app.get("/api/tables", response_model=List[Table])
async def api_tables(
    user_id: int = Query(..., description="Ваш Telegram user_id"),
    level: str = Query("Low", description="Уровень стола (Low/Mid/VIP)")
):
    """
    Возвращает список кеш-столов.
    Параметр level пока не действует, всегда возвращаем все.
    """
    out = []
    for t in TABLES:
        occ = len(seat_map[t["id"]])
        out.append(Table(
            id=t["id"],
            small_blind=t["small_blind"],
            big_blind=t["big_blind"],
            buy_in=t["buy_in"],
            players=f"{occ}/{t['limit']}"
        ))
    return out

# --- Новый игровой стейт и подключения ---
# Храним состояние текущей раздачи по столам
game_states: dict[int, dict] = {}
# Храним открытые WebSocket-подключения по столам
connections: dict[int, list[WebSocket]] = {}

# --- Функции для раздачи карт ---
def new_deck() -> list[str]:
    """Создает и перемешивает новую колоду из 52 карт."""
    ranks = [str(x) for x in range(2, 11)] + list("JQKA")
    suits = ["♠", "♥", "♦", "♣"]
    deck = [rank + suit for rank in ranks for suit in suits]
    random.shuffle(deck)
    return deck


def start_hand(table_id: int):
    """Инициализирует новую раздачу: раздает по две карты, сбрасывает ставки."""
    # Получаем список игроков за столом
    players = list(seat_map.get(table_id, []))
    if not players:
        return

    # Создаем и перемешиваем колоду
    deck = new_deck()

    # Раздаем игрокам по две карты
    hole_cards = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Начальные стеки (можно вынести в константу)
    starting_stack = 1000
    stacks = {uid: starting_stack for uid in players}

    # Инициализация состояния
    game_states[table_id] = {
        "hole_cards": hole_cards,
        "community": [],
        "stacks": stacks,
        "pot": 0,
        "current_player": players[0],  # первый ходитель
        # "deck": deck  # можно сохранить остаток колоды, если нужно
    }

@app.get("/api/join")
async def api_join(
    user_id: int = Query(..., description="Ваш Telegram user_id"),
    table_id: int = Query(..., description="ID стола")
):
    """
    Присоединяет пользователя к столу. 
    Возвращает success/message.
    """
    # Проверяем, что стол существует
    table = next((t for t in TABLES if t["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Стол не найден")
    # Проверяем лимит
    if len(seat_map[table_id]) >= table["limit"]:
        return {"success": False, "message": "Все места заняты"}
    # Добавляем
    seat_map[table_id].add(user_id)
    return {"success": True, "message": f"Вы присоединились к столу {table_id}"}

@app.get("/api/balance")
async def api_balance(
    user_id: int = Query(..., description="Ваш Telegram user_id")
):
    """
    Заглушка: всегда возвращаем 0.0
    """
    return {"balance": 0.0}

# Монтируем папку webapp/ как статический фронт
# В ней должны лежать ваши index.html, game.html и всё остальное.
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
