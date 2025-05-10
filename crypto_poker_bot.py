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
WEBAPP_URL = os.getenv("WEBAPP_URL")  # URL вашего WebApp без слэша в конце

# Инициализация БД (если нужна регистрация пользователей)
def init_db():
    conn = sqlite3.connect("poker.db")
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            wallet_address TEXT
        )
    ''')
    conn.commit()
    conn.close()

# Создаём бота и диспетчер
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# /start — отправляем ReplyKeyboard с WebApp-кнопкой
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    # Динамически добавляем user_id в URL, чтобы фронт мог его прочитать
    url_with_id = f"{WEBAPP_URL}?user_id={message.from_user.id}"
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="Играть ♠",
                    web_app=WebAppInfo(url=url_with_id)
                )
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    await message.answer(
        "🎲 Добро пожаловать в Crypto Poker Bot!\n" +
        "Нажмите «Играть ♠» чтобы открыть игру.",
        reply_markup=keyboard
    )

# /help — справка
@dp.message(Command("help"))
async def cmd_help(message: types.Message):
    text = (
        "📋 Доступные команды:\n"
        "/start — начать заново\n"
        "/help — помощь по командам\n"
        "/balance — проверить баланс (альтернативно через чат)"
    )
    await message.answer(text)

# /balance — альтернативный вариант (обычный текст)
@dp.message(Command("balance"))
async def cmd_balance(message: types.Message):
    # Это сообщение придёт в чат, не WebApp
    await message.answer("💰 Ваш баланс: 0.00 USDT (тестовый)")

# Обработчик WebApp callback: ловим web_app_data
@dp.message(lambda msg: msg.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    payload = message.web_app_data.data  # JSON string
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return

    if data.get("action") == "get_balance":
        # Здесь ваша реальная логика получения баланса по user_id
        bal = 0.00  # тестовый
        await message.answer(f"💰 Ваш баланс: {bal:.2f} USDT")

async def main():
    logging.basicConfig(level=logging.INFO)
    init_db()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
