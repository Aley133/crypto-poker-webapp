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
    # Берём raw-список (строки) и приводим к int
    raw = seat_map.get(table_id, [])
    players = [int(u) for u in raw]
    if len(players) < 2:
        return

    # Сохраняем старую мапу username (если была)
    old = game_states.get(table_id, {})
    usernames = old.get("usernames", {})

    # Готовим новую колоду и раздаём карманные карты
    deck = new_deck()
    hole = {uid: [deck.pop(), deck.pop()] for uid in players}

    # Инициализируем стеки
    stacks = {uid: STARTING_STACK for uid in players}

    # Блайнды
    SB, BB = 5, 10
    sb_idx = 1 % len(players)
    bb_idx = 2 % len(players)
    sb_pid = players[sb_idx]
    bb_pid = players[bb_idx]

    # Списываем блайнды и фиксируем их ставки
    bets = {uid: 0 for uid in players}
    stacks[sb_pid] -= SB;  bets[sb_pid] = SB
    stacks[bb_pid] -= BB;  bets[bb_pid] = BB
    pot = SB + BB

    # Первый ход — игрок сразу после большого блайнда
    first_pid = players[(bb_idx + 1) % len(players)]

    # Собираем состояние
    game_states[table_id] = {
        "hole_cards":     hole,       # ваши две карты
        "community":      [],         # флоп/терн/ривер
        "deck":           deck,       # остаток колоды
        "stacks":         stacks,     # сколько у кого фишек
        "bets":           bets,       # сколько уже поставил каждый
        "pot":            pot,        # общий пот
        "current_bet":    BB,         # ставка для уравнивания
        "current_player": first_pid,  # чей ход
        "stage":          "preflop",  # стадия раунда
        "folded":         set(),      # кто сбросил
        "usernames":      usernames,  # map user_id→username
    }

def apply_action(table_id: int, uid: int, action: str, amount: int = 0):
    state = game_states.get(table_id)
    if not state or uid not in state["stacks"]:
        return

    # 1) Проверяем очередь
    if uid != state["current_player"]:
        return

    players = [int(u) for u in seat_map.get(table_id, [])]
    folded  = state["folded"]
    active  = [p for p in players if p not in folded and state["stacks"][p] > 0]

    # 2) Обработка действия
    if action == "fold":
        folded.add(uid)

    elif action == "check":
        # можно только если ставка у вас уже равна current_bet
        if state["bets"][uid] != state["current_bet"]:
            return

    elif action == "call":
        to_call = state["current_bet"] - state["bets"][uid]
        to_call = min(to_call, state["stacks"][uid])
        state["stacks"][uid] -= to_call
        state["bets"][uid]   += to_call
        state["pot"]        += to_call

    elif action in ("bet","raise"):
        # новая ставка должна быть больше текущей
        if amount <= state["current_bet"]:
            return
        delta = amount - state["bets"][uid]
        put   = min(delta, state["stacks"][uid])
        state["stacks"][uid] -= put
        state["bets"][uid]   += put
        state["pot"]        += put
        state["current_bet"] = state["bets"][uid]

    else:
        return  # неизвестное действие

    # 3) Считаем активных снова
    active = [p for p in players if p not in folded and state["stacks"][p] > 0]
    # Если остался один — сразу шоудаун
    if len(active) <= 1:
        state["stage"] = "showdown"
        return

    # 4) Меняем ход
    idx = active.index(uid)
    state["current_player"] = active[(idx + 1) % len(active)]

    # 5) Если все активные уже уравняли ставки — переходим на next stage
    if all(state["bets"][p] == state["current_bet"] for p in active):
        next_stage = {
            "preflop": "flop",
            "flop":    "turn",
            "turn":    "river",
            "river":   "showdown"
        }[state["stage"]]
        state["stage"] = next_stage

        # Сбрасываем ставки, готовим новую ставку
        for p in active:
            state["bets"][p] = 0
        state["current_bet"] = 0

        # Раздаём общие карты
        if next_stage == "flop":
            for _ in range(3):
                state["community"].append(state["deck"].pop())
        elif next_stage in ("turn","river"):
            state["community"].append(state["deck"].pop())

        # Ходит первый активный
        state["current_player"] = active[0]
