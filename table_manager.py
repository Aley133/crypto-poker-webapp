# app/table_manager.py
# Обработчик логики посадки и выхода игроков за стол

from fastapi import HTTPException

import tables
import game_engine
import game_ws


class TableManager:
    @staticmethod
    async def join(player_id: str, table_id: int, deposit: float, seat_idx: int) -> dict:
        """
        1. Валидирует депозит по лимитам стола через tables.get_table_config.
        2. Вызывает tables.join_table для seat_map и списания средств из БД.
        3. Обновляет состояние game_engine.game_states.
        4. Рассылает новое состояние через WebSockets всем участникам стола.
        """
        # 1) Получаем конфигурацию стола
        cfg = tables.get_table_config(table_id)
        min_dep = cfg["min_deposit"]
        max_dep = cfg["max_deposit"]
        max_players = cfg["max_players"]

        # 2) Проверка депозита по лимитам
        if deposit < min_dep or deposit > max_dep:
            raise HTTPException(
                status_code=400,
                detail=f"Deposit must be between {min_dep} and {max_dep}"
            )

        # 3) Регистрация в seat_map и списание средств через HTTP-логику tables
        tables.join_table(table_id, player_id, deposit)

        # 4) Инициализация или получение состояния стола
        state = game_engine.game_states.setdefault(
            table_id,
            game_engine.create_new_state(max_players)
        )

        # 5) Проверяем, что место свободно
        if state["seats"][seat_idx] is not None:
            raise HTTPException(status_code=400, detail="Seat already taken")

        # 6) Садим игрока и устанавливаем его параметры
        state["seats"][seat_idx] = player_id
        state.setdefault("player_seats", {})[player_id] = seat_idx
        state.setdefault("stacks", {})[player_id] = deposit

        # 7) Сбрасываем флаг начала игры, если игроков стало меньше минимума
        if len(state.get("player_seats", {})) < game_engine.MIN_PLAYERS:
            state.pop("started", None)

        # 8) Рассылаем обновлённое состояние всем через WebSocket
        await game_ws.broadcast_state(table_id)

        return {"status": "ok"}

    @staticmethod
    async def leave(player_id: str, table_id: int, via_ws: bool = False) -> dict:
        """
        1. Убирает игрока из game_states.
        2. Вызывает tables.leave_table для seat_map и возврата баланса.
        3. Рассылает новое состояние через WebSockets.
        """
        # 1) Обновляем состояние game_states
        state = game_engine.game_states.get(table_id)
        if state:
            # Убираем позицию игрока
            seat_idx = state.get("player_seats", {}).pop(player_id, None)
            if seat_idx is not None and 0 <= seat_idx < len(state.get("seats", [])):
                state["seats"][seat_idx] = None
            # Удаляем стек
            state.get("stacks", {}).pop(player_id, None)
            # Сбрасываем старт, если стало мало игроков
            if len(state.get("player_seats", {})) < game_engine.MIN_PLAYERS:
                state.pop("started", None)

        # 2) HTTP-логика: seat_map и БД
        tables.leave_table(table_id, player_id)

        # 3) Broadcast через WebSocket
        await game_ws.broadcast_state(table_id)

        return {"status": "ok"}
