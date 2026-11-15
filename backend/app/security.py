import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException

from . import db
from .config import get_settings


def validate_telegram_init_data(init_data: str, max_age: int = 86400) -> dict:
    settings = get_settings()
    if not settings.bot_token:
        raise HTTPException(503, "Bot hali sozlanmagan")
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash")
    except Exception:
        raise HTTPException(401, "Telegram ma'lumotlari noto'g'ri")
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise HTTPException(401, "Telegram imzosi tasdiqlanmadi")
    try:
        auth_date = int(parsed.get("auth_date", "0"))
    except ValueError:
        auth_date = 0
    if auth_date <= 0 or time.time() - auth_date > max_age:
        raise HTTPException(401, "Telegram sessiyasi eskirgan")
    try:
        user = json.loads(parsed["user"])
        int(user["id"])
    except Exception:
        raise HTTPException(401, "Foydalanuvchi ma'lumoti topilmadi")
    return user


def require_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "Telegram sessiyasi talab qilinadi")
    return validate_telegram_init_data(authorization[4:])


def is_admin(user: dict) -> bool:
    return int(user.get("id", 0)) in get_settings().admins


def require_admin(user: dict) -> None:
    if not is_admin(user):
        raise HTTPException(403, "Bu bo'lim faqat adminlar uchun")


# --- Bloklangan foydalanuvchilarni tekshirish (30 soniyalik kesh bilan) ---
_block_cache: dict[int, tuple[float, bool]] = {}
_BLOCK_TTL = 30.0


async def _is_blocked(tid: int) -> bool:
    now = time.time()
    cached = _block_cache.get(tid)
    if cached and now - cached[0] < _BLOCK_TTL:
        return cached[1]
    rows = await db.select("profiles", f"select=is_blocked&telegram_id=eq.{tid}&limit=1")
    blocked = bool(rows and rows[0].get("is_blocked"))
    _block_cache[tid] = (now, blocked)
    return blocked


def forget_block_state(tid: int) -> None:
    _block_cache.pop(tid, None)


async def current_user(user: dict = Depends(require_user)) -> dict:
    tid = int(user["id"])
    if not is_admin(user) and await _is_blocked(tid):
        raise HTTPException(403, "Hisobingiz bloklangan")
    return user


async def admin_user(user: dict = Depends(require_user)) -> dict:
    require_admin(user)
    return user
