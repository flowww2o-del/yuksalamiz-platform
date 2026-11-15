from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from .config import get_settings

settings = get_settings()
bot = Bot(settings.bot_token) if settings.bot_token else None
dp = Dispatcher()


def _webapp_keyboard(text: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=text, web_app=WebAppInfo(url=settings.webapp_url))
    ]])


@dp.message(Command("start"))
async def start(message: Message):
    await message.answer(
        f"🌟 <b>{settings.app_name}</b> platformasiga xush kelibsiz!\n\n"
        "📚 Kitoblar, bilim, o'yinlar va yutuqlar bir joyda.",
        reply_markup=_webapp_keyboard("📚 Kutubxonani ochish"), parse_mode="HTML",
    )


@dp.message(Command("admin"))
async def admin_command(message: Message):
    if not message.from_user or message.from_user.id not in settings.admins:
        await message.answer("⛔ Bu buyruq faqat adminlar uchun.")
        return
    await message.answer(
        "🛡 <b>Admin boshqaruvi</b>\nAdmin panelga kirish uchun tugmani bosing.",
        reply_markup=_webapp_keyboard("🛠 Admin panelni ochish"), parse_mode="HTML",
    )


@dp.message(Command("help"))
async def help_command(message: Message):
    await message.answer("/start — platformani ochish\n/admin — admin panel (faqat adminlar)")


@dp.message()
async def fallback(message: Message):
    await message.answer("Menyudan foydalanish uchun /start buyrug'ini yuboring.")
