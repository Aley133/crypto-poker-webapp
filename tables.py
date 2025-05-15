from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

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
def join_table(table_id: int, user_id: str) -> dict:
    """
    Добавляет пользователя за стол или обновляет его присутствие.
    Возвращает статус и список игроков.
    """
    users = seat_map.setdefault(table_id, [])
    # Если пользователь уже за столом, удаляем старую запись, чтобы избежать ошибок
    if user_id in users:
        users.remove(user_id)
    users.append(user_id)
    return {"status": "ok", "players": users}


def leave_table(table_id: int, user_id: str) -> dict:
    """
    Убирает пользователя со стола. Возвращает статус и список оставшихся игроков.
    """
    users = seat_map.get(table_id, [])
    if user_id not in users:
        raise HTTPException(status_code=400, detail="User not at table")
    users.remove(user_id)
    # Сбрасываем флаг начала игры, если игроков стало меньше минимума
    if len(users) < MIN_PLAYERS:
        game_states.get(table_id, {}).pop("started", None)
    return {"status": "ok", "players": users}
"status": "ok", "players": users} join_table(table_id, user_id)

@app.post("/api/leave")
def leave_table_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Игрок покидает стол"""
    return leave_table(table_id, user_id)

@app.get("/api/balance")
def get_balance_endpoint(table_id: int = Query(...), user_id: str = Query(...)):
    """Получить баланс игрока"""
    return get_balance(table_id, user_id)

# Статика фронтенда
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
