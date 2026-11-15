import React from 'react';
import { Droplet, Gem, Star } from 'lucide-react';
import { fmtDate, fmtNum } from '../api';
import { Avatar } from '../ui';

export default function Profile({ me }) {
  return (
    <>
      <section className="profile-card card">
        <Avatar name={me.first_name} size={76} />
        <h1>{me.first_name || 'Foydalanuvchi'}</h1>
        <p className="muted">{me.username ? `@${me.username}` : 'Username ko\'rsatilmagan'}</p>
        {me.is_admin && <span className="badge blue">Administrator</span>}
      </section>

      <div className="stat-grid">
        <div className="stat-card"><Droplet className="c-blue" size={20} /><b>{fmtNum(me.drops)}</b><small>Drop</small></div>
        <div className="stat-card"><Gem className="c-purple" size={20} /><b>{fmtNum(me.diamonds)}</b><small>Diamond</small></div>
        <div className="stat-card"><Star className="c-gold" size={20} /><b>{me.level}</b><small>Level</small></div>
      </div>

      <div className="list card">
        <div className="list-row"><span className="muted">Telegram ID</span><b>{me.id}</b></div>
        <div className="list-row"><span className="muted">Qo'shilgan sana</span><b>{fmtDate(me.joined_at)}</b></div>
      </div>
    </>
  );
}
