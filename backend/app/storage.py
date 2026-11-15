"""Supabase Storage bilan ishlash."""
import os
import uuid

from fastapi import HTTPException

from .config import get_settings
from .db import client

CHUNK_SIZE = 8 * 1024 * 1024


def _auth_headers() -> dict:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise HTTPException(503, "Supabase Storage sozlanmagan")
    return {"Authorization": f"Bearer {s.supabase_service_role_key}", "apikey": s.supabase_service_role_key}


def make_key(prefix: str, ext: str) -> str:
    """Storage kaliti faqat ASCII: fayl nomidagi o'zbek/kirill harflar va bo'shliqlar xato beradi."""
    ext = ext.lstrip(".").lower() or "bin"
    return f"{prefix}/{uuid.uuid4().hex}.{ext}"


async def upload_bytes(key: str, content_type: str, data: bytes) -> str:
    s = get_settings()
    url = f"{s.supabase_base}/storage/v1/object/{s.supabase_bucket}/{key}"
    headers = {**_auth_headers(), "Content-Type": content_type, "x-upsert": "false"}
    last = None
    for attempt in range(3):  # vaqtinchalik tarmoq xatolariga qarshi qayta urinish
        try:
            r = await client().post(url, headers=headers, content=data, timeout=120)
            if r.status_code < 300:
                return key
            last = r.text[:200]
            if r.status_code < 500:
                break
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
    raise HTTPException(502, "Faylni saqlashda xatolik: " + str(last))


async def upload_file(key: str, content_type: str, local_path: str) -> str:
    """Katta faylni bo'laklab yuboradi. Content-Length beriladi (chunked yuborish Storage'da xato berishi mumkin)."""
    s = get_settings()
    url = f"{s.supabase_base}/storage/v1/object/{s.supabase_bucket}/{key}"
    size = os.path.getsize(local_path)
    headers = {**_auth_headers(), "Content-Type": content_type, "Content-Length": str(size), "x-upsert": "false"}

    async def chunks():
        with open(local_path, "rb") as stream:
            while True:
                chunk = stream.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    r = await client().post(url, headers=headers, content=chunks(), timeout=1800)
    if r.status_code >= 300:
        raise HTTPException(502, "Katta faylni Storage'ga saqlashda xatolik: " + r.text[:200])
    return key


async def sign_many(paths: list[str], expires: int = 3600) -> dict[str, str]:
    """Ko'p fayl uchun bitta so'rov bilan imzolangan havolalar (path -> url)."""
    paths = [p for p in dict.fromkeys(paths) if p]
    if not paths:
        return {}
    s = get_settings()
    url = f"{s.supabase_base}/storage/v1/object/sign/{s.supabase_bucket}"
    result: dict[str, str] = {}
    for i in range(0, len(paths), 200):
        batch = paths[i:i + 200]
        r = await client().post(url, headers=_auth_headers(), json={"expiresIn": expires, "paths": batch})
        if r.status_code >= 300:
            raise HTTPException(502, "Fayl havolalarini yaratib bo'lmadi")
        for item in r.json():
            if item.get("signedURL") and not item.get("error"):
                result[item["path"]] = s.supabase_base + "/storage/v1" + item["signedURL"]
    return result


async def sign_one(path: str, expires: int = 3600) -> str | None:
    return (await sign_many([path], expires)).get(path)


async def remove_many(paths: list[str]) -> None:
    """Storage'dan fayllarni o'chiradi (xato bo'lsa jim o'tadi — tozalash ishi to'xtamasin)."""
    paths = [p for p in paths if p]
    if not paths:
        return
    s = get_settings()
    url = f"{s.supabase_base}/storage/v1/object/{s.supabase_bucket}"
    for i in range(0, len(paths), 100):
        try:
            await client().request("DELETE", url, headers=_auth_headers(), json={"prefixes": paths[i:i + 100]})
        except Exception:  # noqa: BLE001
            pass
