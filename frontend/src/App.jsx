import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Home as HomeIcon, Shield, Trophy, UserRound } from 'lucide-react';
import { api, tg, useAsync, haptic } from './api';
import { Avatar, Button, Spinner } from './ui';
import Home from './pages/Home';
import Library from './pages/Library';
import BookDetail from './pages/BookDetail';
import Reader from './pages/Reader';
import Rating from './pages/Rating';
import Profile from './pages/Profile';
import Games from './pages/Games';
import Admin from './pages/Admin';

const TABS = [
  { name: 'home', label: 'Asosiy', icon: HomeIcon },
  { name: 'library', label: 'Kitoblar', icon: BookOpen },
  { name: 'rating', label: 'Reyting', icon: Trophy },
  { name: 'profile', label: 'Profil', icon: UserRound },
];

function Splash({ error, onRetry }) {
  return (
    <main className="center">
      <div className="logo">Y</div>
      {error ? (
        <>
          <h2>Kirish amalga oshmadi</h2>
          <p className="muted">{error}</p>
          {tg?.initData && <Button variant="soft" onClick={onRetry}>Qayta urinish</Button>}
        </>
      ) : (
        <>
          <Spinner />
          <p className="muted">Platforma yuklanmoqda…</p>
        </>
      )}
    </main>
  );
}

export default function App() {
  const profile = useAsync(() => {
    if (!tg?.initData) throw new Error('Mini Appni Telegram ichidagi bot orqali oching.');
    return api('/api/me');
  }, []);
  const me = profile.data;

  const [stack, setStack] = useState([{ name: 'home' }]);
  const route = stack[stack.length - 1];

  const go = useCallback((name, params = {}) => { haptic(); setStack((s) => [...s, { name, ...params }]); window.scrollTo(0, 0); }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const tab = useCallback((name) => { haptic(); setStack([{ name }]); window.scrollTo(0, 0); }, []);

  // Telegram "Orqaga" tugmasi
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return undefined;
    if (stack.length > 1) { bb.show(); bb.onClick(back); } else bb.hide();
    return () => bb.offClick(back);
  }, [stack.length, back]);

  if (profile.loading || profile.error || !me) return <Splash error={profile.error} onRetry={profile.reload} />;

  const ctx = { me, go, back, tab };

  if (route.name === 'reader') return <Reader {...ctx} bookId={route.id} />;

  const activeTab = stack[0].name; // sahifa ichidagi ekranlar (kitob, o'yinlar) bosh bo'limni faol qoldiradi
  const tabs = me.is_admin ? [...TABS, { name: 'admin', label: 'Admin', icon: Shield }] : TABS;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">Y</div>
          <div><b>Yuksalamiz</b><small>Bilim sari birga</small></div>
        </div>
        <button className="plain" onClick={() => tab('profile')} aria-label="Profil"><Avatar name={me.first_name} size={36} /></button>
      </header>

      <main className="content" key={route.name + (route.id || '')}>
        {route.name === 'home' && <Home {...ctx} />}
        {route.name === 'library' && <Library {...ctx} />}
        {route.name === 'book' && <BookDetail {...ctx} bookId={route.id} />}
        {route.name === 'rating' && <Rating {...ctx} />}
        {route.name === 'games' && <Games {...ctx} />}
        {route.name === 'profile' && <Profile {...ctx} />}
        {route.name === 'admin' && me.is_admin && <Admin {...ctx} />}
      </main>

      <nav className="bottom-nav" aria-label="Asosiy menyu">
        {tabs.map(({ name, label, icon: Icon }) => (
          <button key={name} className={`nav-item ${activeTab === name ? 'active' : ''}`} onClick={() => tab(name)}>
            <span className="nav-pill"><Icon size={20} /></span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
