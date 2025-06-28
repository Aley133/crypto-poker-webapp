import os
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from table_manager import TableManager
from db_utils import init_schema, get_balance_db, set_balance_db
from tables import list_tables, create_table, join_table, leave_table, get_balance
from game_ws import router as game_router, broadcast
from game_engine import game_states

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
def get_tables(level: str = Query(...)):
    """Получить список столов"""
    return {"tables": list_tables()}

@app.post("/api/tables")
def create_table_endpoint(level: int = Query(...)):
    """Создать новый стол"""
    return create_table(level)

@app.get("/api/tables/{table_id}/state")
def get_table_state(table_id: int):
    state = game_states.get(table_id, {})
    sb, bb, max_buy_in = BLINDS[table_id]
    min_buy_in = GLOBAL_MIN_BUY_IN
    return {
        "table_id":    table_id,
        "seats":       seat_map.get(table_id, []),
        "stacks":      state.get("stacks", {}),
        "min_deposit": min_buy_in,
        "max_deposit": max_buy_in,
        **state  # остальные поля (community, pot и т.д.)
    }

@app.post("/api/join")
async def join_table_endpoint(
    table_id:   int     = Query(...),
    user_id:    str     = Query(...),
    seat:       int     = Query(...),
    deposit:    float   = Query(...)
):
    """
    Игрок присоединяется к столу с конкретным депозитом и местом.
    """
    return await TableManager.join(
        player_id= user_id,
        table_id=  table_id,
        deposit=   deposit,
        seat_idx=  seat
    )

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

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
