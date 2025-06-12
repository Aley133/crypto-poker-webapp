from tables import leave_table as http_leave_table, seat_map
from game_engine import game_states
from game_ws import broadcast_state

class TableManager:
    @staticmethod
    async def leave(player_id: str, table_id: int, via_ws: bool = False):
        """Unified logic for a player leaving a table."""
        # 1) Remove from game_states
        state = game_states.get(table_id)
        if state is not None:
            idx = state.get("player_seats", {}).pop(player_id, None)
            if idx is not None and 0 <= idx < len(state.get("seats", [])):
                state["seats"][idx] = None

        # 2) HTTP logic for seat_map and DB
        http_leave_table(table_id, player_id)

        # 3) Broadcast new state to all connections
        await broadcast_state(table_id)
        return {"status": "ok"}
