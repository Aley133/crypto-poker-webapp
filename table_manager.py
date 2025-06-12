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
        """Универсальная посадка игрока за стол."""
        cfg = tables.get_table_config(table_id)
        if deposit < cfg["min_deposit"] or deposit > cfg["max_deposit"]:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Deposit {deposit} not in [{cfg['min_deposit']}, {cfg['max_deposit']}] range",
            )

        tables.join_table(player_id, table_id, deposit, seat_idx)

        state = game_engine.game_states.setdefault(
            table_id, game_engine.create_new_state(cfg["max_players"])
        )

        if state["seats"][seat_idx] is not None:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Seat already taken")

        state["seats"][seat_idx] = player_id
        state["player_seats"][player_id] = seat_idx
        state["stacks"][player_id] = deposit
        state["players"] = [p for p in state["seats"] if p]

        if len(state["players"]) >= game_engine.MIN_PLAYERS and state.get("phase") != "pre-flop":
            game_engine.start_hand(table_id)

        await game_ws.broadcast_state(table_id)
        return {"status": "ok"}
