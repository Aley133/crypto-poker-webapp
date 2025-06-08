from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

from game_ws import router as game_router, broadcast
from tables import (
    list_tables,
    create_table,
    join_table,
    leave_table,
    get_balance,
)
from game_engine import game_states
from db_utils import init_schema, get_balance_db  # <-- только через db_utils

app = FastAPI()

@app.on_event("startup")
def on_startup():
    """
    Инициализируем схему balances через единый init_schema() из db_utils.
    """
    init_schema()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game_router)

@app.get("/api/tables")
def get_tables(level: str = Query(...)):
    """Получить список столов"""
    return {"tables": list_tables()}

@app.post("/api/tables")
def create_table_endpoint(level: int = Query(...)):
    """Создать новый стол"""
    return create_table(level)

@app.post("/api/join")
def join_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок присоединяется к столу"""
    return join_table(table_id, user_id)

@app.post("/api/leave")
async def leave_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок покидает стол — удаляем его, сохраняем баланс, оповещаем по WS"""
    result = leave_table(table_id, user_id)
    # Сохраняем баланс из state (если ещё не был сохранён)
    state = game_states.get(table_id, {})
    stack = state.get("stacks", {}).get(user_id)
    if stack is not None:
        from db_utils import set_balance_db
        set_balance_db(user_id, stack)
    await broadcast(table_id)
    return result

@app.get("/api/balance")
async def api_get_balance(user_id: str = Query(...)):
    """
    Возвращает текущий баланс игрока из БД.
    """
    bal = get_balance_db(user_id)
    return { "balance": bal }

@app.get("/api/balance_legacy")
def get_balance_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """(Legacy) Получить баланс игрока для старого кода"""
    return get_balance(table_id, user_id)

# Статика фронтенда
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
