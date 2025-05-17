# server.py
# Статика фронтенда: все запросы отдаём из папки webapp
from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from game_engine import join_table, leave_table, start_hand
from game_ws import router as ws_router

app = FastAPI()

# Статика: CSS/JS/HTML
app.mount("/static", StaticFiles(directory="static"), name="static")

# REST API
@app.post("/api/join")
async def api_join(
    table_id: int = Query(..., alias="table_id"),
    user_id: str = Query(..., alias="user_id"),
    username: str = Query(..., alias="username"),
):
    await join_table(table_id, user_id, username)
    return {"status": "ok"}

@app.post("/api/leave")
async def api_leave(
    table_id: int = Query(..., alias="table_id"),
    user_id: str = Query(..., alias="user_id"),
):
    await leave_table(table_id, user_id)
    return {"status": "ok"}

@app.post("/api/start_hand")
async def api_start_hand(
    table_id: int = Query(..., alias="table_id"),
):
    await start_hand(table_id)
    return {"status": "ok"}

# WebSocket роуты
app.include_router(ws_router, prefix="")

# Точка входа для WebApp (Telegram)
@app.get("/")
def index():
    return FileResponse("static/index.html")

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "webapp"
if not STATIC_DIR.exists():
    raise RuntimeError(f"Static files directory not found: {STATIC_DIR}")

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="webapp")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
