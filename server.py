import sqlite3
from enum import Enum
from typing import Dict, List, Set

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Инициализация базы данных ---
def init_db():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    # Пользователи
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT
    )""")
    # Cash-столы не требуют БД (в памяти)
    # Турниры и участники
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        buy_in REAL NOT NULL,
        prize_pool REAL NOT NULL DEFAULT 0,
        max_players INTEGER NOT NULL,
        status TEXT NOT NULL
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tournament_players (
        tournament_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        chips INTEGER NOT NULL,
        eliminated BOOLEAN NOT NULL DEFAULT 0,
        joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tournament_id, user_id)
    )""")
    # Доп. таблицы по истории раздач
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tournament_hands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round_stage TEXT NOT NULL,
        community TEXT NOT NULL,
        pot REAL NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS player_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hand_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        amount REAL DEFAULT 0,
        action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    conn.commit()
    conn.close()

# --- Приложение FastAPI ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
# Инициализируем БД
init_db()

# --- Модели для cash-игры ---
class Table(BaseModel):
    id: int
    mode: str        # "cash"
    level: str       # Low, Mid, VIP
    small_blind: float
    big_blind: float
    buy_in: float
    players: str     # "occupied/limit"

class JoinResponse(BaseModel):
    success: bool
    message: str

# Заглушечные cash-столы
TABLES = [
    {"id":1, "mode":"cash","level":"Low","small_blind":0.02,"big_blind":0.05,"buy_in":2.5,"players":"0/6"},
    {"id":2, "mode":"cash","level":"Low","small_blind":0.05,"big_blind":0.10,"buy_in":7.5,"players":"0/6"},
    {"id":3, "mode":"cash","level":"Mid","small_blind":0.10,"big_blind":0.20,"buy_in":20.0,"players":"3/6"},
]
# Состояние занятости в памяти
seat_map: Dict[int, Set[int]] = {t["id"]: set() for t in TABLES}

# WebSocket manager для cash-столов
class CashManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}
    async def connect(self, table_id: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(table_id, []).append(ws)
    def disconnect(self, table_id: int, ws: WebSocket):
        self.active.get(table_id, []).remove(ws)
    async def broadcast(self, table_id: int, data: dict):
        for ws in self.active.get(table_id, []):
            await ws.send_json(data)

cash_manager = CashManager()

@app.get("/api/tables", response_model=List[Table])
async def api_tables(
    user_id: int = Query(...),
    mode: str   = Query("cash"),
    level: str  = Query("Low")
):
    result = []
    for t in TABLES:
        if t["mode"]==mode and t["level"]==level:
            occ = len(seat_map[t["id"]])
            limit = int(t["players"].split("/")[1])
            t2 = t.copy()
            t2["players"] = f"{occ}/{limit}"
            result.append(t2)
    return result

@app.get("/api/join", response_model=JoinResponse)
async def api_join(user_id: int = Query(...), table_id: int = Query(...)):
    if table_id not in seat_map:
        raise HTTPException(404, "Стол не найден")
    limit = int(next(t for t in TABLES if t["id"]==table_id)["players"].split("/")[1])
    if len(seat_map[table_id]) >= limit:
        return JoinResponse(success=False, message="Все места заняты")
    seat_map[table_id].add(user_id)
    # пушим обновление по WS
    await cash_manager.broadcast(table_id, {"type":"update","table_id":table_id,"players":f"{len(seat_map[table_id])}/{limit}"})
    return JoinResponse(success=True, message=f"Вы присоединились к столу {table_id}")

@app.websocket("/ws/tables/{table_id}")
async def websocket_tables(ws: WebSocket, table_id: int):
    await cash_manager.connect(table_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        cash_manager.disconnect(table_id, ws)

# --- Модели для турниров ---
class TournamentStatus(str, Enum):
    registration = "registration"
    running      = "running"
    finished     = "finished"

class Tournament(BaseModel):
    id: int
    name: str
    buy_in: float
    prize_pool: float
    players: int
    max_players: int
    status: TournamentStatus

# вспомогательная функция
def _count_players(t_id: int) -> int:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=? AND eliminated=0", (t_id,))
    cnt = cur.fetchone()[0]
    conn.close()
    return cnt

@app.get("/api/tournaments", response_model=List[Tournament])
async def api_tournaments():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT id,name,buy_in,prize_pool,max_players,status FROM tournaments")
    rows = cur.fetchall()
    conn.close()
    return [
        Tournament(
            id=r[0], name=r[1], buy_in=r[2], prize_pool=r[3],
            players=_count_players(r[0]), max_players=r[4], status=r[5]
        ) for r in rows
    ]

@app.post("/api/join_tournament", response_model=Tournament)
async def api_join_tournament(user_id: int = Query(...), tournament_id: int = Query(...)):
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT buy_in,max_players,status FROM tournaments WHERE id=?", (tournament_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Турнир не найден")
    buy_in, max_p, status = row
    if status != TournamentStatus.registration.value:
        raise HTTPException(400, "Регистрация закрыта")
    if _count_players(tournament_id) >= max_p:
        raise HTTPException(400, "Мест нет")
    start_chips = 1000
    cur.execute("INSERT INTO tournament_players (tournament_id,user_id,chips,eliminated) VALUES(?,?,?,0)",
                (tournament_id, user_id, start_chips))
    cur.execute("UPDATE tournaments SET prize_pool=prize_pool+? WHERE id=?", (buy_in, tournament_id))
    conn.commit()
    cur.execute("SELECT id,name,buy_in,prize_pool,max_players,status FROM tournaments WHERE id=?", (tournament_id,))
    r2 = cur.fetchone()
    conn.close()
    return Tournament(
        id=r2[0], name=r2[1], buy_in=r2[2], prize_pool=r2[3],
        players=_count_players(r2[0]), max_players=r2[4], status=r2[5]
    )

# --- Статика ---
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
