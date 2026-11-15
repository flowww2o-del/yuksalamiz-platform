import React from 'react';
import { Crown, Droplet, Trophy } from 'lucide-react';
import { api, fmtNum, useAsync } from '../api';
import { Avatar, Empty, ErrorState, Skeleton } from '../ui';

export default function Rating() {
  const { data, loading, error, reload } = useAsync(() => api('/api/leaderboard'), []);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <><Skeleton h={80} r={18} /><Skeleton h={200} r={18} className="mt" /></>;

  const top = data.top || [];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean); // 2-1-3 ko'rinish

  return (
    <>
      <div className="page-title"><h1>Reyting</h1><p>Drop bo'yicha eng faol foydalanuvchilar</p></div>

      {data.me && (
        <div className="card my-rank">
          <div className="rank-no">#{data.me.rank}</div>
          <div className="list-main"><b>Sizning o'rningiz</b><small>Yuqoriga ko'tarilish uchun o'qing va vazifalarni bajaring</small></div>
          <span className="badge blue"><Droplet size={12} />{fmtNum(data.me.drops)}</span>
        </div>
      )}

      {top.length === 0 ? (
        <Empty icon={<Trophy size={26} />} title="Reyting hali bo'sh" text="Birinchi bo'lib Drop to'plang." />
      ) : (
        <>
          <div className="podium">
            {order.map((u) => (
              <div key={u.rank} className={`podium-col p${u.rank} ${u.is_me ? 'me' : ''}`}>
                {u.rank === 1 && <Crown size={20} className="crown" />}
                <Avatar name={u.name} size={u.rank === 1 ? 56 : 46} />
                <b>{u.name}</b>
                <small>{fmtNum(u.drops)}</small>
                <div className="podium-step"><span>{u.rank}</span></div>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <div className="list card">
              {rest.map((u) => (
                <div key={u.rank} className={`list-row ${u.is_me ? 'me' : ''}`}>
                  <span className="rank-small">{u.rank}</span>
                  <Avatar name={u.name} size={34} />
                  <div className="list-main"><b>{u.name}</b><small>Level {u.level}</small></div>
                  <span className="badge"><Droplet size={12} />{fmtNum(u.drops)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
