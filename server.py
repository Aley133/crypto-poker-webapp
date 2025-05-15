from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Dict, List
import uvicorn

from game_ws import router as game_router, game_states
from game_data import seat_map

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# WebSocket роут и /api/game_state из game_ws.py
app.include_router(game_router)

# Глобальный словарь с настройками блайндов по уровням
BLINDS = {
    1: (1, 2, 100),
    2: (2, 4, 200),
    3: (5, 10, 500),
}

@app.get("/api/tables")
def get_tables(level: str = Query(...)):
    out = []
    for tid, (sb, bb, bi) in BLINDS.items():
        users = seat_map.get(tid, [])
        out.append({
            "id": tid,
            "small_blind": sb,
            "big_blind": bb,
            "buy_in": bi,
            "players": len(users)
        })
    return {"tables": out}

@app.post("/api/tables")
def create_table(level: int = Query(...)):
    # Уровень должен существовать в настройках блайндов
    if level not in BLINDS:
        raise HTTPException(status_code=400, detail="Invalid level")
    # Новый ID — максимальный + 1
    new_id = max(BLINDS.keys()) + 1
    sb, bb, bi = BLINDS[level]
    # Добавляем новую комнату
    BLINDS[new_id] = (sb, bb, bi)
    seat_map[new_id] = []
    game_states[new_id] = {"stacks": {}}
    return {
        "id": new_id,
        "small_blind": sb,
        "big_blind": bb,
        "buy_in": bi,
        "players": 0
    }

@app.post("/api/join")
def join_table(
    table_id: int = Query(...),
    user_id: str = Query(...)
):
    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        raise HTTPException(status_code=400, detail="User already at table")
    users.append(user_id)
    return {"status": "ok", "players": users}

@app.get("/api/balance")
def get_balance(
    table_id: int = Query(...),
    user_id: str = Query(...)
):
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}

# отдаём всю папку webapp как статику
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
