import random
import sqlite3
from enum import Enum
from typing import Dict, List, Set

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 1) Инициализация БД --------------------------------------------------------
def init_db():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT
    )""")
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
    # Остальные таблицы турниров при необходимости...
    conn.commit()
    conn.close()

# 2) FastAPI + CORS + статические файлы -------------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
init_db()
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

# 3) Модели ------------------------------------------------------------------
class TableInfo(BaseModel):
    id: int
    small_blind: float
    big_blind: float
    buy_in: float
    players: str   # "занято/лимит"

class JoinResponse(BaseModel):
    success: bool
    message: str

class CashGameState(BaseModel):
    table_id: int
    hole_cards: Dict[int, List[str]]    # user_id → [c1,c2]
    community: List[str]
    pot: float
    stacks: Dict[int, float]            # user_id → текущий стек
    current_player: int
    round_stage: str                    # preflop|flop|turn|river|showdown

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

# 4) Хранилище cash-столов --------------------------------------------------
# Преднастроенные столы
TABLES = [
    {"id":1, "small_blind":0.02, "big_blind":0.05, "buy_in":2.5, "limit":6},
    {"id":2, "small_blind":0.05, "big_blind":0.10, "buy_in":7.5, "limit":6},
]
seat_map: Dict[int, Set[int]]      = {t["id"]: set() for t in TABLES}
game_states: Dict[int, CashGameState] = {}

# 5) API cash-столов ---------------------------------------------------------
@app.get("/api/tables", response_model=List[TableInfo])
async def api_tables(user_id: int = Query(...), mode: str = Query("cash"), level: str = Query("Low")):
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
    if table_id not in game_states:
        _init_cash_game(table_id)
    return JoinResponse(True, f"Вы присоединились к столу {table_id}")

@app.get("/api/game_state", response_model=CashGameState)
async def api_game_state(user_id: int = Query(...), table_id: int = Query(...)):
    state = game_states.get(table_id)
    if not state or user_id not in state.hole_cards:
        raise HTTPException(404, "Игра не найдена или вы не за столом")
    return state

# 6) Логика кеш-игры --------------------------------------------------------
def _init_cash_game(table_id: int):
    players = list(seat_map[table_id])
    deck = _generate_deck()
    random.shuffle(deck)
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: 100.0 for uid in players}
    state = CashGameState(
        table_id=table_id,
        hole_cards=hole,
        community=[],
        pot=0.0,
        stacks=stacks,
        current_player=random.choice(players),
        round_stage="preflop"
    )
    game_states[table_id] = state

def _generate_deck() -> List[str]:
    suits = ['s','h','d','c']
    ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
    return [r+u for u in suits for r in ranks]

# 7) WebSocket для кеш-игры -------------------------------------------------
from fastapi import WebSocket  # убедиться, что импорт есть!

class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}
    async def connect(self, table_id: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(table_id, []).append(ws)
    def disconnect(self, table_id: int, ws: WebSocket):
        self.active[table_id].remove(ws)
    async def broadcast(self, table_id: int):
        state = game_states[table_id]
        for ws in self.active.get(table_id, []):
            await ws.send_json(state.dict())

manager = ConnectionManager()

@app.websocket("/ws/game/{table_id}")
async def websocket_game(ws: WebSocket, table_id: int):
    await manager.connect(table_id, ws)
    try:
        # сразу шлём текущий state
        await manager.broadcast(table_id)
        while True:
            msg = await ws.receive_json()
            _process_cash_action(table_id, msg)
            await manager.broadcast(table_id)
    except WebSocketDisconnect:
        manager.disconnect(table_id, ws)

def _process_cash_action(table_id: int, msg: dict):
    state = game_states[table_id]
    uid = msg.get("user_id")
    if uid != state.current_player:
        return
    act = msg.get("action")
    amt = msg.get("amount", 0)
    if act == "fold":
        state.round_stage = "showdown"
    elif act == "check":
        pass
    elif act == "bet" and amt<=state.stacks[uid]:
        state.stacks[uid] -= amt
        state.pot += amt
    _advance_round(state)

def _advance_round(state: CashGameState):
    deck = [c for c in _generate_deck() 
            if c not in sum(state.hole_cards.values(),[]) + state.community]
    random.shuffle(deck)
    if state.round_stage=="preflop":
        state.community = [deck.pop(), deck.pop(), deck.pop()]
        state.round_stage = "flop"
    elif state.round_stage=="flop":
        state.community.append(deck.pop()); state.round_stage="turn"
    elif state.round_stage=="turn":
        state.community.append(deck.pop()); state.round_stage="river"
    elif state.round_stage=="river":
        state.round_stage="showdown"
    else:
        _init_cash_game(state.table_id)

# 8) Endpoints турниров -----------------------------------------------------
def _count_players(t_id: int) -> int:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM tournament_players WHERE tournament_id=? AND eliminated=0", 
        (t_id,)
    )
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
