import os
import uvicorn
from fastapi import FastAPI, Query, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db_utils import init_schema, get_balance_db, set_balance_db
from tables import (
    list_tables,
    create_table,
    join_table,
    leave_table,
    get_balance,
    get_table_config,
    get_players,
)
from table_manager import TableManager
from game_ws import router as game_router, broadcast
from game_engine import game_states
from auth import require_auth

app = FastAPI()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


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
def get_tables(level: str = Query(...), auth=Depends(require_auth)):
    """Получить список столов указанного уровня"""
    all_tables = list_tables()
    return {"tables": [t for t in all_tables if t["level"] == level]}


@app.post("/api/tables")
def create_table_endpoint(level: str = Query(...)):
    """Создать новый стол"""
    return create_table(level)


@app.post("/api/join")
async def join(
    table_id: int = Query(...),
    user_id: str = Query(...),
    seat: int = Query(...),
    deposit: float = Query(...),
    auth=Depends(require_auth),
):
    cfg = get_table_config(table_id)
    if deposit < cfg["min_deposit"] or deposit > cfg["max_deposit"]:
        raise HTTPException(400, "Deposit out of range")
    await TableManager.join(user_id, table_id, deposit, seat)
    return {"status": "ok", "players": get_players(table_id)}


@app.post("/api/leave")
async def leave_table_endpoint(
    table_id: int = Query(...),
    user_id: str = Query(...),
    auth=Depends(require_auth),
):
    """
    Игрок покидает стол — удаляем из памяти, сохраняем баланс, оповещаем WS.
    """
    result = leave_table(table_id, user_id)
    # Сохраняем баланс уходящего
    stacks = game_states.get(table_id, {}).get("stacks", {})
    if user_id in stacks:
        set_balance_db(user_id, stacks[user_id])
    # Оповещаем всех клиентов
    await broadcast(table_id)
    return result


@app.get("/api/balance")
async def api_get_balance(user_id: str = Query(...), auth=Depends(require_auth)):
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
