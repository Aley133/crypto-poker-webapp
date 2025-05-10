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
    # ваша логика
    return 0.00

@app.get("/api/balance", response_model=BalanceResponse)
async def api_balance(user_id: int = Query(...)):
    return BalanceResponse(balance=get_user_balance(user_id))

# mount статических файлов только ПОСЛЕ определения всех @app.get(...)
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
