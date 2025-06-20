# app/table_manager.py
# Новый модуль-менеджер для единой логики join/leave и broadcast

import tables
import game_engine
import game_ws
from db_utils import set_balance_db

class TableManager:
    @staticmethod
    async def leave(player_id: str, table_id: str, via_ws: bool = False):
        """
        Универсальный выход игрока со стола.
        1) Удаляет игрока из game_states
        2) Удаляет WS соединение игрока
        3) Вызывает HTTP-логику leave_table для seat_map и сохранения баланса
        4) Рассылает новое состояние через WebSocket всем подключённым
        """
        state = game_engine.game_states.get(table_id)
        if state is not None:
            # Удаляем из player_seats / seats
            idx = state["player_seats"].pop(player_id, None)
            if idx is not None and 0 <= idx < len(state["seats"]):
                state["seats"][idx] = None

            # Убираем из players[]
            players = state.get("players", [])
            if player_id in players:
                players.remove(player_id)
            state["players"] = players

            # Чистим hole_cards, contributions, player_actions
            state.get("hole_cards", {}).pop(player_id, None)
            state.get("contributions", {}).pop(player_id, None)
            state.get("player_actions", {}).pop(player_id, None)

            # Сохраняем стек игрока в БД
            stacks = state.get("stacks", {})
            if player_id in stacks:
                set_balance_db(player_id, stacks[player_id])
                stacks.pop(player_id, None)
                state["stacks"] = stacks

            # Если стало меньше MIN_PLAYERS — сбрасываем флаг started
            if len(players) < 2:
                state["started"] = False
                state["phase"] = "waiting"

            # Убиваем WS сессии игрока
            conns = game_engine.connections.get(table_id, [])
            for ws_existing in list(conns):
                if ws_existing.query_params.get("user_id") == player_id:
                    try:
                        await ws_existing.close()
                    except:
                        pass
                    conns.remove(ws_existing)

        # === ВСТАВИТЬ ЗДЕСЬ ===
        import uuid
        state["instance_id"] = uuid.uuid4().hex

        # HTTP-логика: seat_map и БД
        tables.leave_table(table_id, player_id)

        # Broadcast
        await game_ws.broadcast_state(table_id)
        return {"status": "ok"}

    @staticmethod
    async def join(player_id: str, table_id: int, deposit: int, seat_idx: int):
        """
        Универсальный метод посадки на стол.
        Проверяет депозит, доступность места и регистрирует игрока.
        """
        cfg = tables.get_table_config(table_id)
        if deposit < cfg["min_deposit"] or deposit > cfg["max_deposit"]:
            from fastapi import HTTPException
            raise HTTPException(
                400,
                f"Deposit {deposit} not in [{cfg['min_deposit']}, {cfg['max_deposit']}] range",
            )

        # Добавляем в HTTP-слой (seat_map и БД)
        tables.join_table(player_id, table_id, deposit, seat_idx)

        # Обновляем state
        state = game_engine.game_states.setdefault(
            table_id, game_engine.create_new_state(cfg["max_players"])
        )

        # Проверяем seat
        if state["seats"][seat_idx] is not None:
            from fastapi import HTTPException
            raise HTTPException(400, "Seat already taken")

        # Садим игрока
        state["seats"][seat_idx] = player_id
        state["player_seats"][player_id] = seat_idx

        # Инициализируем стек
        state["stacks"][player_id] = deposit

        # Обновляем players[]
        players = state.get("players", [])
        if player_id not in players:
            players.append(player_id)
        state["players"] = players

        # Рассылаем
        await game_ws.broadcast_state(table_id)
        return {"status": "ok"}
