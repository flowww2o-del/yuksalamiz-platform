create extension if not exists pgcrypto;

create table if not exists public.profiles (
  telegram_id bigint primary key, username text, first_name text not null default '',
  drops bigint not null default 0 check (drops >= 0),
  diamonds bigint not null default 0 check (diamonds >= 0),
  level integer not null default 1 check (level >= 1),
  is_blocked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(), title text not null, author text not null default '',
  description text not null default '', category text not null default '', language text not null default 'uz',
  cover_path text, file_path text, file_type text not null check (file_type in ('pdf','image')),
  page_count integer not null default 0, processed_pages integer not null default 0,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error text,
  is_published boolean not null default false,
  created_by bigint, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.book_pages (
  id uuid primary key default gen_random_uuid(), book_id uuid not null references public.books(id) on delete cascade,
  page_number integer not null check (page_number > 0), image_path text not null, unique(book_id,page_number)
);

create table if not exists public.reading_progress (
  telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  last_page integer not null default 1 check (last_page >= 1),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, book_id)
);

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  currency text not null check (currency in ('drops','diamonds')), amount bigint not null, reason text not null,
  reference_id text, created_at timestamptz not null default now(),
  unique(telegram_id,currency,reason,reference_id)
);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade, started_at timestamptz not null default now(),
  ended_at timestamptz, rewarded boolean not null default false
);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(), admin_telegram_id bigint not null,
  action text not null, target text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  reward_drops integer not null default 0 check (reward_drops >= 0), is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  completed_at timestamptz not null default now(), unique(task_id,telegram_id)
);

create index if not exists idx_books_published on public.books(is_published, status, created_at desc);
create index if not exists idx_books_category on public.books(category);
create index if not exists idx_transactions_user on public.point_transactions(telegram_id,created_at desc);
create index if not exists idx_reading_user on public.reading_sessions(telegram_id,started_at desc);
create index if not exists idx_progress_recent on public.reading_progress(telegram_id, updated_at desc);
create index if not exists idx_profiles_created on public.profiles(created_at desc);
create index if not exists idx_profiles_drops on public.profiles(drops desc) where is_blocked = false;
create index if not exists idx_profiles_seen on public.profiles(last_seen_at desc);

-- Barcha jadvallarda RLS yoqilgan: ma'lumotga faqat backend (service role) kiradi.
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_pages enable row level security;
alter table public.reading_progress enable row level security;
alter table public.point_transactions enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.admin_audit enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
