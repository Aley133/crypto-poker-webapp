# app/table_manager.py
# Новый модуль-менеджер для единой логики join/leave и broadcast

import tables
import game_engine
import game_ws

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
        state = game_engine.game_states.get(table_id)
        if state is not None:
            idx = state["player_seats"].pop(player_id, None)
            if idx is not None and 0 <= idx < len(state["seats"]):
                state["seats"][idx] = None

        # 2) HTTP-логика: seat_map и БД
        tables.leave_table(table_id, player_id)

        # 3) Broadcast через WS
        await game_ws.broadcast_state(table_id)
        return {"status": "ok"}

    @staticmethod
    async def join(player_id: str, table_id: int, deposit: int, seat_idx: int):
        """
        Универсальный метод посадки на стол.
        Проверяет депозит, доступность места и регистрирует игрока.
        """
        # 0) Получаем конфиг стола: мин и макс депозиты
        cfg = tables.get_table_config(table_id)
        if deposit < cfg["min_deposit"] or deposit > cfg["max_deposit"]:
            from fastapi import HTTPException
            raise HTTPException(
                400,
                f"Deposit {deposit} not in [{cfg['min_deposit']}, {cfg['max_deposit']}] range",
            )
        # 1) Добавляем в HTTP-слой (seat_map и БД)
        tables.join_table(player_id, table_id, deposit, seat_idx)
        # 2) Обновляем состояние в game_states
        state = game_engine.game_states.setdefault(
            table_id,
            {
                "seats": [None] * cfg["max_players"],
                "player_seats": {},
                "players": [],
                "usernames": {},
                "stacks": {},
            },
        )
        # Проверяем, что место свободно
        if state["seats"][seat_idx] is not None:
            from fastapi import HTTPException
            raise HTTPException(400, "Seat already taken")
        state["seats"][seat_idx] = player_id
        state["player_seats"][player_id] = seat_idx
        # Инициализируем стек
        state["stacks"][player_id] = deposit
        # 3) Рассылаем обновлённый стейт
        await game_ws.broadcast_state(table_id)
        return {"status": "ok"}
