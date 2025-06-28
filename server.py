import os
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from table_manager import TableManager
from db_utils import init_schema, get_balance_db, set_balance_db
from tables import list_tables, create_table, leave_table, get_balance
from game_ws import router as game_router, broadcast
from game_engine import game_states

# ----- Глобальные константы (добавить или убедиться, что есть) -----
# Например:
# BLINDS = {table_id: (sb, bb, max_buy_in), ...}
# GLOBAL_MIN_BUY_IN = 5.0
# seat_map = {table_id: [...], ...}

app = FastAPI()

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.on_event("startup")
def on_startup():
    init_schema()

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

# ------- Новый эндпоинт состояния стола -------
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

# ------- ВНИМАНИЕ! Новый join с seat и deposit -------
@app.post("/api/join")
async def join_table_endpoint(
    table_id:   int   = Query(...),
    user_id:    str   = Query(...),
    seat:       int   = Query(...),
    deposit:    float = Query(...)
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
    result = leave_table(table_id, user_id)
    stacks = game_states.get(table_id, {}).get("stacks", {})
    if user_id in stacks:
        set_balance_db(user_id, stacks[user_id])
    await broadcast(table_id)
    return result

@app.get("/api/balance")
async def api_get_balance(user_id: str = Query(...)):
    bal = get_balance_db(user_id)
    return {"balance": bal}

@app.get("/api/balance_legacy")
def get_balance_legacy(table_id: int = Query(...), user_id: str = Query(...)):
    return get_balance(table_id, user_id)

app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
