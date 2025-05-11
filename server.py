# server.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Dict, List
import uvicorn

from game_data import seat_map
from game_ws import router as game_router, game_states

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# Подключаем WS- и /api/game_state из game_ws.py
app.include_router(game_router)

# === Статический список столов ===
DEFAULT_TABLES = [
    {"id": 1, "small_blind": 1, "big_blind": 2, "buy_in": 100},
    {"id": 2, "small_blind": 2, "big_blind": 4, "buy_in": 200},
    {"id": 3, "small_blind": 5, "big_blind": 10, "buy_in": 500},
    # Добавьте здесь другие столы по необходимости
]

@app.get("/api/tables")
def get_tables():
    """
    Возвращает список всех столов с их SB/BB, бай-ином и числом игроков.
    """
    tables = []
    for t in DEFAULT_TABLES:
        tid = t["id"]
        players = len(seat_map.get(tid, []))
        tables.append({
            "id": tid,
            "small_blind": t["small_blind"],
            "big_blind": t["big_blind"],
            "buy_in": t["buy_in"],
            "players": players
        })
    return {"tables": tables}

@app.post("/api/join")
def join_table(table_id: int = Query(...), user_id: int = Query(...)):
    """
    Игрок user_id садится за стол table_id.
    Возвращает status=ok или ошибку, если уже за столом.
    """
    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        raise HTTPException(status_code=400, detail="User already at table")
    users.append(user_id)
    return {"status": "ok", "players": users}

@app.get("/api/balance")
def get_balance(table_id: int = Query(...), user_id: int = Query(...)):
    """
    Возвращает стек игрока из game_states (если рука идёт),
    иначе 0.
    """
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}

# Статика фронтенда
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
