import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Clock, Globe, Layers } from 'lucide-react';
import { api, hasTgBack, useAsync } from '../api';
import { Button, Cover, ErrorState, ProgressBar, Skeleton } from '../ui';

const LANGS = { uz: "O'zbekcha", ru: 'Ruscha', en: 'Inglizcha' };

export default function BookDetail({ bookId, go, back }) {
  const { data: book, loading, error, reload } = useAsync(() => api(`/api/books/${bookId}`), [bookId]);
  const [more, setMore] = useState(false);

  if (loading) return <><Skeleton h={300} r={20} /><Skeleton h={28} w="70%" className="mt" /><Skeleton h={90} className="mt" /></>;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const started = book.last_page > 0;
  const long = (book.description || '').length > 180;

  return (
    <div className="detail">
      {!hasTgBack && <button className="back-link" onClick={back}><ArrowLeft size={16} /> Orqaga</button>}
      <div className="detail-hero">
        <div className="detail-glow" style={book.cover_url ? { backgroundImage: `url(${book.cover_url})` } : undefined} />
        <Cover url={book.cover_url} title={book.title} className="big" />
      </div>
      <h1 className="detail-title">{book.title}</h1>
      <p className="detail-author">{book.author || 'Muallif ko\'rsatilmagan'}</p>

      <div className="facts">
        <div><Layers size={16} /><b>{book.page_count}</b><small>bet</small></div>
        <div><Globe size={16} /><b>{LANGS[book.language] || book.language}</b><small>til</small></div>
        <div><Clock size={16} /><b>~{Math.max(1, Math.round(book.page_count * 1.5))}</b><small>daqiqa</small></div>
      </div>

      {book.category && <div className="chips"><span className="chip static">{book.category}</span></div>}

      {started && (
        <div className="card pad">
          <div className="row between"><small className="muted">O'qish jarayoni</small><b>{Math.round((book.last_page / book.page_count) * 100)}%</b></div>
          <ProgressBar value={book.last_page} max={book.page_count} />
        </div>
      )}

      {book.description && (
        <section className="section">
          <h3 className="h3">Kitob haqida</h3>
          <p className={`desc ${long && !more ? 'clamp' : ''}`}>{book.description}</p>
          {long && <button className="link" onClick={() => setMore(!more)}>{more ? 'Kamroq' : "Ko'proq o'qish"}</button>}
        </section>
      )}

      <div className="sticky-cta">
        <Button size="lg" icon={<BookOpen size={18} />} onClick={() => go('reader', { id: book.id })}>
          {started ? `Davom ettirish · ${book.last_page}-bet` : "O'qishni boshlash"}
        </Button>
      </div>
    </div>
  );
}
