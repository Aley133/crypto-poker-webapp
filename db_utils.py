import sqlite3

DB_PATH = "poker.db"
STARTING_STACK = 1000

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
      CREATE TABLE IF NOT EXISTS balances (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL
      )
    """)
    return conn

def get_balance_db(user_id: str) -> int:
    """Вернуть текущий баланс из БД, или STARTING_STACK, если нет записи."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT balance FROM balances WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    if row:
        bal = row[0]
    else:
        bal = STARTING_STACK
        cur.execute(
            "INSERT INTO balances(user_id, balance) VALUES(?, ?)",
            (user_id, bal)
        )
        conn.commit()
    conn.close()
    return bal

def set_balance_db(user_id: str, balance: int):
    """Записать (или обновить) баланс игрока в БД."""
    conn = get_conn()
    conn.execute(
        "REPLACE INTO balances(user_id, balance) VALUES(?, ?)",
        (user_id, balance)
    )
    conn.commit()
    conn.close()

