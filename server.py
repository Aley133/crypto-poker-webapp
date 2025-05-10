import sqlite3
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://web.telegram.org", "https://api.telegram.org"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

class BalanceResponse(BaseModel):
    balance: float

def get_user_balance(user_id: int) -> float:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT wallet_address FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise ValueError("User not found")
    return 0.00  # заглушка

@app.get("/api/balance", response_model=BalanceResponse)
async def api_balance(user_id: int = Query(...)):
    try:
        bal = get_user_balance(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not registered")
    return BalanceResponse(balance=bal)

# Монтируем статику ПОСЛЕ всех роутов
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
