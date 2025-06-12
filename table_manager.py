# app/table_manager.py
# Новый модуль-менеджер для единой логики join/leave и broadcast

from fastapi import WebSocket
from .tables import leave_table as http_leave_table, seat_map
from .game_engine import game_states
from .game_ws import broadcast_state

class TableManager:
    @staticmethod
    async def leave(player_id: str, table_id: str, via_ws: bool = False):
        """
        Универсальный выход игрока со стола.
        1) Удаляет игрока из game_states
        2) Вызывает HTTP-логику leave_table для seat_map и сохранения баланса
        3) Рассылает новое состояние через WebSocket всем подключённым
        """
        # 1) Удаляем из game_states
        state = game_states.get(table_id)
        if state is not None:
            idx = state["player_seats"].pop(player_id, None)
            if idx is not None and 0 <= idx < len(state["seats"]):
                state["seats"][idx] = None

        # 2) HTTP-логика: seat_map и БД
        http_leave_table(player_id, table_id)

        # 3) Broadcast через WS
        await broadcast_state(table_id)
        return {"status": "ok"}
