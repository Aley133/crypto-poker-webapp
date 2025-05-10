# server.py
import os
import sqlite3
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Если веб-приложение будет обращаться из iframe Telegram
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://web.telegram.org", "https://api.telegram.org"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Монтируем папку с index.html (положите туда свежий фронт)
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")


# Pydantic-модель ответа
class BalanceResponse(BaseModel):
    balance: float


def get_user_balance(user_id: int) -> float:
    # Пример: читаем кошелёк из sqlite и возвращаем фиктивное число
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT wallet_address FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise ValueError("User not found")

    # TODO: здесь запрос к блокчейну по адресу row[0]
    return 0.00  # тестовый баланс


@app.get("/api/balance", response_model=BalanceResponse)
async def api_balance(user_id: int = Query(..., description="Telegram user id")):
    try:
        bal = get_user_balance(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not registered")
    return BalanceResponse(balance=bal)
