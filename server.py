from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3

app = FastAPI()

# CORS для WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://web.telegram.org", "https://api.telegram.org"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Модели
class Table(BaseModel):
    id: int
    mode: str         # "cash" или "tourney"
    level: str        # Low, Mid, VIP
    small_blind: float
    big_blind: float
    buy_in: float
    players: str      # e.g. "1/6"

class JoinResponse(BaseModel):
    success: bool
    message: str

# Статические данные столов
TABLES = [
    {"id": 1, "mode":"cash","level":"Low", "small_blind":0.02, "big_blind":0.05, "buy_in":2.5, "players":"0/6"},
    {"id": 2, "mode":"cash","level":"Low", "small_blind":0.05, "big_blind":0.10, "buy_in":7.5, "players":"0/6"},
    {"id": 3, "mode":"cash","level":"Mid", "small_blind":0.10, "big_blind":0.20, "buy_in":20.0,"players":"3/6"},
    # и т.д.
]

# Состояние столов — множества user_id
seat_map = {t["id"]: set() for t in TABLES}

# Хранилище WebSocket-подключений
class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()
    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)
    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
    async def broadcast(self, data: dict):
        text = json.dumps(data)
        for ws in set(self.active):
            await ws.send_text(text)

manager = ConnectionManager()

# Эндпоинт WebSocket для таблиц
@app.websocket("/ws/tables")
async def websocket_tables(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # мы не ожидаем запросов, просто держим коннект
    except WebSocketDisconnect:
        manager.disconnect(ws)

@app.get("/api/tables", response_model=list[Table])
async def api_tables(
    user_id: int = Query(...),
    mode: str   = Query("cash"),
    level: str  = Query("Low")
):
    out = []
    for t in TABLES:
        if t["mode"] == mode and t["level"] == level:
            occ = len(seat_map[t["id"]])
            cap = int(t["players"].split("/")[1])
            t2 = t.copy()
            t2["players"] = f"{occ}/{cap}"
            out.append(t2)
    return out

@app.get("/api/join", response_model=JoinResponse)
async def api_join(user_id: int = Query(...), table_id: int = Query(...)):
    if table_id not in seat_map:
        raise HTTPException(404, "Стол не найден")
    cap = int(next(t for t in TABLES if t["id"]==table_id)["players"].split("/")[1])
    if len(seat_map[table_id]) >= cap:
        return JoinResponse(success=False, message="Все места заняты")
    seat_map[table_id].add(user_id)
    # Нотификация всем через WS
    await manager.broadcast({
        "type": "update",
        "table_id": table_id,
        "players": f"{len(seat_map[table_id])}/{cap}"
    })
    return JoinResponse(success=True, message=f"Вы присоединились к столу {table_id}")
    
# Ответ по балансу
class BalanceResponse(BaseModel):
    balance: float

# Ответ по депозиту
class DepositResponse(BaseModel):
    address: str

# Ответ по выводу
class WithdrawResponse(BaseModel):
    instructions: str

# Ответ по истории
class HistoryResponse(BaseModel):
    history: list[str]

# Получить или создать адрес кошелька
def get_or_create_wallet(user_id: int) -> str:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT wallet_address FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    if row and row[0]:
        address = row[0]
    else:
        address = f"test_wallet_{user_id}"
        cur.execute(
            "INSERT OR REPLACE INTO users (user_id, wallet_address) VALUES (?, ?)",
            (user_id, address)
        )
        conn.commit()
    conn.close()
    return address

@app.get("/api/balance", response_model=BalanceResponse)
async def api_balance(user_id: int = Query(...)):
    # TODO: реальная логика из блокчейн-API
    return BalanceResponse(balance=0.00)

@app.get("/api/deposit", response_model=DepositResponse)
async def api_deposit(user_id: int = Query(...)):
    address = get_or_create_wallet(user_id)
    return DepositResponse(address=address)

@app.get("/api/withdraw", response_model=WithdrawResponse)
async def api_withdraw(user_id: int = Query(...)):
    # TODO: валидация баланса и отправка транзакции
    instructions = "Отправьте сумму и адрес в формате: <amount> <address>, например: 10 0xABC..."
    return WithdrawResponse(instructions=instructions)

@app.get("/api/history", response_model=HistoryResponse)
async def api_history(user_id: int = Query(...)):
    # TODO: возвращать реальную историю из базы
    return HistoryResponse(history=[])


# Монтируем статику ПОСЛЕ API-эндпоинтов
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
