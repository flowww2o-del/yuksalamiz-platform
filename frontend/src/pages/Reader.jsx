import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api, hasTgBack, tg, useAsync } from '../api';
import { Button, ErrorState, Spinner } from '../ui';

const CHUNK = 15;            // bir so'rovda nechta sahifa havolasi olinadi
const DEFAULT_RATIO = 0.707; // A4 nisbati, birinchi rasm yuklanguncha

export default function Reader({ bookId, back }) {
  const { data: book, loading, error, reload } = useAsync(() => api(`/api/books/${bookId}`), [bookId]);
  if (loading) return <main className="center reader-bg"><Spinner /><p className="muted">Kitob ochilmoqda…</p></main>;
  if (error) return <main className="center reader-bg"><ErrorState message={error} onRetry={reload} /><Button variant="ghost" onClick={back}>Orqaga</Button></main>;
  return <ReaderView book={book} back={back} />;
}

function ReaderView({ book, back }) {
  const total = book.page_count;
  const startPage = Math.min(Math.max(book.last_page || 1, 1), total);

  const [urls, setUrls] = useState({});
  const [near, setNear] = useState(() => new Set());
  const [current, setCurrent] = useState(startPage);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [chrome, setChrome] = useState(true);
  const [loadError, setLoadError] = useState('');

  const chunkState = useRef({}); // chunkIndex -> 'loading' | 'done' | attempts(number)
  const slots = useRef({});
  const nearObs = useRef(null);
  const midObs = useRef(null);

  const loadChunk = useCallback(async (ci, force = false) => {
    const st = chunkState.current;
    if (!force && (st[ci] === 'loading' || st[ci] === 'done')) return;
    const attempts = typeof st[`a${ci}`] === 'number' ? st[`a${ci}`] : 0;
    if (attempts >= 3) return;
    st[ci] = 'loading';
    try {
      const rows = await api(`/api/books/${book.id}/pages?start=${ci * CHUNK + 1}&count=${CHUNK}`);
      setUrls((u) => { const n = { ...u }; rows.forEach((r) => { if (r.url) n[r.page] = r.url; }); return n; });
      st[ci] = 'done'; st[`a${ci}`] = 0; setLoadError('');
    } catch (e) {
      st[ci] = 'error'; st[`a${ci}`] = attempts + 1; setLoadError(e.message);
    }
  }, [book.id]);

  // Kuzatuvchilar: ekranga yaqin sahifalarni yuklash va o'rtadagi sahifani aniqlash
  useEffect(() => {
    nearObs.current = new IntersectionObserver((entries) => {
      setNear((prev) => {
        const next = new Set(prev);
        entries.forEach((en) => {
          const p = Number(en.target.dataset.page);
          if (en.isIntersecting) { next.add(p); loadChunk(Math.floor((p - 1) / CHUNK)); } else next.delete(p);
        });
        return next;
      });
    }, { rootMargin: '1800px 0px' });
    midObs.current = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setCurrent(Number(en.target.dataset.page)); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    Object.values(slots.current).forEach((el) => { nearObs.current.observe(el); midObs.current.observe(el); });
    return () => { nearObs.current.disconnect(); midObs.current.disconnect(); };
  }, [loadChunk]);

  const register = useCallback((page, el) => {
    if (el) {
      slots.current[page] = el;
      nearObs.current?.observe(el); midObs.current?.observe(el);
    } else delete slots.current[page];
  }, []);

  // Havola muddati tugagan/buzilgan rasm: shu bo'lak uchun yangi havola olinadi (har sahifa uchun ko'pi bilan 2 marta)
  const brokenCount = useRef({});
  const handleBroken = useCallback((page) => {
    if ((brokenCount.current[page] || 0) >= 2) return;
    brokenCount.current[page] = (brokenCount.current[page] || 0) + 1;
    loadChunk(Math.floor((page - 1) / CHUNK), true);
  }, [loadChunk]);

  const retry = () => {
    chunkState.current = {};
    setLoadError('');
    near.forEach((p) => loadChunk(Math.floor((p - 1) / CHUNK)));
  };

  // Saqlangan sahifaga o'tish
  useEffect(() => {
    if (startPage > 1) slots.current[startPage]?.scrollIntoView({ block: 'start' });
  }, [startPage]);

  // Telegram: pastga-yuqoriga surishda ilova yopilib ketmasin
  useEffect(() => {
    tg?.disableVerticalSwipes?.();
    return () => tg?.enableVerticalSwipes?.();
  }, []);

  // O'qish jarayonini saqlash (debounce)
  const lastSaved = useRef(book.last_page || 0);
  const currentRef = useRef(current);
  currentRef.current = current;
  const save = useCallback(() => {
    const p = currentRef.current;
    if (p === lastSaved.current) return;
    lastSaved.current = p;
    api(`/api/books/${book.id}/progress`, { method: 'PUT', body: { page: p } }).catch(() => { lastSaved.current = -1; });
  }, [book.id]);
  useEffect(() => { const t = setTimeout(save, 1500); return () => clearTimeout(t); }, [current, save]);
  useEffect(() => save, [save]);

  const pageList = useMemo(() => Array.from({ length: total }, (_, i) => i + 1), [total]);
  const pct = total ? Math.round((current / total) * 100) : 0;

  return (
    <div className="reader" onClick={() => setChrome((c) => !c)}>
      <header className={`reader-bar ${chrome ? '' : 'hidden'}`} onClick={(e) => e.stopPropagation()}>
        {!hasTgBack && <button className="icon-btn" onClick={back} aria-label="Orqaga"><ArrowLeft size={20} /></button>}
        <div className="reader-title"><b>{book.title}</b><small>{current} / {total} bet</small></div>
      </header>

      <div className="reader-pages">
        {pageList.map((p) => (
          <PageSlot key={p} page={p} url={urls[p]} visible={near.has(p)} ratio={ratio} register={register}
            onRatio={setRatio} onBroken={handleBroken} />
        ))}
        <div className="reader-end"><b>Kitob tugadi 🎉</b><small>Davom etishdan oldin tanaffus qiling.</small></div>
      </div>

      {loadError && (
        <div className="reader-error" onClick={(e) => e.stopPropagation()}>
          <span>{loadError}</span>
          <Button size="sm" variant="soft" icon={<RefreshCw size={14} />} onClick={retry}>Qayta</Button>
        </div>
      )}

      <div className="reader-progress"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

const PageSlot = React.memo(function PageSlot({ page, url, visible, ratio, register, onRatio, onBroken }) {
  const [own, setOwn] = useState(null); // shu sahifaning haqiqiy nisbati
  const [ready, setReady] = useState(false);
  const setRef = useCallback((el) => register(page, el), [register, page]);
  return (
    <div ref={setRef} data-page={page} className="page-slot" style={{ aspectRatio: own || ratio }}>
      {visible && url ? (
        <img src={url} alt={`${page}-bet`} decoding="async" draggable={false} className={ready ? 'ready' : ''}
          onLoad={(e) => {
            const r = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
            if (r) { setOwn(r); if (page <= 3) onRatio(r); }
            setReady(true);
          }}
          onError={() => onBroken(page)} />
      ) : (
        <span className="page-num">{page}</span>
      )}
    </div>
  );
});
