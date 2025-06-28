import pytest
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import server
import tables
import game_engine
import game_data

@pytest.fixture(autouse=True)
def reset(monkeypatch):
    # In-memory balances
    balances = {"u1": 5, "u2": 10}

    def get_balance_db(uid):
        return balances.get(uid, 0)

    def set_balance_db(uid, val):
        balances[uid] = val

    for mod in (server, tables):
        monkeypatch.setattr(mod, "get_balance_db", get_balance_db)
        monkeypatch.setattr(mod, "set_balance_db", set_balance_db)

    game_data.seat_map.clear()
    game_engine.game_states.clear()
    yield

client = TestClient(server.app)

def test_buy_in_out_of_bounds():
    resp = client.post("/api/join", params={"table_id": 1, "user_id": "u1", "buy_in": 2})
    assert resp.status_code == 400


def test_insufficient_funds():
    resp = client.post("/api/join", params={"table_id": 1, "user_id": "u1", "buy_in": 6})
    assert resp.status_code == 400


def test_successful_join():
    resp = client.post("/api/join", params={"table_id": 1, "user_id": "u2", "buy_in": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["buy_in"] == 5
