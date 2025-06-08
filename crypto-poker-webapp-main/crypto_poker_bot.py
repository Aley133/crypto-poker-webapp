import asyncio
import logging
import os
import json
import sqlite3

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, ReplyKeyboardMarkup, KeyboardButton
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")  # URL вашего WebApp, без слэша в конце

# Инициализация БД
def init_db():
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            wallet_address TEXT
        )
    ''')
    conn.commit()
    conn.close()

# Функция получения/создания адреса для депозита
def get_or_create_wallet(user_id: int) -> str:
    conn = sqlite3.connect("poker.db")
    cur = conn.cursor()
    cur.execute("SELECT wallet_address FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    if row and row[0]:
        address = row[0]
    else:
        # В реальном проекте здесь вызов API для генерации кошелька
        address = f"test_wallet_{user_id}"
        cur.execute(
            "INSERT OR REPLACE INTO users (user_id, wallet_address) VALUES (?, ?)" ,
            (user_id, address)
        )
        conn.commit()
    conn.close()
    return address

# Основной хендлер WebApp
async def handle_web_app_data(message: types.Message):
    payload = message.web_app_data.data
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return

    action = data.get("action")
    user_id = message.from_user.id

    if action == "get_balance":
        # Заглушка баланса
        bal = 0.00
        await message.answer(f"💰 Ваш баланс: {bal:.2f} USDT")

    elif action == "deposit":
        address = get_or_create_wallet(user_id)
        await message.answer(f"📥 Чтобы пополнить счёт, отправьте монеты на адрес:\n{address}")

    elif action == "withdraw":
        await message.answer(
            "📤 Для вывода отправьте сумму и адрес в формате:\n" +
            "<сумма> <адрес_получателя>, например: 10 0xABCDEF..."
        )

    elif action == "history":
        # Заглушка истории
        await message.answer("📜 Ваша история операций пуста.")

    else:
        await message.answer("❗ Неизвестное действие.")

# Запуск бота и регистрация хендлеров
async def main():
    logging.basicConfig(level=logging.INFO)
    init_db()

    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    # /start: кнопка WebApp + user_id в URL
    @dp.message(Command("start"))
    async def cmd_start(message: types.Message):
        url = f"{WEBAPP_URL}?user_id={message.from_user.id}"
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="Играть ♠", web_app=WebAppInfo(url=url))]
            ],
            resize_keyboard=True,
            one_time_keyboard=True
        )
        await message.answer(
            "🎲 Добро пожаловать в Crypto Poker!\n" +
            "Нажмите «Играть ♠» чтобы открыть игру.",
            reply_markup=keyboard
        )

    # /help и /balance (текстовые альтернативы)
    @dp.message(Command("help"))
    async def cmd_help(message: types.Message):
        await message.answer(
            "📋 Команды:\n" +
            "/start — запуск\n" +
            "/help — помощь\n" +
            "/balance — проверить баланс"
        )

    @dp.message(Command("balance"))
    async def cmd_balance(message: types.Message):
        await message.answer("💰 Ваш баланс: 0.00 USDT")

    # Обработчик WebAppData
    dp.message.register(handle_web_app_data, lambda msg: msg.web_app_data is not None)

    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
