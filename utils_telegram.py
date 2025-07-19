import os
import hmac
import hashlib
import json
from typing import TypedDict

class TelegramUser(TypedDict, total=False):
    id: int
    is_bot: bool
    first_name: str
    last_name: str
    username: str

def validate_telegram_init_data(init_data: str) -> TelegramUser:
    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        raise RuntimeError("BOT_TOKEN env not set")
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    data = {}
    for pair in init_data.split("&"):
        if "=" not in pair:
            continue
        key, val = pair.split("=", 1)
        data[key] = val
    if "hash" not in data:
        raise ValueError("Missing hash in initData")
    items = [f"{k}={data[k]}" for k in sorted(k for k in data if k != "hash")]
    data_check_string = "\n".join(items)
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, data["hash"]):
        raise ValueError("Invalid initData signature")
    if "user" not in data:
        raise ValueError("Missing user payload in initData")
    return json.loads(data["user"])
