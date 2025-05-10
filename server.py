import random
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Разрешаем все CORS, чтобы WebApp всегда достучался
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

# 3) Pydantic-модели ---------------------------------------------------------
class TableInfo(BaseModel):
    id: int
    small_blind: float
    big_blind: float
    buy_in: float
    players: str   # «занято/лимит»

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
    round_stage: str                    # flop|turn|river|showdown

# 4) Хранилище кеш-столов ----------------------------------------------------
TABLES = [
    {"id":1, "small_blind":0.02, "big_blind":0.05, "buy_in":2.5, "limit":6},
    {"id":2, "small_blind":0.05, "big_blind":0.10, "buy_in":7.5, "limit":6},
]
seat_map: Dict[int, Set[int]]        = {t["id"]: set() for t in TABLES}
game_states: Dict[int, CashGameState] = {}

# 5) Вспомогательные функции -------------------------------------------------
def _generate_deck() -> List[str]:
    suits = ['s','h','d','c']
    ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
    return [r+u for u in suits for r in ranks]

def _init_cash_game(table_id: int):
    """Раздаём по 2 карты каждому, выкладываем флоп сразу."""
    players = list(seat_map[table_id])
    deck = _generate_deck()
    random.shuffle(deck)
    # раздача по 2 карты
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    # сразу флоп
    community = [deck.pop(), deck.pop(), deck.pop()]
    stacks = {uid: 100.0 for uid in players}
    state = CashGameState(
        table_id=table_id,
        hole_cards=hole,
        community=community,
        pot=0.0,
        stacks=stacks,
        current_player=random.choice(players) if players else 0,
        round_stage="flop"
    )
    game_states[table_id] = state

# 6) API кеш-столов ----------------------------------------------------------
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
    # Добавляем игрока
    seat_map[table_id].add(user_id)
    # Переинициализируем игру (чтобы раздать карты всем занятым за столом)
    _init_cash_game(table_id)
    return JoinResponse(True, f"Вы присоединились к столу {table_id}")

@app.get("/api/game_state", response_model=CashGameState)
async def api_game_state(user_id: int = Query(...), table_id: int = Query(...)):
    state = game_states.get(table_id)
    if not state or user_id not in state.hole_cards:
        raise HTTPException(404, "Игра не найдена или вы не за столом")
    return state

# 7) WebSocket кеш-игры -----------------------------------------------------
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
        state = game_states[table_id]
        for ws in self.active.get(table_id, []):
            await ws.send_json(state.dict())

manager = ConnectionManager()

@app.websocket("/ws/game/{table_id}")
async def websocket_game(ws: WebSocket, table_id: int):
    await manager.connect(table_id, ws)
    try:
        # шлём начальное состояние сразу
        await manager.broadcast(table_id)
        while True:
            msg = await ws.receive_json()
            uid    = msg.get("user_id")
            action = msg.get("action")
            amt    = msg.get("amount", 0)
            state  = game_states[table_id]
            # только текущий игрок
            if uid == state.current_player:
                if action == "fold":
                    state.round_stage = "showdown"
                elif action == "check":
                    pass
                elif action == "bet" and amt <= state.stacks[uid]:
                    state.stacks[uid] -= amt
                    state.pot += amt
                # прокидываем ход и карту
                _advance_round(state)
            await manager.broadcast(table_id)
    except WebSocketDisconnect:
        manager.disconnect(table_id, ws)

def _advance_round(state: CashGameState):
    """По необходимости добавляем turn, river или сбрасываем стол."""
    deck = [c for c in _generate_deck()
            if c not in sum(state.hole_cards.values(), []) + state.community]
    random.shuffle(deck)
    if state.round_stage == "flop":
        state.community.append(deck.pop())
        state.round_stage = "turn"
    elif state.round_stage == "turn":
        state.community.append(deck.pop())
        state.round_stage = "river"
    elif state.round_stage == "river":
        state.round_stage = "showdown"
    else:
        # после шоудауна начинаем заново
        _init_cash_game(state.table_id)
# Модель одного кеш-стола
class Table(BaseModel):
    id: int
    small_blind: float
    big_blind: float
    buy_in: float
    players: str   # "занято/лимит"

# Заглушечный список столов
TABLES = [
    {"id": 1, "small_blind": 0.02, "big_blind": 0.05, "buy_in": 2.5, "limit": 6},
    {"id": 2, "small_blind": 0.05, "big_blind": 0.10, "buy_in": 7.5, "limit": 6},
    {"id": 3, "small_blind": 0.10, "big_blind": 0.20, "buy_in": 15.0, "limit": 6},
]

# Просто хранение занятых мест (в памяти)
seat_map = {t["id"]: set() for t in TABLES}

@app.get("/api/tables", response_model=List[Table])
async def api_tables(
    user_id: int = Query(..., description="Ваш Telegram user_id"),
    level: str = Query("Low", description="Уровень стола (Low/Mid/VIP)")
):
    """
    Возвращает список кеш-столов.
    Параметр level пока не действует, всегда возвращаем все.
    """
    out = []
    for t in TABLES:
        occ = len(seat_map[t["id"]])
        out.append(Table(
            id=t["id"],
            small_blind=t["small_blind"],
            big_blind=t["big_blind"],
            buy_in=t["buy_in"],
            players=f"{occ}/{t['limit']}"
        ))
    return out

@app.get("/api/join")
async def api_join(
    user_id: int = Query(..., description="Ваш Telegram user_id"),
    table_id: int = Query(..., description="ID стола")
):
    """
    Присоединяет пользователя к столу. 
    Возвращает success/message.
    """
    # Проверяем, что стол существует
    table = next((t for t in TABLES if t["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Стол не найден")
    # Проверяем лимит
    if len(seat_map[table_id]) >= table["limit"]:
        return {"success": False, "message": "Все места заняты"}
    # Добавляем
    seat_map[table_id].add(user_id)
    return {"success": True, "message": f"Вы присоединились к столу {table_id}"}

@app.get("/api/balance")
async def api_balance(
    user_id: int = Query(..., description="Ваш Telegram user_id")
):
    """
    Заглушка: всегда возвращаем 0.0
    """
    return {"balance": 0.0}

# Монтируем папку webapp/ как статический фронт
# В ней должны лежать ваши index.html, game.html и всё остальное.
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
