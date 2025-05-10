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
WEBAPP_URL = os.getenv("WEBAPP_URL")  # например https://Aley133.github.io/crypto-poker-webapp/

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
    # Кнопка WebApp через ReplyKeyboard
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Играть ♠", web_app=WebAppInfo(url=WEBAPP_URL))]
        ],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    await message.answer(
        "🎲 Добро пожаловать в Crypto Poker Bot!\n" \
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
        "/balance — проверить баланс (через WebApp)"
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
    # Данные, отправленные из WebApp (JSON string)
    payload = message.web_app_data.data
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return

    action = data.get("action")
    if action == "get_balance":
        # TODO: вместо заглушки получить реальный баланс из БД / blockchain API
        balance = "0.00 USDT (тестовый)"
        # Отправляем ответ обратно в WebApp
        await message.answer(balance)
    # сюда можно добавить другие действия (action == "...")

async def main():
    # Логирование
    logging.basicConfig(level=logging.INFO)

    # Инициализация БД
    init_db()

    # Запуск polling
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())