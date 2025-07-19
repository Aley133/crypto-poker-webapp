import os
import uvicorn
from fastapi import FastAPI, Query, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db_utils import init_schema, get_balance_db, set_balance_db
from tables import list_tables, create_table, join_table, leave_table, get_balance, DEPOSIT_RANGES
from utils_telegram import validate_telegram_init_data
from game_ws import router as game_router, broadcast
from game_engine import game_states

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
    return {"tables": list_tables()}


@app.post("/api/tables")
def create_table_endpoint(level: int = Query(...)):
    return create_table(level)


@app.post("/api/join")
def join_table_endpoint(
    initData: str = Body(..., embed=True),
    table_id: int = Body(..., embed=True),
    deposit: float = Body(..., embed=True),
):
    # 1) Валидация initData и получение user_id
    try:
        user = validate_telegram_init_data(initData)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
    user_id = str(user["id"])

    # 2) Проверка диапазона депозитов для стола
    if table_id not in DEPOSIT_RANGES:
        raise HTTPException(status_code=400, detail="Invalid table_id")
    min_dep, max_dep = DEPOSIT_RANGES[table_id]
    if not (min_dep <= deposit <= max_dep):
        raise HTTPException(
            status_code=400,
            detail=f"Deposit must be between {min_dep} and {max_dep}"
        )

    # 3) Проверка баланса в БД и списание
    current_bal = get_balance_db(user_id)
    if deposit > current_bal:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    set_balance_db(user_id, current_bal - deposit)

    # 4) Добавляем пользователя за стол
    res = join_table(table_id, user_id)
    # Сохраняем депозит в памяти, чтобы потом вернуть при выходе
    state = game_states.setdefault(table_id, {})
    deps = state.setdefault("deposits", {})
    deps[user_id] = deposit

    # 5) Оповещение всех WS-клиентов
    broadcast(table_id)

    return res


@app.post("/api/leave")
async def leave_table_endpoint(
    table_id: int = Query(...),
    user_id: str = Query(...),
):
    result = leave_table(table_id, user_id)
    # Возвращаем остаток стека на баланс
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
