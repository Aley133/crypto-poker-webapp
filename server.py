import random
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from game_ws import router as game_router

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
