"""Supabase PostgREST bilan ishlash. Bitta umumiy HTTP klient ishlatiladi."""
import httpx
from fastapi import HTTPException

from .config import get_settings

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=15.0),
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _config():
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise HTTPException(503, "Supabase sozlanmagan: URL va service role key kerak")
    return s


def headers(prefer: str | None = None) -> dict:
    s = _config()
    h = {
        "apikey": s.supabase_service_role_key,
        "Authorization": f"Bearer {s.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _url(table: str, query: str = "") -> str:
    s = _config()
    return f"{s.supabase_base}/rest/v1/{table}" + (f"?{query}" if query else "")


def _fail(action: str, r: httpx.Response):
    raise HTTPException(502, f"DB {action} xatosi: {r.text[:250]}")


async def select(table: str, query: str = ""):
    r = await client().get(_url(table, query), headers=headers())
    if r.status_code >= 300:
        _fail("o'qish", r)
    return r.json()


async def count(table: str, query: str = "") -> int:
    """Qatorlar sonini aniq hisoblaydi (limitsiz)."""
    h = headers("count=exact")
    h["Range-Unit"] = "items"
    h["Range"] = "0-0"
    r = await client().get(_url(table, "select=*" + (f"&{query}" if query else "")), headers=h)
    if r.status_code >= 300:
        _fail("sanash", r)
    total = r.headers.get("content-range", "*/0").split("/")[-1]
    return int(total) if total.isdigit() else 0


async def insert(table: str, values, returning: bool = True, *, on_conflict: str | None = None,
                 resolution: str | None = None):
    """resolution: 'ignore-duplicates' yoki 'merge-duplicates' (on_conflict bilan)."""
    parts = ["return=representation" if returning else "return=minimal"]
    if resolution:
        parts.append(f"resolution={resolution}")
    query = f"on_conflict={on_conflict}" if on_conflict else ""
    r = await client().post(_url(table, query), headers=headers(",".join(parts)), json=values,
                            timeout=httpx.Timeout(120.0, connect=15.0))
    if r.status_code >= 300:
        _fail("yozish", r)
    return r.json() if returning and r.content else None


async def update(table: str, query: str, values: dict):
    r = await client().patch(_url(table, query), headers=headers("return=representation"), json=values)
    if r.status_code >= 300:
        _fail("yangilash", r)
    return r.json()


async def delete(table: str, query: str):
    r = await client().delete(_url(table, query), headers=headers("return=representation"))
    if r.status_code >= 300:
        _fail("o'chirish", r)
    return r.json()
