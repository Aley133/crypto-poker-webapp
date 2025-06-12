import os
import uvicorn
import socketio
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db_utils import init_schema, get_balance_db, set_balance_db
from tables import (
    list_tables, create_table, join_table, leave_table,
    get_balance, get_deposit_limits
)
from game_ws import router as game_router, broadcast, sio
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

@app.post("/api/join")
def join_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок присоединяется к столу"""
    return join_table(table_id, user_id)

@app.post("/api/join-seat")
def join_seat_endpoint(
    table_id: int = Query(...),
    user_id: str = Query(...),
    seat: int = Query(...),
    deposit: float = Query(...)
):
    """Занять конкретное место за столом с выбором депозита"""
    state = game_states.setdefault(table_id, {})
    N = 6
    seats = state.setdefault("seats", [None] * N)
    player_seats = state.setdefault("player_seats", {})
    if seat < 0 or seat >= N or (seats[seat] and seats[seat] != user_id):
        raise HTTPException(status_code=400, detail="Seat occupied")

    # Проверяем депозит
    min_dep, max_dep = get_deposit_limits(table_id)
    if deposit < min_dep or deposit > max_dep:
        raise HTTPException(status_code=400, detail="Invalid deposit amount")

    bal = get_balance_db(user_id)
    if bal < deposit:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    set_balance_db(user_id, bal - deposit)

    if user_id in player_seats:
        old = player_seats[user_id]
        if 0 <= old < N and seats[old] == user_id:
            seats[old] = None
    seats[seat] = user_id
    player_seats[user_id] = seat

    stacks = state.setdefault("stacks", {})
    stacks[user_id] = deposit

    state["players"] = [u for u in seats if u]
    state["player_seats"] = player_seats
    state["stacks"] = stacks
    game_states[table_id] = state
    return {"status": "ok", "seat": seat, "deposit": deposit}

@app.post("/api/leave")
async def leave_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
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

# ASGI app combining FastAPI and Socket.IO
socketio_app = socketio.ASGIApp(sio, other_asgi_app=app)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(socketio_app, host="0.0.0.0", port=port)
