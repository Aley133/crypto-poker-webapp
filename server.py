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
