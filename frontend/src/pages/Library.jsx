import React, { useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { api, useAsync } from '../api';
import { Cover, Empty, ErrorState, Skeleton } from '../ui';

export default function Library({ go }) {
  const { data, loading, error, reload } = useAsync(() => api('/api/books?limit=200'), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(() => [...new Set((data || []).map((b) => b.category).filter(Boolean))], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((b) =>
      (!category || b.category === category) &&
      (!q || b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)));
  }, [data, query, category]);

  return (
    <>
      <div className="page-title"><h1>Kutubxona</h1><p>{data ? `${data.length} ta kitob` : 'Kitoblar katalogi'}</p></div>

      <div className="search">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kitob yoki muallif qidirish" aria-label="Qidirish" />
        {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Tozalash"><X size={16} /></button>}
      </div>

      {categories.length > 0 && (
        <div className="chips">
          <button className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>Hammasi</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c === category ? '' : c)}>{c}</button>
          ))}
        </div>
      )}

      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <div className="grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={250} r={16} />)}</div>
      ) : filtered.length === 0 ? (
        <Empty icon={<BookOpen size={26} />} title={data?.length ? 'Hech narsa topilmadi' : 'Kitoblar hali yo\'q'}
          text={data?.length ? 'Boshqa so\'z bilan qidirib ko\'ring.' : 'Tez orada yangi kitoblar qo\'shiladi.'} />
      ) : (
        <div className="grid">
          {filtered.map((b) => (
            <button key={b.id} className="book-card" onClick={() => go('book', { id: b.id })}>
              <Cover url={b.cover_url} title={b.title} />
              <div className="book-card-body">
                <b>{b.title}</b>
                <small>{b.author || 'Muallif ko\'rsatilmagan'}</small>
                <span className="meta">{b.page_count} bet{b.category ? ` · ${b.category}` : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
