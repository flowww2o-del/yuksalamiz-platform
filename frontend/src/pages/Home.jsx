import React from 'react';
import { ChevronRight, Droplet, Gamepad2, Gem, Shield, Star, Trophy } from 'lucide-react';
import { api, fmtNum, useAsync } from '../api';
import { Cover, ProgressBar, SectionHead, Skeleton } from '../ui';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Xayrli tun';
  if (h < 12) return 'Xayrli tong';
  if (h < 18) return 'Xayrli kun';
  return 'Xayrli kech';
};

export default function Home({ me, go, tab }) {
  const recent = useAsync(() => api('/api/reading/recent'), []);
  const books = useAsync(() => api('/api/books?limit=10'), []);
  const tasks = useAsync(() => api('/api/tasks'), []);
  const last = recent.data;

  return (
    <>
      <section className="hero">
        <div className="hero-glow" />
        <span className="eyebrow">{greeting()}</span>
        <h1>{me.first_name || 'Do\'st'}, bugun ham<br /><em>bir qadam</em> oldinga!</h1>
        <div className="stats">
          <div><Droplet size={16} className="c-blue" /><b>{fmtNum(me.drops)}</b><small>Drop</small></div>
          <div><Gem size={16} className="c-purple" /><b>{fmtNum(me.diamonds)}</b><small>Diamond</small></div>
          <div><Star size={16} className="c-gold" /><b>{me.level}</b><small>Level</small></div>
        </div>
      </section>

      {last && (
        <button className="continue card" onClick={() => go('book', { id: last.id })}>
          <Cover url={last.cover_url} title={last.title} className="w56" />
          <div className="continue-body">
            <span className="eyebrow">DAVOM ETTIRING</span>
            <b>{last.title}</b>
            <small>{last.last_page} / {last.page_count} bet</small>
            <ProgressBar value={last.last_page} max={last.page_count} />
          </div>
          <ChevronRight size={18} className="chev" />
        </button>
      )}

      <section className="section">
        <SectionHead eyebrow="KUTUBXONA" title="Yangi kitoblar"
          action={<button className="link" onClick={() => tab('library')}>Barchasi</button>} />
        {books.loading ? (
          <div className="hscroll">{[0, 1, 2].map((i) => <Skeleton key={i} w={128} h={190} r={14} />)}</div>
        ) : books.data?.length ? (
          <div className="hscroll">
            {books.data.map((b) => (
              <button key={b.id} className="book-mini" onClick={() => go('book', { id: b.id })}>
                <Cover url={b.cover_url} title={b.title} />
                <b>{b.title}</b>
                <small>{b.author || '—'}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Hozircha kitoblar yo'q. Tez orada qo'shiladi.</p>
        )}
      </section>

      <section className="section">
        <SectionHead eyebrow="YUTUQLAR" title="Bo'limlar" />
        <div className="tiles">
          <button className="tile gold" onClick={() => tab('rating')}>
            <div className="tile-icon"><Trophy size={20} /></div><b>Reyting</b><small>Eng faollar ro'yxati</small>
          </button>
          <button className="tile purple" onClick={() => go('games')}>
            <div className="tile-icon"><Gamepad2 size={20} /></div><b>Mini o'yinlar</b><small>Tez orada</small>
          </button>
        </div>
      </section>

      {tasks.data?.length > 0 && (
        <section className="section">
          <SectionHead eyebrow="BUGUN" title="Faol vazifalar" />
          <div className="list card">
            {tasks.data.slice(0, 4).map((t) => (
              <div key={t.id} className="list-row">
                <div className="list-main"><b>{t.title}</b><small>{t.description}</small></div>
                <span className="badge gold"><Droplet size={12} />+{t.reward_drops}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {me.is_admin && (
        <button className="admin-banner" onClick={() => tab('admin')}>
          <Shield size={20} />
          <span><b>Admin boshqaruvi</b><small>Kitoblar, foydalanuvchilar, vazifalar</small></span>
          <ChevronRight size={18} />
        </button>
      )}
    </>
  );
}
