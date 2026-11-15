"""Kitobni fon rejimida qayta ishlash: original faylni saqlash, sahifalarni JPEG'ga aylantirish, bazaga yozish."""
import asyncio
import logging
import os

import fitz  # PyMuPDF

from . import db, storage
from .config import get_settings

log = logging.getLogger("yuksalamiz.processing")


def _render(doc: "fitz.Document", index: int, width: int, quality: int) -> bytes:
    page = doc.load_page(index)
    zoom = max(0.4, min(3.0, width / max(page.rect.width, 1.0)))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    try:
        return pix.tobytes("jpg", jpg_quality=quality)
    finally:
        del pix


async def _set(book_id: str, values: dict) -> None:
    try:
        await db.update("books", f"id=eq.{book_id}", values)
    except Exception:  # noqa: BLE001 — holat yozilmasa ham ishlov to'xtamasin
        log.exception("Kitob holatini yozib bo'lmadi: %s", book_id)


async def process_book(book_id: str, temp_path: str, ext: str, content_type: str, publish: bool = False) -> None:
    s = get_settings()
    uploaded: list[str] = []
    pending: set[asyncio.Task] = set()
    doc = None
    try:
        # 1) Original fayl
        original_key = storage.make_key("originals", ext)
        await storage.upload_file(original_key, content_type, temp_path)
        uploaded.append(original_key)
        await _set(book_id, {"file_path": original_key})

        # 2) Hujjatni ochish (PDF yoki rasm)
        doc = await asyncio.to_thread(fitz.open, temp_path, filetype=ext)
        if doc.needs_pass:
            raise ValueError("PDF parol bilan himoyalangan")
        total = len(doc)
        if total < 1:
            raise ValueError("Faylda sahifa topilmadi")
        await _set(book_id, {"page_count": total, "processed_pages": 0})

        # 3) Sahifalarni render qilish va parallel yuklash (xotira cheklangan: bir vaqtda ~N ta rasm)
        sem = asyncio.Semaphore(s.upload_concurrency)
        keys: dict[int, str] = {}

        async def push(number: int, data: bytes) -> None:
            try:
                key = storage.make_key(f"pages/{book_id}", "jpg")
                await storage.upload_bytes(key, "image/jpeg", data)
                keys[number] = key
                uploaded.append(key)
            finally:
                sem.release()

        def reap() -> None:
            for task in [t for t in pending if t.done()]:
                pending.discard(task)
                task.result()  # xato bo'lsa shu yerda ko'tariladi

        for i in range(total):
            data = await asyncio.to_thread(_render, doc, i, s.page_target_width, s.page_jpeg_quality)
            await sem.acquire()
            task = asyncio.create_task(push(i + 1, data))
            pending.add(task)
            reap()
            if (i + 1) % 10 == 0:
                await _set(book_id, {"processed_pages": len(keys)})
        while pending:
            await asyncio.wait(pending)
            reap()

        # 4) Muqova (kichik rasm)
        cover = await asyncio.to_thread(_render, doc, 0, s.cover_width, 72)
        cover_key = storage.make_key("covers", "jpg")
        await storage.upload_bytes(cover_key, "image/jpeg", cover)
        uploaded.append(cover_key)

        # 5) Sahifa yozuvlari
        rows = [{"book_id": book_id, "page_number": n, "image_path": keys[n]} for n in sorted(keys)]
        for offset in range(0, len(rows), 100):
            await db.insert("book_pages", rows[offset:offset + 100], returning=False)

        await _set(book_id, {"cover_path": cover_key, "page_count": total, "processed_pages": total,
                             "status": "ready", "error": None, "is_published": publish})
        log.info("Kitob tayyor: %s (%s sahifa)", book_id, total)
    except Exception as exc:  # noqa: BLE001
        log.exception("Kitobni qayta ishlashda xato: %s", book_id)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        message = getattr(exc, "detail", None) or str(exc) or "Noma'lum xato"
        await _set(book_id, {"status": "failed", "error": str(message)[:300], "is_published": False})
        await storage.remove_many(uploaded)
        try:
            await db.delete("book_pages", f"book_id=eq.{book_id}")
        except Exception:  # noqa: BLE001
            pass
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:  # noqa: BLE001
                pass
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


async def mark_stale_as_failed() -> None:
    """Server qayta ishga tushganda yarim qolgan ishlovlarni 'failed' deb belgilaydi."""
    try:
        await db.update("books", "status=eq.processing",
                        {"status": "failed", "error": "Server qayta ishga tushdi. Kitobni qayta yuklang."})
    except Exception:  # noqa: BLE001
        log.warning("Yarim qolgan ishlovlarni belgilab bo'lmadi")
