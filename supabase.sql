-- Ders Takip: Supabase SQL Editor'de tamamını çalıştırın.

create extension if not exists pgcrypto;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  color text not null default '#7c3aed',
  created_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  productivity integer not null check (productivity between 1 and 10),
  difficulty integer not null check (difficulty between 1 and 10),
  note text not null default '',
  studied_at date not null default current_date,
  next_review_at date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_courses_user on public.courses(user_id);
create index if not exists idx_topics_user on public.topics(user_id);
create index if not exists idx_topics_course on public.topics(course_id);
create index if not exists idx_sessions_user on public.study_sessions(user_id);
create index if not exists idx_sessions_course on public.study_sessions(course_id);
create index if not exists idx_sessions_topic on public.study_sessions(topic_id);
create index if not exists idx_sessions_next_review on public.study_sessions(next_review_at);
create index if not exists idx_sessions_studied_at on public.study_sessions(studied_at);

-- Row Level Security: herkes yalnızca kendi satırlarını görür/değiştirir
alter table public.courses enable row level security;
alter table public.topics enable row level security;
alter table public.study_sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['courses','topics','study_sessions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
