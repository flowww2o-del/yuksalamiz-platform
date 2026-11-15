import asyncio
import hmac
import logging
import os
import re
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import quote

from aiogram.types import Update
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import db, storage
from .bot import bot, dp
from .config import get_settings
from .processing import mark_stale_as_failed, process_book
from .security import admin_user, current_user, forget_block_state, validate_telegram_init_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("yuksalamiz")
settings = get_settings()
VERSION = "0.3.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mark_stale_as_failed()
    if bot and settings.webhook_base_url and settings.telegram_webhook_secret:
        try:
            await bot.set_webhook(settings.webhook_base_url.rstrip("/") + "/webhook/telegram",
                                  secret_token=settings.telegram_webhook_secret)
        except Exception:  # noqa: BLE001
            log.exception("Webhook'ni avtomatik o'rnatib bo'lmadi")
    yield
    if bot:
        await bot.session.close()
    await db.close_client()


app = FastAPI(title="Yuksalamiz API", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.origins, allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------- yordamchilar
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(value: str) -> str:
    """ID haqiqiy UUID ekanini tekshiradi (so'rov ichiga begona matn tushmasligi uchun)."""
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "Topilmadi")


def clean_search(text: str) -> str:
    """PostgREST filtrini buzadigan belgilarni olib tashlaydi."""
    return re.sub(r"[,()*%\\\"'&=:;]", " ", text).strip()[:60]


async def body_json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(422, "JSON noto'g'ri")
    if not isinstance(data, dict):
        raise HTTPException(422, "JSON obyekt bo'lishi kerak")
    return data


async def audit(user: dict, action: str, target: str = "", details: dict | None = None) -> None:
    try:
        await db.insert("admin_audit", {"admin_telegram_id": int(user["id"]), "action": action,
                                        "target": target, "details": details or {}}, returning=False)
    except Exception:  # noqa: BLE001 — audit yozilmasa asosiy amal to'xtamasin
        log.warning("Audit yozilmadi: %s", action)


BOOK_PUBLIC = "id,title,author,description,category,language,cover_path,file_type,page_count,created_at"


async def with_covers(rows: list[dict]) -> list[dict]:
    urls = await storage.sign_many([r.get("cover_path") for r in rows if r.get("cover_path")])
    for row in rows:
        row["cover_url"] = urls.get(row.get("cover_path") or "")
        row.pop("cover_path", None)
    return rows


# ---------------------------------------------------------------- umumiy
@app.get("/health")
async def health():
    return {"status": "ok", "service": "yuksalamiz-api", "version": VERSION}


@app.post("/api/auth")
async def auth(request: Request):
    body = await body_json(request)
    user = validate_telegram_init_data(str(body.get("initData", "")))
    return {"id": user.get("id"), "first_name": user.get("first_name", ""), "username": user.get("username", ""),
            "is_admin": int(user.get("id", 0)) in settings.admins}


@app.get("/api/me")
async def me(user: dict = Depends(current_user)):
    tid = int(user["id"])
    first_name, username = user.get("first_name", ""), user.get("username")
    await db.insert("profiles", {"telegram_id": tid, "username": username, "first_name": first_name},
                    returning=False, on_conflict="telegram_id", resolution="ignore-duplicates")
    rows = await db.update("profiles", f"telegram_id=eq.{tid}",
                           {"last_seen_at": now_iso(), "username": username, "first_name": first_name})
    profile = rows[0] if rows else {}
    return {"id": tid, "first_name": profile.get("first_name", first_name), "username": profile.get("username") or "",
            "is_admin": tid in settings.admins, "drops": profile.get("drops", 0),
            "diamonds": profile.get("diamonds", 0), "level": profile.get("level", 1),
            "joined_at": profile.get("created_at")}


# ---------------------------------------------------------------- kitoblar
@app.get("/api/books")
async def books(category: str | None = None, q: str | None = None, limit: int = 100, offset: int = 0,
                user: dict = Depends(current_user)):
    limit = max(1, min(limit, 200))
    query = (f"select={BOOK_PUBLIC}&is_published=eq.true&status=eq.ready"
             f"&order=created_at.desc&limit={limit}&offset={max(0, offset)}")
    if category:
        query += "&category=eq." + quote(category)
    if q and clean_search(q):
        term = quote(clean_search(q))
        query += f"&or=(title.ilike.*{term}*,author.ilike.*{term}*)"
    return await with_covers(await db.select("books", query))


@app.get("/api/books/{book_id}")
async def book_detail(book_id: str, user: dict = Depends(current_user)):
    book_id = uid(book_id)
    rows = await db.select("books", f"select={BOOK_PUBLIC}&id=eq.{book_id}&is_published=eq.true&status=eq.ready&limit=1")
    if not rows:
        raise HTTPException(404, "Kitob topilmadi")
    book = (await with_covers(rows))[0]
    progress = await db.select("reading_progress",
                               f"select=last_page&telegram_id=eq.{int(user['id'])}&book_id=eq.{book_id}&limit=1")
    book["last_page"] = progress[0]["last_page"] if progress else 0
    return book


@app.get("/api/books/{book_id}/pages")
async def book_pages(book_id: str, start: int = 1, count: int = 20, user: dict = Depends(current_user)):
    """Reader sahifalarni bo'lak-bo'lak so'raydi: bitta so'rovda `count` ta imzolangan havola."""
    book_id = uid(book_id)
    count = max(1, min(count, 50))
    start = max(1, start)
    visible = await db.select("books", f"select=id&id=eq.{book_id}&is_published=eq.true&status=eq.ready&limit=1")
    if not visible:
        raise HTTPException(404, "Kitob topilmadi")
    rows = await db.select(
        "book_pages",
        f"select=page_number,image_path&book_id=eq.{book_id}&page_number=gte.{start}&page_number=lt.{start + count}"
        "&order=page_number.asc")
    urls = await storage.sign_many([r["image_path"] for r in rows])
    return [{"page": r["page_number"], "url": urls.get(r["image_path"])} for r in rows]


@app.put("/api/books/{book_id}/progress")
async def save_progress(book_id: str, request: Request, user: dict = Depends(current_user)):
    book_id = uid(book_id)
    body = await body_json(request)
    page = body.get("page")
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise HTTPException(422, "Sahifa raqami noto'g'ri")
    rows = await db.select("books", f"select=page_count&id=eq.{book_id}&is_published=eq.true&limit=1")
    if not rows:
        raise HTTPException(404, "Kitob topilmadi")
    page = min(page, max(1, rows[0].get("page_count") or 1))
    await db.insert("reading_progress", {"telegram_id": int(user["id"]), "book_id": book_id, "last_page": page,
                                         "updated_at": now_iso()},
                    returning=False, on_conflict="telegram_id,book_id", resolution="merge-duplicates")
    return {"ok": True, "page": page}


@app.get("/api/reading/recent")
async def recent_reading(user: dict = Depends(current_user)):
    rows = await db.select("reading_progress",
                           f"select=book_id,last_page&telegram_id=eq.{int(user['id'])}&order=updated_at.desc&limit=1")
    if not rows:
        return None
    books_ = await db.select("books", f"select={BOOK_PUBLIC}&id=eq.{rows[0]['book_id']}&is_published=eq.true&status=eq.ready&limit=1")
    if not books_:
        return None
    book = (await with_covers(books_))[0]
    book["last_page"] = rows[0]["last_page"]
    return book


# ---------------------------------------------------------------- reyting va vazifalar
@app.get("/api/leaderboard")
async def leaderboard(user: dict = Depends(current_user)):
    tid = int(user["id"])
    rows = await db.select("profiles", "select=telegram_id,first_name,username,drops,level&is_blocked=eq.false"
                                       "&order=drops.desc,created_at.asc&limit=50")
    top = [{"rank": i + 1, "name": r.get("first_name") or r.get("username") or "Foydalanuvchi",
            "drops": r.get("drops", 0), "level": r.get("level", 1), "is_me": r["telegram_id"] == tid}
           for i, r in enumerate(rows)]
    mine = await db.select("profiles", f"select=drops&telegram_id=eq.{tid}&limit=1")
    my = None
    if mine:
        ahead = await db.count("profiles", f"is_blocked=eq.false&drops=gt.{mine[0]['drops']}")
        my = {"rank": ahead + 1, "drops": mine[0]["drops"]}
    return {"top": top, "me": my}


@app.get("/api/tasks")
async def get_tasks(user: dict = Depends(current_user)):
    return await db.select("tasks", "select=id,title,description,reward_drops&is_active=eq.true&order=created_at.desc")


# ---------------------------------------------------------------- admin: umumiy
@app.get("/api/admin/overview")
async def admin_overview(user: dict = Depends(admin_user)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    users, books_total, ready, processing, active, tasks = await asyncio.gather(
        db.count("profiles"), db.count("books"), db.count("books", "status=eq.ready"),
        db.count("books", "status=eq.processing"),
        db.count("profiles", f"last_seen_at=gte.{quote(today)}"), db.count("tasks", "is_active=eq.true"))
    recent = await db.select("admin_audit", "select=action,target,created_at&order=created_at.desc&limit=8")
    return {"users": users, "books": books_total, "books_ready": ready, "books_processing": processing,
            "active_today": active, "active_tasks": tasks, "recent": recent, "status": "connected"}


# ---------------------------------------------------------------- admin: kitoblar
@app.get("/api/admin/books")
async def admin_books(user: dict = Depends(admin_user)):
    rows = await db.select(
        "books", "select=id,title,author,category,language,cover_path,file_type,page_count,processed_pages,"
                 "status,error,is_published,created_at&order=created_at.desc&limit=200")
    return await with_covers(rows)


def _detect_type(head: bytes) -> tuple[str, str, str] | None:
    """Fayl turini imzo (magic bytes) bo'yicha aniqlaydi: (kengaytma, MIME, tur)."""
    if b"%PDF-" in head[:1024]:
        return "pdf", "application/pdf", "pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg", "image"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png", "image"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp", "image/webp", "image"
    return None


@app.post("/api/admin/books/upload", status_code=202)
async def upload_book(
    background: BackgroundTasks,
    title: str = Form(...), author: str = Form(""), description: str = Form(""),
    category: str = Form(""), language: str = Form("uz"), publish: bool = Form(False),
    file: UploadFile = File(...), user: dict = Depends(admin_user),
):
    title = title.strip()
    if not title:
        raise HTTPException(422, "Kitob nomi majburiy")
    if language not in {"uz", "ru", "en"}:
        language = "uz"
    max_bytes = settings.max_book_upload_mb * 1024 * 1024

    total = 0
    detected = None
    temp_path = None
    handed_off = False
    try:
        with tempfile.NamedTemporaryFile(prefix="yuksalamiz-book-", suffix=".upload", delete=False) as temp:
            temp_path = temp.name
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                if detected is None:
                    detected = _detect_type(chunk[:2048])
                    if detected is None:
                        raise HTTPException(415, "Faqat PDF yoki JPG/PNG/WEBP qabul qilinadi")
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(413, f"Fayl {settings.max_book_upload_mb} MB limitdan katta")
                temp.write(chunk)
        if total == 0 or detected is None:
            raise HTTPException(422, "Bo'sh fayl yuklab bo'lmaydi")

        ext, mime, kind = detected
        final_path = temp_path.replace(".upload", f".{ext}")
        os.replace(temp_path, final_path)
        temp_path = final_path

        rows = await db.insert("books", {
            "title": title[:200], "author": author.strip()[:200], "description": description.strip()[:2000],
            "category": category.strip()[:60], "language": language, "file_type": kind, "status": "processing",
            "is_published": False, "created_by": int(user["id"]),
        })
        book = rows[0]
        # publish=True bo'lsa kitob ishlov tugagach avtomatik nashr qilinadi
        background.add_task(process_book, book["id"], temp_path, ext, mime, publish)
        handed_off = True
        await audit(user, "book_upload", book["id"], {"title": title, "size_mb": round(total / 1048576, 2)})
        return {"ok": True, "book": book, "file_size_mb": round(total / 1048576, 2),
                "message": "Fayl qabul qilindi. Sahifalar fonda tayyorlanmoqda."}
    finally:
        await file.close()
        if not handed_off and temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.patch("/api/admin/books/{book_id}")
async def edit_book(book_id: str, request: Request, user: dict = Depends(admin_user)):
    book_id = uid(book_id)
    body = await body_json(request)
    text_fields = {"title": 200, "author": 200, "description": 2000, "category": 60}
    values: dict = {}
    for key, limit in text_fields.items():
        if key in body:
            if not isinstance(body[key], str):
                raise HTTPException(422, f"'{key}' matn bo'lishi kerak")
            values[key] = body[key].strip()[:limit]
    if "title" in values and not values["title"]:
        raise HTTPException(422, "Kitob nomi bo'sh bo'lmasligi kerak")
    if "language" in body:
        if body["language"] not in {"uz", "ru", "en"}:
            raise HTTPException(422, "Til noto'g'ri")
        values["language"] = body["language"]
    if "is_published" in body:
        if not isinstance(body["is_published"], bool):
            raise HTTPException(422, "is_published true/false bo'lishi kerak")
        if body["is_published"]:
            current = await db.select("books", f"select=status&id=eq.{book_id}&limit=1")
            if not current:
                raise HTTPException(404, "Kitob topilmadi")
            if current[0]["status"] != "ready":
                raise HTTPException(409, "Kitob hali tayyor emas, nashr qilib bo'lmaydi")
        values["is_published"] = body["is_published"]
    if not values:
        raise HTTPException(422, "Yangilanadigan maydon topilmadi")
    values["updated_at"] = now_iso()
    result = await db.update("books", f"id=eq.{book_id}", values)
    if not result:
        raise HTTPException(404, "Kitob topilmadi")
    await audit(user, "book_update", book_id, {k: v for k, v in values.items() if k != "updated_at"})
    return result[0]


@app.delete("/api/admin/books/{book_id}")
async def remove_book(book_id: str, user: dict = Depends(admin_user)):
    book_id = uid(book_id)
    rows = await db.select("books", f"select=id,title,file_path,cover_path&id=eq.{book_id}&limit=1")
    if not rows:
        raise HTTPException(404, "Kitob topilmadi")
    book = rows[0]
    pages: list[dict] = []
    while True:  # Supabase bitta so'rovda ko'pi bilan 1000 qator qaytaradi
        chunk = await db.select("book_pages", f"select=image_path&book_id=eq.{book_id}&order=page_number.asc"
                                              f"&limit=1000&offset={len(pages)}")
        pages += chunk
        if len(chunk) < 1000:
            break
    await db.delete("books", f"id=eq.{book_id}")  # book_pages ON DELETE CASCADE
    await storage.remove_many([book.get("file_path"), book.get("cover_path")] + [p["image_path"] for p in pages])
    await audit(user, "book_delete", book_id, {"title": book["title"]})
    return {"ok": True}


# ---------------------------------------------------------------- admin: foydalanuvchilar
@app.get("/api/admin/users")
async def admin_users(search: str = "", user: dict = Depends(admin_user)):
    query = ("select=telegram_id,username,first_name,drops,diamonds,level,is_blocked,created_at,last_seen_at"
             "&order=created_at.desc&limit=100")
    term = clean_search(search)
    if term.isdigit():
        query += f"&telegram_id=eq.{term}"
    elif term:
        q = quote(term)
        query += f"&or=(first_name.ilike.*{q}*,username.ilike.*{q}*)"
    return await db.select("profiles", query)


@app.patch("/api/admin/users/{telegram_id}")
async def edit_user(telegram_id: int, request: Request, user: dict = Depends(admin_user)):
    body = await body_json(request)
    values = {k: v for k, v in body.items() if k in {"is_blocked", "drops", "diamonds", "level"}}
    if not values:
        raise HTTPException(422, "O'zgarish topilmadi")
    if "is_blocked" in values and not isinstance(values["is_blocked"], bool):
        raise HTTPException(422, "is_blocked true/false bo'lishi kerak")
    for key in ("drops", "diamonds", "level"):
        if key in values:
            v = values[key]
            if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > 10**9:
                raise HTTPException(422, "Balans va level manfiy bo'lmasligi kerak")
    if values.get("level") == 0:
        raise HTTPException(422, "Level kamida 1 bo'lishi kerak")
    if "is_blocked" in values and telegram_id in settings.admins:
        raise HTTPException(409, "Adminni bloklab bo'lmaydi")
    values["updated_at"] = now_iso()
    result = await db.update("profiles", f"telegram_id=eq.{telegram_id}", values)
    if not result:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    forget_block_state(telegram_id)
    await audit(user, "user_update", str(telegram_id), {k: v for k, v in values.items() if k != "updated_at"})
    return result[0]


# ---------------------------------------------------------------- admin: vazifalar
@app.get("/api/admin/tasks")
async def admin_tasks(user: dict = Depends(admin_user)):
    return await db.select("tasks", "select=id,title,description,reward_drops,is_active,created_at&order=created_at.desc&limit=200")


@app.post("/api/admin/tasks", status_code=201)
async def create_task(request: Request, user: dict = Depends(admin_user)):
    body = await body_json(request)
    title = str(body.get("title", "")).strip()
    description = str(body.get("description", "")).strip()
    reward = body.get("reward_drops")
    if not title or not description:
        raise HTTPException(422, "Vazifa nomi va tavsifi kerak")
    if isinstance(reward, bool) or not isinstance(reward, int) or reward < 0 or reward > 10000:
        raise HTTPException(422, "Mukofot 0 dan 10000 gacha butun son bo'lishi kerak")
    rows = await db.insert("tasks", {"title": title[:120], "description": description[:500], "reward_drops": reward,
                                     "is_active": bool(body.get("is_active", True))})
    await audit(user, "task_create", rows[0]["id"], {"title": title, "reward_drops": reward})
    return rows[0]


@app.patch("/api/admin/tasks/{task_id}")
async def edit_task(task_id: str, request: Request, user: dict = Depends(admin_user)):
    task_id = uid(task_id)
    body = await body_json(request)
    if not isinstance(body.get("is_active"), bool):
        raise HTTPException(422, "is_active true/false bo'lishi kerak")
    rows = await db.update("tasks", f"id=eq.{task_id}", {"is_active": body["is_active"]})
    if not rows:
        raise HTTPException(404, "Vazifa topilmadi")
    await audit(user, "task_update", task_id, {"is_active": body["is_active"]})
    return rows[0]


@app.delete("/api/admin/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(admin_user)):
    task_id = uid(task_id)
    await db.delete("tasks", f"id=eq.{task_id}")
    await audit(user, "task_delete", task_id)
    return {"ok": True}


# ---------------------------------------------------------------- Telegram webhook
@app.post("/webhook/telegram")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    secret = settings.telegram_webhook_secret
    if not secret or not hmac.compare_digest(x_telegram_bot_api_secret_token or "", secret):
        raise HTTPException(403, "Webhook tasdiqlanmadi")
    if not bot:
        raise HTTPException(503, "Bot token sozlanmagan")
    update = Update.model_validate(await request.json(), context={"bot": bot})
    await dp.feed_update(bot, update)
    return {"ok": True}


@app.post("/webhook/set")
async def set_webhook(request: Request, authorization: str | None = Header(default=None)):
    """Faqat sozlash egasi uchun: `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>` talab qilinadi."""
    secret = settings.telegram_webhook_secret
    if not bot or not secret:
        raise HTTPException(503, "Bot yoki webhook secret sozlanmagan")
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, secret):
        raise HTTPException(403, "Ruxsat yo'q")
    body = await body_json(request)
    url = str(body.get("webhook_url", ""))
    if not url.startswith("https://"):
        raise HTTPException(422, "HTTPS webhook URL kerak")
    await bot.set_webhook(url, secret_token=secret, drop_pending_updates=True)
    return {"ok": True}
