from typing import Dict, List

# Mapping of table IDs to lists of user IDs seated at each table.
# При заходе игрока в /api/join вы должны делать:
#   seat_map.setdefault(table_id, []).append(user_id)
seat_map: Dict[int, List[int]] = {}
