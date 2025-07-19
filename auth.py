import os, hashlib, hmac, urllib.parse
from fastapi import Header, HTTPException


def validate_telegram_init_data(init_data: str) -> bool:
    """Validate Telegram WebApp initData signature."""
    token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
    if not token or not init_data:
        return False
    pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
    hash_received = ""
    data = []
    for k, v in pairs:
        if k == "hash":
            hash_received = v
        else:
            data.append(f"{k}={v}")
    if not hash_received:
        return False
    data.sort()
    data_check_string = "\n".join(data)
    secret_key = hashlib.sha256(token.encode()).digest()
    calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(calculated, hash_received)


def require_auth(authorization: str = Header(..., alias="Authorization")):
    if not validate_telegram_init_data(authorization):
        raise HTTPException(401, "Unauthorized")

