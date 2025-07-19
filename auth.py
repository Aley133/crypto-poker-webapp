import os, hashlib, hmac, urllib.parse


def validate_telegram_init_data(init_data: str) -> bool:
    """Validate Telegram WebApp initData signature."""
    token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
    if not token:
        return False
    parsed = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
    data_dict = dict(parsed)
    hash_received = data_dict.get("hash")
    if not hash_received:
        return False
    data_check = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed) if k != "hash"
    )
    secret_key = hashlib.sha256(token.encode()).digest()
    h = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
    return h == hash_received

