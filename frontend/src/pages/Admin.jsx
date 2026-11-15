import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, Ban, BookOpen, Check, ChevronDown, Droplet, Eye, EyeOff, FileText, Plus, Search, Shield,
  Trash2, Upload, Users as UsersIcon, ClipboardList,
} from 'lucide-react';
import { api, fmtDate, fmtNum, uploadBook, useAsync } from '../api';
import {
  Avatar, Button, ConfirmSheet, Cover, Empty, ErrorState, ProgressBar, SectionHead, Segmented, Sheet, Skeleton, useToast,
} from '../ui';

const TABS = [
  { value: 'overview', label: 'Umumiy' },
  { value: 'books', label: 'Kitoblar' },
  { value: 'users', label: 'Foydalanuvchilar' },
  { value: 'tasks', label: 'Vazifalar' },
];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  return (
    <>
      <div className="admin-title">
        <div className="admin-shield"><Shield size={24} /></div>
        <div><span className="eyebrow">BOSHQARUV MARKAZI</span><h1>Admin panel</h1></div>
      </div>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      <div className="admin-body">
        {tab === 'overview' && <Overview onOpen={setTab} />}
        {tab === 'books' && <Books />}
        {tab === 'users' && <Users />}
        {tab === 'tasks' && <Tasks />}
      </div>
    </>
  );
}

/* ================================================================ Umumiy */
const ACTIONS = {
  book_upload: 'Kitob yuklandi', book_update: 'Kitob tahrirlandi', book_delete: 'Kitob o\'chirildi',
  user_update: 'Foydalanuvchi yangilandi', task_create: 'Vazifa yaratildi', task_update: 'Vazifa yangilandi',
  task_delete: 'Vazifa o\'chirildi',
};

function Overview({ onOpen }) {
  const { data, loading, error, reload } = useAsync(() => api('/api/admin/overview'), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <div className="stat-grid two"><Skeleton h={92} r={16} /><Skeleton h={92} r={16} /><Skeleton h={92} r={16} /><Skeleton h={92} r={16} /></div>;
  return (
    <>
      <div className="stat-grid two">
        <button className="stat-card" onClick={() => onOpen('users')}><UsersIcon className="c-blue" size={20} /><b>{fmtNum(data.users)}</b><small>Foydalanuvchilar</small></button>
        <div className="stat-card"><Activity className="c-green" size={20} /><b>{fmtNum(data.active_today)}</b><small>Bugun faol</small></div>
        <button className="stat-card" onClick={() => onOpen('books')}><BookOpen className="c-purple" size={20} /><b>{data.books_ready}<span className="of"> / {data.books}</span></b><small>Tayyor kitoblar</small></button>
        <button className="stat-card" onClick={() => onOpen('tasks')}><ClipboardList className="c-gold" size={20} /><b>{data.active_tasks}</b><small>Faol vazifalar</small></button>
      </div>
      {data.books_processing > 0 && <div className="note info"><span className="spinner sm" /> {data.books_processing} ta kitob qayta ishlanmoqda…</div>}
      <SectionHead eyebrow="TARIX" title="So'nggi harakatlar" />
      {data.recent.length === 0 ? <p className="muted small">Hozircha harakat yo'q.</p> : (
        <div className="list card">
          {data.recent.map((r, i) => (
            <div key={i} className="list-row"><div className="list-main"><b>{ACTIONS[r.action] || r.action}</b><small>{fmtDate(r.created_at)}</small></div></div>
          ))}
        </div>
      )}
    </>
  );
}

/* ================================================================ Kitoblar */
function Books() {
  const toast = useToast();
  const { data, loading, error, reload, refresh } = useAsync(() => api('/api/admin/books'), []);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const processing = data?.some((b) => b.status === 'processing');
  useEffect(() => {
    if (!processing) return undefined;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [processing]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePublish = async (b) => {
    try { await api(`/api/admin/books/${b.id}`, { method: 'PATCH', body: { is_published: !b.is_published } }); toast(b.is_published ? 'Nashrdan olindi' : 'Nashr qilindi'); refresh(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const remove = (b) => setConfirm({
    title: 'Kitobni o\'chirish', danger: true, confirmLabel: 'O\'chirish',
    text: `"${b.title}" va uning barcha sahifalari butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.`,
    onConfirm: async () => { try { await api(`/api/admin/books/${b.id}`, { method: 'DELETE' }); toast("Kitob o'chirildi"); refresh(); } catch (e) { toast(e.message, 'err'); } },
  });

  return (
    <>
      <Button icon={<Plus size={18} />} onClick={() => setSheet(true)}>Yangi kitob yuklash</Button>

      <div className="section">
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Skeleton h={90} r={16} /> : data.length === 0 ? (
          <Empty icon={<Upload size={26} />} title="Kitoblar yo'q" text="Birinchi kitobni PDF yoki rasm ko'rinishida yuklang." />
        ) : (
          <div className="list card">
            {data.map((b) => (
              <div key={b.id} className="book-row">
                <Cover url={b.cover_url} title={b.title} className="w48" />
                <div className="list-main">
                  <b>{b.title}</b>
                  <small>{b.author || '—'} · {b.page_count} bet</small>
                  <StatusBadge book={b} />
                  {b.status === 'processing' && <ProgressBar value={b.processed_pages} max={b.page_count || 1} />}
                  {b.status === 'failed' && b.error && <small className="err-text">{b.error}</small>}
                </div>
                <div className="row-actions">
                  {b.status === 'ready' && (
                    <button className={`icon-btn ${b.is_published ? 'on' : ''}`} onClick={() => togglePublish(b)}
                      aria-label={b.is_published ? 'Nashrdan olish' : 'Nashr qilish'}>
                      {b.is_published ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  )}
                  <button className="icon-btn danger" onClick={() => remove(b)} aria-label="O'chirish"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UploadSheet open={sheet} onClose={() => setSheet(false)} onDone={() => { setSheet(false); refresh(); }} />
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function StatusBadge({ book }) {
  if (book.status === 'processing') return <span className="badge blue">Ishlanmoqda {book.processed_pages}/{book.page_count || '…'}</span>;
  if (book.status === 'failed') return <span className="badge red">Xato</span>;
  return book.is_published ? <span className="badge green">Nashr qilingan</span> : <span className="badge">Qoralama</span>;
}

const fmtSize = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function UploadSheet({ open, onClose, onDone }) {
  const toast = useToast();
  const formRef = useRef(null);
  const [file, setFile] = useState(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { toast('Fayl tanlang', 'err'); return; }
    const fd = new FormData(formRef.current);
    fd.set('file', file);
    fd.set('publish', formRef.current.elements.publish.checked ? 'true' : 'false');
    setBusy(true); setPct(0);
    try {
      const res = await uploadBook(fd, setPct);
      toast(res.message || 'Fayl qabul qilindi');
      formRef.current.reset(); setFile(null);
      onDone();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} title="Yangi kitob" onClose={busy ? () => {} : onClose}>
      <form ref={formRef} onSubmit={submit} className="form">
        <label>Kitob nomi<input name="title" placeholder="Masalan: O'tkan kunlar" required maxLength={200} disabled={busy} /></label>
        <label>Muallif<input name="author" placeholder="Muallif ismi" maxLength={200} disabled={busy} /></label>
        <div className="row gap">
          <label className="grow">Kategoriya<input name="category" placeholder="Roman, tarix…" maxLength={60} disabled={busy} /></label>
          <label>Til<select name="language" defaultValue="uz" disabled={busy}><option value="uz">O'zbekcha</option><option value="ru">Ruscha</option><option value="en">Inglizcha</option></select></label>
        </div>
        <label>Qisqacha tavsif<textarea name="description" placeholder="Kitob haqida ma'lumot" maxLength={2000} disabled={busy} /></label>

        <label className={`dropzone ${file ? 'has-file' : ''}`}>
          {file ? <FileText size={22} /> : <Upload size={22} />}
          <span>{file ? file.name : 'PDF yoki rasm faylini tanlang'}</span>
          {file && <small>{fmtSize(file.size)}</small>}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <label className="check"><input type="checkbox" name="publish" disabled={busy} /> <span>Tayyor bo'lgach darhol nashr qilish</span></label>

        {busy && (
          <div className="upload-progress">
            <div className="row between"><small>{pct < 100 ? 'Yuklanmoqda…' : 'Server qabul qilmoqda…'}</small><b>{pct}%</b></div>
            <ProgressBar value={pct} />
            <small className="muted">Katta fayllarda oynani yopmang.</small>
          </div>
        )}
        <Button type="submit" size="lg" loading={busy} icon={<Upload size={18} />}>Yuklash</Button>
      </form>
    </Sheet>
  );
}

/* ================================================================ Foydalanuvchilar */
function Users() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQ(search), 350); return () => clearTimeout(t); }, [search]);
  const { data, loading, error, reload, refresh } = useAsync(() => api(`/api/admin/users?search=${encodeURIComponent(q)}`), [q]);

  const patch = async (u, body, okText) => {
    try { await api(`/api/admin/users/${u.telegram_id}`, { method: 'PATCH', body }); toast(okText); refresh(); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  };
  const toggleBlock = (u) => setConfirm({
    title: u.is_blocked ? 'Blokdan chiqarish' : 'Foydalanuvchini bloklash', danger: !u.is_blocked,
    confirmLabel: u.is_blocked ? 'Blokdan chiqarish' : 'Bloklash',
    text: u.is_blocked ? `${u.first_name || u.telegram_id} yana platformadan foydalana oladi.` : `${u.first_name || u.telegram_id} platformaga kira olmaydi.`,
    onConfirm: () => patch(u, { is_blocked: !u.is_blocked }, u.is_blocked ? 'Blokdan chiqarildi' : 'Bloklandi'),
  });

  return (
    <>
      <div className="search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism, @username yoki Telegram ID" /></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton h={160} r={16} /> : !data?.length ? (
        <Empty icon={<UsersIcon size={26} />} title="Foydalanuvchi topilmadi" />
      ) : (
        <div className="list card">
          {data.map((u) => (
            <div key={u.telegram_id} className={`user-item ${open === u.telegram_id ? 'open' : ''}`}>
              <button className="list-row user-head" onClick={() => setOpen(open === u.telegram_id ? null : u.telegram_id)}>
                <Avatar name={u.first_name} size={38} />
                <div className="list-main">
                  <b>{u.first_name || 'Ismsiz'} {u.is_blocked && <span className="badge red">Bloklangan</span>}</b>
                  <small>{u.username ? `@${u.username} · ` : ''}{u.telegram_id}</small>
                </div>
                <span className="badge"><Droplet size={12} />{fmtNum(u.drops)}</span>
                <ChevronDown size={16} className="chev-down" />
              </button>
              {open === u.telegram_id && <UserEditor user={u} onSave={patch} onBlock={() => toggleBlock(u)} />}
            </div>
          ))}
        </div>
      )}
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function UserEditor({ user, onSave, onBlock }) {
  const [vals, setVals] = useState({ drops: String(user.drops), diamonds: String(user.diamonds), level: String(user.level) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/\D/g, '') }));
  const save = async () => {
    setBusy(true);
    await onSave(user, { drops: Number(vals.drops || 0), diamonds: Number(vals.diamonds || 0), level: Math.max(1, Number(vals.level || 1)) }, 'Saqlandi');
    setBusy(false);
  };
  return (
    <div className="user-editor">
      <div className="row gap">
        <label className="grow">Drop<input inputMode="numeric" value={vals.drops} onChange={set('drops')} /></label>
        <label className="grow">Diamond<input inputMode="numeric" value={vals.diamonds} onChange={set('diamonds')} /></label>
        <label className="grow">Level<input inputMode="numeric" value={vals.level} onChange={set('level')} /></label>
      </div>
      <small className="muted">Qo'shilgan: {fmtDate(user.created_at)} · So'nggi faollik: {fmtDate(user.last_seen_at)}</small>
      <div className="row gap">
        <Button variant={user.is_blocked ? 'soft' : 'danger-soft'} icon={<Ban size={16} />} onClick={onBlock}>{user.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}</Button>
        <Button icon={<Check size={16} />} loading={busy} onClick={save}>Saqlash</Button>
      </div>
    </div>
  );
}

/* ================================================================ Vazifalar */
function Tasks() {
  const toast = useToast();
  const { data, loading, error, reload, refresh } = useAsync(() => api('/api/admin/tasks'), []);
  const [form, setForm] = useState({ title: '', description: '', reward_drops: '10' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/tasks', { method: 'POST', body: { title: form.title, description: form.description, reward_drops: Number(form.reward_drops || 0) } });
      toast('Vazifa yaratildi'); setForm({ title: '', description: '', reward_drops: '10' }); refresh();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  const toggle = async (t) => { try { await api(`/api/admin/tasks/${t.id}`, { method: 'PATCH', body: { is_active: !t.is_active } }); refresh(); } catch (e) { toast(e.message, 'err'); } };
  const remove = (t) => setConfirm({
    title: "Vazifani o'chirish", danger: true, confirmLabel: "O'chirish", text: `"${t.title}" vazifasi o'chiriladi.`,
    onConfirm: async () => { try { await api(`/api/admin/tasks/${t.id}`, { method: 'DELETE' }); toast("Vazifa o'chirildi"); refresh(); } catch (e) { toast(e.message, 'err'); } },
  });

  return (
    <>
      <form className="card pad form" onSubmit={create}>
        <h3 className="h3">Yangi vazifa</h3>
        <label>Nomi<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: 10 bet o'qing" required maxLength={120} /></label>
        <label>Tavsif<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qisqacha izoh" required maxLength={500} /></label>
        <label>Mukofot (Drop)<input inputMode="numeric" value={form.reward_drops} onChange={(e) => setForm({ ...form, reward_drops: e.target.value.replace(/\D/g, '') })} required /></label>
        <Button type="submit" loading={busy} icon={<Plus size={18} />}>Vazifa qo'shish</Button>
      </form>

      <div className="section">
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Skeleton h={80} r={16} /> : data.length === 0 ? (
          <p className="muted small">Vazifalar hali yo'q.</p>
        ) : (
          <div className="list card">
            {data.map((t) => (
              <div key={t.id} className="list-row">
                <div className="list-main"><b>{t.title}</b><small>{t.description}</small></div>
                <span className="badge gold"><Droplet size={12} />+{t.reward_drops}</span>
                <button className={`switch ${t.is_active ? 'on' : ''}`} onClick={() => toggle(t)} aria-label={t.is_active ? "O'chirish" : 'Yoqish'} aria-pressed={t.is_active}><span /></button>
                <button className="icon-btn danger" onClick={() => remove(t)} aria-label="O'chirish"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
