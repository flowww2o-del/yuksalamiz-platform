import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, X } from 'lucide-react';

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-2), { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'err' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Asosiy elementlar ---------- */
export function Button({ variant = 'primary', size = 'md', icon, loading, children, className = '', ...rest }) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner sm" /> : icon}
      {children}
    </button>
  );
}

export const Spinner = () => <span className="spinner" aria-label="Yuklanmoqda" />;

export function Skeleton({ h = 16, w = '100%', r = 10, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w, borderRadius: r }} />;
}

export function ProgressBar({ value, max = 100, tone = 'primary' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <BookOpen size={26} />}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon danger"><AlertCircle size={26} /></div>
      <h3>Yuklab bo'lmadi</h3>
      <p>{message}</p>
      {onRetry && <Button variant="soft" onClick={onRetry}>Qayta urinish</Button>}
    </div>
  );
}

export function SectionHead({ eyebrow, title, action }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Cover({ url, title = '', className = '' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <div className={`cover ${className}`}>
      {url && !broken ? (
        <img src={url} alt={title} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="cover-fallback"><BookOpen size={22} /><span>{title.slice(0, 40)}</span></div>
      )}
    </div>
  );
}

export function Avatar({ name = '?', size = 40 }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</div>;
}

/* ---------- Pastdan chiqadigan oyna ---------- */
export function Sheet({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish"><X size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmSheet({ state, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const run = async () => {
    setBusy(true);
    try { await state.onConfirm(); } finally { setBusy(false); onClose(); }
  };
  return (
    <Sheet open title={state.title} onClose={onClose}>
      <p className="muted">{state.text}</p>
      <div className="row gap">
        <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
        <Button variant={state.danger ? 'danger' : 'primary'} loading={busy} onClick={run}>{state.confirmLabel || 'Tasdiqlash'}</Button>
      </div>
    </Sheet>
  );
}
