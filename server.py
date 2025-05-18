from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi import Query
from game_data import seat_map
from game_engine import game_states

from game_ws import router as game_router
from tables import (
    list_tables,
    create_table,
    join_table,
    leave_table,
    get_balance,
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket-роутер и HTTP эндпоинт /api/game_state
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
def leave_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок покидает стол"""
    return leave_table(table_id, user_id)

@app.get("/api/balance")
def get_balance_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Получить баланс игрока"""
    return get_balance(table_id, user_id)

@app.get("/api/game_state")
def get_game_state(table_id: int = Query(...)) -> dict:
    """
    Возвращает текущий список игроков и состояние игры для заданного стола.
    """
    players = seat_map.get(table_id, [])
    state = game_states.get(table_id, {})
    return {"players": players, "state": state}

# Статика фронтенда
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
