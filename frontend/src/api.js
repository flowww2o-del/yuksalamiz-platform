import { useCallback, useEffect, useRef, useState } from 'react';

export const tg = window.Telegram?.WebApp;
export const hasTgBack = !!tg?.isVersionAtLeast?.('6.1');
const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

function errorText(data, status) {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return "Kiritilgan ma'lumotlar noto'g'ri";
  if (status === 401) return 'Telegram sessiyasi tugagan. Mini Appni qayta oching.';
  if (status === 413) return 'Fayl juda katta';
  return 'Xatolik yuz berdi. Keyinroq urinib ko\'ring.';
}

const authHeader = () => ({ Authorization: `tma ${tg?.initData || ''}` });

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...authHeader(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Server bilan aloqa yo'q. Internetni tekshiring.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* bo'sh javob */ }
  if (!res.ok) throw new ApiError(errorText(data, res.status), res.status);
  return data;
}

/** Katta fayl yuklash: foiz bo'yicha progress bilan. */
export function uploadBook(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/admin/books/upload`);
    xhr.setRequestHeader('Authorization', authHeader().Authorization);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError("Server bilan aloqa uzildi"));
    xhr.ontimeout = () => reject(new ApiError('Yuklash vaqti tugadi'));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(errorText(data, xhr.status), xhr.status));
    };
    xhr.send(formData);
  });
}

/** Ma'lumot yuklash hook'i: { data, error, loading, reload, setData }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const ticket = useRef(0);
  const run = useCallback(async (silent = false) => {
    const id = ++ticket.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await fn();
      if (id === ticket.current) setState({ data, error: '', loading: false });
    } catch (e) {
      if (id === ticket.current) setState((s) => ({ data: silent ? s.data : null, error: e.message, loading: false }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => { ticket.current++; }; }, [run]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: () => run(false), refresh: () => run(true), setData };
}

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export const fmtNum = (n) => new Intl.NumberFormat('ru-RU').format(n ?? 0);

export const haptic = (kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind); } catch { /* ignore */ } };
