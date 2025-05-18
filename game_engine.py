# game_engine.py
import random
from typing import Dict, List
from game_data import seat_map

game_states: Dict[int, dict] = {}
connections: Dict[int, List] = {}

STARTING_STACK = 1000

def new_deck() -> List[str]:
    ranks = [str(x) for x in range(2,11)] + list("JQKA")
    suits = ["♠","♥","♦","♣"]
    deck = [r+s for r in ranks for s in suits]
    random.shuffle(deck)
    return deck

def start_hand(table_id: int):
    # raw_ids — это список строк из seat_map
    raw_ids = seat_map.get(table_id, [])
    # приводим к int, чтобы дальше в state всё хранилось по числам
    players = [int(uid) for uid in raw_ids]
    if len(players) < 2:
        return

    old_state = game_states.get(table_id, {})
    usernames = old_state.get("usernames", {})

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: STARTING_STACK for uid in players}

    SB = 5
    BB = 10
    sb_idx = 1 % len(players)
    bb_idx = 2 % len(players)
    sb_pid = players[sb_idx]
    bb_pid = players[bb_idx]

    bets = {uid: 0 for uid in players}
    stacks[sb_pid] -= SB; bets[sb_pid] = SB
    stacks[bb_pid] -= BB; bets[bb_pid] = BB
    pot = SB + BB

    first_idx = (bb_idx + 1) % len(players)
    first_pid = players[first_idx]

    game_states[table_id] = {
        "hole_cards":    hole,
        "community":     [],
        "deck":          deck,
        "stacks":        stacks,
        "bets":          bets,
        "pot":           pot,
        "current_bet":   BB,
        "current_player": first_pid,
        "stage":         "preflop",
        "folded":        set(),
        "usernames":     usernames,
    }


def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    state = game_states.get(table_id)
    if not state:
        return

    # 1) Только текущий игрок может ходить
    if uid != state["current_player"]:
        return

    players = seat_map.get(table_id, [])
    folded = state["folded"]
    active = [p for p in players if p not in folded and state["stacks"][p] > 0]

    # 2) Обработка действий
    if action == "fold":
        folded.add(uid)

    elif action == "check":
        # можно только если ваша ставка == текущей
        if state["bets"][uid] != state["current_bet"]:
            return

    elif action == "call":
        to_call = state["current_bet"] - state["bets"][uid]
        to_call = min(to_call, state["stacks"][uid])
        state["stacks"][uid] -= to_call
        state["bets"][uid]   += to_call
        state["pot"]        += to_call

    elif action in ("bet", "raise"):
        # ставка должна быть больше текущей
        if amount <= state["current_bet"]:
            return
        to_put = min(amount - state["bets"][uid], state["stacks"][uid])
        state["stacks"][uid] -= to_put
        state["bets"][uid]   += to_put
        state["pot"]        += to_put
        state["current_bet"] = state["bets"][uid]

    else:
        return  # неизвестное действие

    # 3) Перевод хода следующему активному
    # убираем тех, кто сбросил или у кого нет фишек
    active = [p for p in players if p not in folded and state["stacks"][p] > 0]
    if len(active) <= 1:
        # если остался один — сразу шоудаун (конец руки)
        state["stage"] = "showdown"
    else:
        idx = active.index(uid)
        next_idx = (idx + 1) % len(active)
        state["current_player"] = active[next_idx]

        # 4) Проверяем: закончился ли раунд ставок?
        all_equal = all(state["bets"][p] == state["current_bet"] for p in active)
        if all_equal:
            # переходим к следующей стадии
            state["stage"] = {
                "preflop": "flop",
                "flop":    "turn",
                "turn":    "river",
                "river":   "showdown"
            }[state["stage"]]

            # сброс ставок для нового раунда
            for p in active:
                state["bets"][p] = 0
            state["current_bet"] = 0

            # раздаём общие карты
            if state["stage"] == "flop":
                # три карты
                for _ in range(3):
                    state["community"].append(state["deck"].pop())
            elif state["stage"] in ("turn", "river"):
                # одна карта
                state["community"].append(state["deck"].pop())

            # первый ход всегда у первого активного
            state["current_player"] = active[0]
