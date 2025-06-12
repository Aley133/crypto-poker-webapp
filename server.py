import os
import uvicorn
from fastapi import FastAPI, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db_utils import init_schema, get_balance_db
from tables import list_tables, create_table, get_balance, get_table_config
from game_ws import router as game_router
from table_manager import TableManager
from game_engine import game_states

app = FastAPI()

@app.on_event("startup")
def on_startup():
    """
    Инициализируем схему balances через db_utils.
    """
    init_schema()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket маршруты
app.include_router(game_router)

# API для игровых столов
@app.get("/api/tables")
def get_tables(level: str = Query(...)):
    """Получить список столов"""
    return {"tables": list_tables()}

@app.post("/api/tables")
def create_table_endpoint(level: int = Query(...)):
    """Создать новый стол"""
    return create_table(level)


@app.get("/api/table_config")
def table_config_endpoint(table_id: int = Query(...)):
    """Возвращает конфиг стола для фронтенда."""
    return get_table_config(table_id)

@app.post("/api/join")
async def join_table_endpoint(
    table_id: int = Query(...),
    user_id: str = Query(...),
    payload: dict = Body(...)
):
    """Игрок выбирает место и депозит."""
    deposit = int(payload.get("deposit", 0))
    seat_idx = int(payload.get("seat_idx", -1))
    return await TableManager.join(user_id, table_id, deposit, seat_idx)

@app.post("/api/leave")
async def leave_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок покидает стол. Делегируем TableManager."""
    return await TableManager.leave(user_id, table_id)

@app.get("/api/balance")
async def api_get_balance(user_id: str = Query(...)):
    """Возвращает текущий баланс игрока из БД."""
    bal = get_balance_db(user_id)
    return {"balance": bal}

@app.get("/api/balance_legacy")
def get_balance_legacy(table_id: int = Query(...), user_id: str = Query(...)):
    """(Legacy) Получить баланс игрока для старого кода"""
    return get_balance(table_id, user_id)

# Статика фронтенда
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
