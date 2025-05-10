import sqlite3
from enum import Enum
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Инициализация базы данных ---
def init_db():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()

    # Существующие таблицы
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT
    )""")

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
        PRIMARY KEY (tournament_id, user_id),
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
        FOREIGN KEY (user_id)       REFERENCES users(user_id)
    )""")

    # История раздач и действий (опционально)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tournament_hands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round_stage TEXT NOT NULL,
        community TEXT NOT NULL,
        pot REAL NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS player_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hand_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        amount REAL DEFAULT 0,
        action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hand_id) REFERENCES tournament_hands(id),
        FOREIGN KEY (user_id)   REFERENCES users(user_id)
    )""")

    conn.commit()
    conn.close()

# --- Создание приложения ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # в проде можно сузить до домена
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Инициализируем БД при старте
init_db()

# --- Pydantic модели ---
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

class PlayerInGame(BaseModel):
    user_id: int
    chips: int
    bet: float
    status: str

class GameState(BaseModel):
    tournament_id: int
    round_stage: str              # registration|preflop|flop|turn|river|showdown
    community_cards: List[str]
    pot: float
    players: Dict[int, PlayerInGame]
    current_player: int

# --- Endpoints турниров ---
@app.get("/api/tournaments", response_model=List[Tournament])
async def api_tournaments():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT id, name, buy_in, prize_pool, max_players, status FROM tournaments")
    rows = cur.fetchall()
    conn.close()
    return [
        Tournament(
            id=r[0], name=r[1], buy_in=r[2], prize_pool=r[3],
            players=_count_players(r[0]), max_players=r[4], status=r[5]
        ) for r in rows
    ]

def _count_players(tournament_id: int) -> int:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM tournament_players WHERE tournament_id = ? AND eliminated = 0", 
        (tournament_id,)
    )
    count = cur.fetchone()[0]
    conn.close()
    return count

@app.post("/api/join_tournament", response_model=Tournament)
async def api_join_tournament(
    user_id: int = Query(...),
    tournament_id: int = Query(...)
):
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    # Проверяем статус и вместимость
    cur.execute("SELECT buy_in, max_players, status FROM tournaments WHERE id=?", (tournament_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Турнир не найден")
    buy_in, max_p, status = row
    if status != TournamentStatus.registration.value:
        raise HTTPException(400, "Регистрация закрыта")
    players = _count_players(tournament_id)
    if players >= max_p:
        raise HTTPException(400, "Мест нет")
    # Записываем игрока
    start_chips = 1000
    cur.execute(
        "INSERT INTO tournament_players (tournament_id, user_id, chips, eliminated) VALUES (?, ?, ?, 0)",
        (tournament_id, user_id, start_chips)
    )
    # Обновляем призовой пул
    cur.execute(
        "UPDATE tournaments SET prize_pool = prize_pool + ? WHERE id = ?", (buy_in, tournament_id)
    )
    conn.commit()
    cur.execute("SELECT id, name, buy_in, prize_pool, max_players, status FROM tournaments WHERE id=?", (tournament_id,))
    r2 = cur.fetchone()
    conn.close()
    return Tournament(
        id=r2[0], name=r2[1], buy_in=r2[2], prize_pool=r2[3],
        players=_count_players(r2[0]), max_players=r2[4], status=r2[5]
    )

@app.get("/api/tournament_state", response_model=GameState)
async def api_tournament_state(user_id: int = Query(...), tournament_id: int = Query(...)):
    # Заглушка начального состояния
    state = GameState(
        tournament_id=tournament_id,
        round_stage="registration",
        community_cards=[],
        pot=0.0,
        players={},
        current_player=user_id
    )
    return state

# --- WebSocket для игрового стола ---
class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}
    
    async def connect(self, tournament_id: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(tournament_id, []).append(ws)
    
    def disconnect(self, tournament_id: int, ws: WebSocket):
        self.active.get(tournament_id, []).remove(ws)
    
    async def broadcast(self, tournament_id: int, data: dict):
        conns = self.active.get(tournament_id, [])
        for ws in conns:
            await ws.send_json(data)

manager = ConnectionManager()

@app.websocket("/ws/game/{tournament_id}")
async def websocket_game(ws: WebSocket, tournament_id: int):
    await manager.connect(tournament_id, ws)
    try:
        while True:
            msg = await ws.receive_json()
            # TODO: process msg and update state
            new_state = await process_player_action(tournament_id, msg)
            await manager.broadcast(tournament_id, new_state.dict())
    except WebSocketDisconnect:
        manager.disconnect(tournament_id, ws)

async def process_player_action(tournament_id: int, msg: dict) -> GameState:
    # Здесь будет логика игры: ставки, раунды, определение победителя
    # Пока возвращаем текущее состояние
    return await api_tournament_state(user_id=msg.get("user_id"), tournament_id=tournament_id)

# Монтируем статику после всех эндпоинтов
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
