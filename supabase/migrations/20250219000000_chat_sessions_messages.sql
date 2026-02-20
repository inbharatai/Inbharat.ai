-- InBharat.ai: chat_sessions and chat_messages with RLS
-- Run in Supabase SQL Editor or via: supabase db push

-- chat_sessions: one row per conversation
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  active_mode text not null default 'STANDARD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user_updated
  on public.chat_sessions (user_id, updated_at desc);

alter table public.chat_sessions enable row level security;

create policy "Users can CRUD own chat_sessions"
  on public.chat_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chat_messages: messages belonging to a session
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  mode text,
  sources jsonb,
  image_url text,
  follow_ups jsonb,
  widget jsonb,
  error_code text,
  retry_after_seconds int,
  error_shown_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_created
  on public.chat_messages (session_id, created_at asc);

alter table public.chat_messages enable row level security;

create policy "Users can CRUD messages in own sessions"
  on public.chat_messages
  for all
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );

-- optional: keep updated_at on chat_sessions in sync
create or replace function public.set_chat_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_chat_sessions_updated_at();
