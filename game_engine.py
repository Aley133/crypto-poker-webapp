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
    players = seat_map.get(table_id, [])
    if len(players) < 2:
        return

    old_state = game_states.get(table_id, {})
    usernames = old_state.get("usernames", {})

    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}
    stacks = {uid: STARTING_STACK for uid in players}

    SB = 5
    BB = 10
    # small blind — второй игрок в списке, big blind — третий (или первому, если всего двое)
    sb_idx = 1 % len(players)
    bb_idx = 2 % len(players)
    sb_pid = players[sb_idx]
    bb_pid = players[bb_idx]

    # инициализируем ставки
    bets = {uid: 0 for uid in players}
    # списываем блайнды
    stacks[sb_pid] -= SB
    stacks[bb_pid] -= BB
    bets[sb_pid] = SB
    bets[bb_pid] = BB
    pot = SB + BB

    # первый ход — игрок после big blind
    first_to_act_idx = (bb_idx + 1) % len(players)
    first_pid = players[first_to_act_idx]

    game_states[table_id] = {
        "hole_cards": hole,
        "community": [],
        "stacks": stacks,
        "bets": bets,
        "pot": pot,
        "current_bet": BB,
        "current_player": first_pid,
        "stage": "preflop",
        "usernames": usernames,
    }

def apply_action(table_id: int, uid: int, action: str, amount: int=0):
    state = game_states.get(table_id)
    if not state or uid not in state["stacks"]:
        return
    if action == "bet" and amount>0:
        if state["stacks"][uid]>=amount:
            state["stacks"][uid]-=amount
            state["pot"]+=amount
    # TODO: check/fold etc.
    active = [p for p,s in state["stacks"].items() if s>0]
    idx = active.index(state["current_player"])
    state["current_player"] = active[(idx+1)%len(active)]
