from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from game_data import seat_map
from game_engine import start_hand, apply_action, game_states, connections
from game_ws import router as game_router

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# WebSocket и /api/game_state
app.include_router(game_router)

# Статический список столов
DEFAULT_TABLES = [
    {"id": 1, "small_blind": 1, "big_blind": 2, "buy_in": 100},
    {"id": 2, "small_blind": 2, "big_blind": 4, "buy_in": 200},
    {"id": 3, "small_blind": 5, "big_blind": 10, "buy_in": 500},
]

@app.get("/api/tables")
def get_tables():
    tables = []
    for t in DEFAULT_TABLES:
        tid = t["id"]
        players = len(seat_map.get(tid, []))
        tables.append({
            **t,
            "players": players
        })
    return {"tables": tables}

@app.post("/api/join")
def join_table(table_id: int = Query(...), user_id: int = Query(...)):
    users = seat_map.setdefault(table_id, [])
    if user_id in users:
        raise HTTPException(400, "User already at table")
    users.append(user_id)
    # При первом вхождении за этот стол можно сразу инициализировать руку:
    if table_id not in game_states:
        start_hand(table_id)
    return {"status": "ok", "players": users}

@app.get("/api/balance")
def get_balance(table_id: int = Query(...), user_id: int = Query(...)):
    stacks = game_states.get(table_id, {}).get("stacks", {})
    return {"balance": stacks.get(user_id, 0)}

from fastapi.responses import FileResponse

@app.get("/game.html")
async def no_cache_game_html():
    """
    Всегда отдаём свежий game.html без кеша.
    """
    return FileResponse(
        "webapp/game.html",
        media_type="text/html",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
    )

# Раздача статики
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

# Отключаем кеширование статики (для разработки)
from starlette.responses import FileResponse
@app.middleware("http")
async def no_cache_middleware(request, call_next):
    response = await call_next(request)
    if isinstance(response, FileResponse):
        response.headers["Cache-Control"] = "no-store"
    return response

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
