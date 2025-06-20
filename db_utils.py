import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DATABASE_URL)

def init_schema():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS balances (
          user_id TEXT PRIMARY KEY,
          balance REAL NOT NULL
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

def get_balance_db(user_id: str) -> float:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT balance FROM balances WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if row:
        bal = row[0]
    else:
        bal = 1000
        cur.execute(
            "INSERT INTO balances(user_id, balance) VALUES(%s, %s)",
            (user_id, bal)
        )
        conn.commit()
    cur.close()
    conn.close()
    return bal

def set_balance_db(user_id: str, balance: float):
    conn = get_conn()
    cur = conn.cursor()
    # PostgreSQL UPSERT: INSERT ... ON CONFLICT ... DO UPDATE
    cur.execute(
        """
        INSERT INTO balances (user_id, balance)
        VALUES (%s, %s)
        ON CONFLICT (user_id)
        DO UPDATE SET balance = EXCLUDED.balance
        """,
        (user_id, balance)
    )
    conn.commit()
    cur.close()
    conn.close()


def update_balance_db(user_id: str, delta: float):
    """Прибавляет delta к текущему балансу пользователя."""
    bal = get_balance_db(user_id)
    set_balance_db(user_id, bal + delta)
