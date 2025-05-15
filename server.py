from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from game_ws import router as game_router
from tables import (
    list_tables,
    create_table as create_table_service,
    join_table as join_table_service,
    get_balance as get_balance_service,
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# WebSocket роутер и эндпоинт /api/game_state из game_ws.py
app.include_router(game_router)

@app.get("/api/tables")
def get_tables(level: str = Query(...)):
    # Параметр level в будущем можно использовать для фильтрации
    tables = list_tables()
    return {"tables": tables}

@app.post("/api/tables")
def create_table(level: int = Query(...)):
    table_info = create_table_service(level)
    return table_info

@app.post("/api/join")
def join_table(
    table_id: int = Query(...),
    user_id: str = Query(...),
):
    result = join_table_service(table_id, user_id)
    return result

@app.get("/api/balance")
def get_balance(
    table_id: int = Query(...),
    user_id: str = Query(...),
):
    balance = get_balance_service(table_id, user_id)
    return balance

# Отдаём фронтенд как статические файлы
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
