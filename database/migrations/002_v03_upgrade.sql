-- Mavjud (v0.1/v0.2) bazani v0.3 ga yangilash. Xavfsiz: qayta ishga tushirish mumkin.
alter table public.profiles add column if not exists last_seen_at timestamptz;

alter table public.books alter column file_path drop not null;
alter table public.books add column if not exists processed_pages integer not null default 0;
alter table public.books add column if not exists status text not null default 'ready';
alter table public.books add column if not exists error text;
do $$ begin
  alter table public.books add constraint books_status_check check (status in ('processing','ready','failed'));
exception when duplicate_object then null; end $$;
alter table public.books alter column status set default 'processing';

create table if not exists public.reading_progress (
  telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  last_page integer not null default 1 check (last_page >= 1),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, book_id)
);
alter table public.reading_progress enable row level security;

drop index if exists idx_books_published;
create index if not exists idx_books_published on public.books(is_published, status, created_at desc);
create index if not exists idx_books_category on public.books(category);
create index if not exists idx_progress_recent on public.reading_progress(telegram_id, updated_at desc);
create index if not exists idx_profiles_drops on public.profiles(drops desc) where is_blocked = false;
create index if not exists idx_profiles_seen on public.profiles(last_seen_at desc);
