import random
import sqlite3
from enum import Enum
from typing import Dict, List, Set

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# -----------------------------------------------------------------------------
# 1) Инициализация БД
# -----------------------------------------------------------------------------
def init_db():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    # Пользователи
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT
    )""")
    # Турниры
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
    # История раздач
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

# -----------------------------------------------------------------------------
# 2) Создаём приложение и CORS
# -----------------------------------------------------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # в продакшене ограничьте домен
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Инициализируем БД
# -----------------------------------------------------------------------------
init_db()

# -----------------------------------------------------------------------------
# 3) Pydantic-модели
# -----------------------------------------------------------------------------
class TableInfo(BaseModel):
    id: int
    small_blind: float
    big_blind: float
    buy_in: float
    players: str

class JoinResponse(BaseModel):
    success: bool
    message: str

class CashGameState(BaseModel):
    table_id: int
    hole_cards: Dict[int, List[str]]
    community: List[str]
    pot: float
    stacks: Dict[int, float]
    current_player: int
    round_stage: str

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

# -----------------------------------------------------------------------------
# 4) In-memory: cash-столы
# -----------------------------------------------------------------------------
TABLES = [
    {"id":1, "small_blind":0.02, "big_blind":0.05, "buy_in":2.5, "limit":6},
    {"id":2, "small_blind":0.05, "big_blind":0.10, "buy_in":7.5, "limit":6},
]
seat_map: Dict[int, Set[int]]         = {t["id"]: set() for t in TABLES}
game_states: Dict[int, CashGameState] = {}

# -----------------------------------------------------------------------------
# 5) Помощники для кеш-игры
# -----------------------------------------------------------------------------
def _generate_deck() -> List[str]:
    suits = ['s','h','d','c']
    ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
    return [r+u for u in suits for r in ranks]

def _init_cash_game(table_id: int):
    players = list(seat_map[table_id])
    deck    = _generate_deck()
    random.shuffle(deck)
    hole      = {uid:[deck.pop(), deck.pop()] for uid in players}
    community = [deck.pop(), deck.pop(), deck.pop()]
    stacks    = {uid:100.0 for uid in players}
    current   = random.choice(players) if players else 0
    game_states[table_id] = CashGameState(
        table_id=table_id,
        hole_cards=hole,
        community=community,
        pot=0.0,
        stacks=stacks,
        current_player=current,
        round_stage="flop"
    )

# -----------------------------------------------------------------------------
# 6) Эндпоинты кеш-столов
# -----------------------------------------------------------------------------
@app.get("/api/tables", response_model=List[TableInfo])
async def api_tables(user_id: int = Query(...), level: str = Query("Low")):
    out = []
    for t in TABLES:
        occ = len(seat_map[t["id"]])
        out.append(TableInfo(
            id=t["id"],
            small_blind=t["small_blind"],
            big_blind=t["big_blind"],
            buy_in=t["buy_in"],
            players=f"{occ}/{t['limit']}"
        ))
    return out

@app.get("/api/join", response_model=JoinResponse)
async def api_join(user_id: int = Query(...), table_id: int = Query(...)):
    table = next((x for x in TABLES if x["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Стол не найден")
    if len(seat_map[table_id]) >= table["limit"]:
        return JoinResponse(False, "Все места заняты")
    seat_map[table_id].add(user_id)
    _init_cash_game(table_id)
    return JoinResponse(True, f"Вы присоединились к столу {table_id}")

@app.get("/api/game_state", response_model=CashGameState)
async def api_game_state(user_id: int = Query(...), table_id: int = Query(...)):
    state = game_states.get(table_id)
    if not state or user_id not in state.hole_cards:
        raise HTTPException(404, "Игра не найдена или вы не за столом")
    return state

# -----------------------------------------------------------------------------
# 7) WebSocket кеш-игры
# -----------------------------------------------------------------------------
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}

    async def connect(self, table_id: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(table_id, []).append(ws)

    def disconnect(self, table_id: int, ws: WebSocket):
        self.active[table_id].remove(ws)

    async def broadcast(self, table_id: int):
        state = game_states.get(table_id)
        if not state:
            return
        for ws in self.active.get(table_id, []):
            await ws.send_json(state.dict())

manager = ConnectionManager()

@app.websocket("/ws/game/{table_id}")
async def websocket_game(ws: WebSocket, table_id: int):
    await manager.connect(table_id, ws)
    try:
        await manager.broadcast(table_id)
        while True:
            msg = await ws.receive_json()
            uid, action, amount = msg.get("user_id"), msg.get("action"), msg.get("amount",0)
            state = game_states.get(table_id)
            if state and uid == state.current_player:
                if action=="fold": state.round_stage="showdown"
                elif action=="check": pass
                elif action=="bet" and amount<=state.stacks[uid]:
                    state.stacks[uid]-=amount; state.pot+=amount
                _advance_round(state)
            await manager.broadcast(table_id)
    except WebSocketDisconnect:
        manager.disconnect(table_id, ws)

def _advance_round(state: CashGameState):
    used = sum(state.hole_cards.values(),[]) + state.community
    deck = [c for c in _generate_deck() if c not in used]
    random.shuffle(deck)
    if state.round_stage=="flop":
        state.community.append(deck.pop()); state.round_stage="turn"
    elif state.round_stage=="turn":
        state.community.append(deck.pop()); state.round_stage="river"
    elif state.round_stage=="river":
        state.round_stage="showdown"
    else:
        _init_cash_game(state.table_id)

# -----------------------------------------------------------------------------
# 8) Эндпоинты турниров
# -----------------------------------------------------------------------------
def _count_players(tid: int) -> int:
    conn = sqlite3.connect("poker.db"); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=? AND eliminated=0",(tid,))
    cnt=cur.fetchone()[0]; conn.close(); return cnt

@app.get("/api/tournaments", response_model=List[Tournament])
async def api_tournaments():
    conn = sqlite3.connect("poker.db"); cur=conn.cursor()
    cur.execute("SELECT id,name,buy_in,prize_pool,max_players,status FROM tournaments")
    rows=cur.fetchall(); conn.close()
    return [
        Tournament(
            id=r[0], name=r[1], buy_in=r[2], prize_pool=r[3],
            players=_count_players(r[0]), max_players=r[4], status=r[5]
        ) for r in rows
    ]

@app.post("/api/join_tournament", response_model=Tournament)
async def api_join_tournament(user_id: int = Query(...), tournament_id: int = Query(...)):
    conn=sqlite3.connect("poker.db"); cur=conn.cursor()
    cur.execute("SELECT buy_in,max_players,status FROM tournaments WHERE id=?", (tournament_id,))
    row=cur.fetchone()
    if not row: conn.close(); raise HTTPException(404,"Турнир не найден")
    buy_in,max_p,status=row
    if status!=TournamentStatus.registration.value: conn.close(); raise HTTPException(400,"Регистрация закрыта")
    if _count_players(tournament_id)>=max_p: conn.close(); raise HTTPException(400,"Мест нет")
    cur.execute("INSERT INTO tournament_players(tournament_id,user_id,chips,eliminated) VALUES(?,?,?,0)",
                (tournament_id,user_id,1000))
    cur.execute("UPDATE tournaments SET prize_pool=prize_pool+? WHERE id=?", (buy_in,tournament_id))
    conn.commit()
    cur.execute("SELECT id,name,buy_in,prize_pool,max_players,status FROM tournaments WHERE id=?", (tournament_id,))
    r2=cur.fetchone(); conn.close()
    return Tournament(
        id=r2[0], name=r2[1], buy_in=r2[2], prize_pool=r2[3],
        players=_count_players(r2[0]), max_players=r2[4], status=r2[5]
    )

@app.get("/api/tournament_state")
async def api_tournament_state(user_id: int = Query(...), tournament_id: int = Query(...)):
    raise HTTPException(501,"Не реализовано")
