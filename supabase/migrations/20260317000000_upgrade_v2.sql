-- ─────────────────────────────────────────────────────────────────────────────
-- InBharat AI — Supabase v2 Upgrade Migration
-- Run in Supabase SQL Editor or via: supabase db push
-- Date: 2026-03-17
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FIX: workflow_state.session_id — change from UUID FK to TEXT
--    The old UUID FK constraint breaks guest sessions where session_id is
--    a request-id string (e.g. "req_1234_abcdef") rather than a real UUID.
--    Also, guest users have no chat_sessions row, so the FK always fails.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old FK constraint and change column type to text.
--
-- FIX (2026-08-10): this block previously ran only the ALTER COLUMN. That does
-- NOT drop the foreign key — Postgres tries to re-implement it against the new
-- column type and fails:
--   ERROR: foreign key constraint "workflow_state_session_id_fkey" cannot be
--   implemented (SQLSTATE 42804) — key columns "session_id" and "id" are of
--   incompatible types: text and uuid.
-- Production was patched by hand so it never surfaced there, but every fresh
-- replay of the migration history (Supabase branch previews) died right here,
-- which is why no preview branch has ever built. Dropping the constraint first
-- is idempotent: a no-op where it has already been removed.
alter table public.workflow_state
  drop constraint if exists workflow_state_session_id_fkey;

alter table public.workflow_state
  alter column session_id type text using session_id::text;

-- Re-add a non-FK index for session lookups (FK dropped by type change)
drop index if exists idx_workflow_state_session;
create index if not exists idx_workflow_state_session
  on public.workflow_state (session_id, created_at desc)
  where session_id is not null;

-- Fix RLS to allow guest workflows (user_id IS NULL for guests)
-- Old policy required auth.uid() = user_id, which fails for NULL
drop policy if exists "Users can CRUD own workflows" on public.workflow_state;

create policy "Authenticated users can CRUD own workflows"
  on public.workflow_state
  for all
  using (user_id is null or auth.uid() = user_id)
  with check (user_id is null or auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NEW: user_profiles table
--    Stores per-user preferences: language, voice, display name, theme.
--    Created automatically on first sign-in via DB trigger.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'EN',
  preferred_voice text,
  preferred_mode text not null default 'STANDARD',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read and update own profile"
  on public.user_profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on new user sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at in sync
create or replace function public.set_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_user_profiles_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. UPGRADE: chat_sessions — add soft delete + message count cache
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.chat_sessions
  add column if not exists is_deleted boolean not null default false,
  add column if not exists message_count int not null default 0,
  add column if not exists last_model text;

-- Filter out soft-deleted sessions in default queries
create index if not exists idx_chat_sessions_user_active
  on public.chat_sessions (user_id, updated_at desc)
  where is_deleted = false;

-- Function: increment message count on insert
create or replace function public.increment_session_message_count()
returns trigger as $$
begin
  update public.chat_sessions
  set message_count = message_count + 1
  where id = new.session_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_increment_message_count on public.chat_messages;
create trigger trg_increment_message_count
  after insert on public.chat_messages
  for each row execute function public.increment_session_message_count();

-- Function: decrement message count on delete
create or replace function public.decrement_session_message_count()
returns trigger as $$
begin
  update public.chat_sessions
  set message_count = greatest(message_count - 1, 0)
  where id = old.session_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_decrement_message_count on public.chat_messages;
create trigger trg_decrement_message_count
  after delete on public.chat_messages
  for each row execute function public.decrement_session_message_count();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. UPGRADE: chat_messages — add full-text search + token tracking
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.chat_messages
  add column if not exists token_count int,
  add column if not exists search_vector tsvector
    generated always as (to_tsvector('english', coalesce(content, ''))) stored;

-- GIN index for full-text search on message content
create index if not exists idx_chat_messages_search
  on public.chat_messages using gin(search_vector);

-- Composite index for paginated message loading (session + time)
create index if not exists idx_chat_messages_session_created_covering
  on public.chat_messages (session_id, created_at asc)
  include (role, content);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. NEW: api_usage table — track token consumption per user for cost monitoring
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  request_id text not null,
  mode text not null default 'STANDARD',
  model text not null default 'gpt-4.1-mini',
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  search_used boolean not null default false,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_user_created
  on public.api_usage (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_api_usage_created
  on public.api_usage (created_at desc);

alter table public.api_usage enable row level security;

-- Users can only see their own usage stats
create policy "Users can read own API usage"
  on public.api_usage
  for select
  using (auth.uid() = user_id);

-- Service role can insert usage records (server-side only)
create policy "Service role can insert API usage"
  on public.api_usage
  for insert
  with check (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. UTILITY: Stored procedures for common operations
-- ═══════════════════════════════════════════════════════════════════════════

-- Search messages by content (full-text search)
create or replace function public.search_messages(
  p_user_id uuid,
  p_query text,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  message_id uuid,
  session_id uuid,
  session_title text,
  role text,
  content text,
  created_at timestamptz,
  rank real
)
language sql security definer
as $$
  select
    m.id as message_id,
    s.id as session_id,
    s.title as session_title,
    m.role,
    m.content,
    m.created_at,
    ts_rank(m.search_vector, plainto_tsquery('english', p_query)) as rank
  from public.chat_messages m
  join public.chat_sessions s on s.id = m.session_id
  where s.user_id = p_user_id
    and s.is_deleted = false
    and m.search_vector @@ plainto_tsquery('english', p_query)
  order by rank desc, m.created_at desc
  limit p_limit
  offset p_offset;
$$;

-- Get usage summary for a user (last 30 days)
create or replace function public.get_usage_summary(p_user_id uuid)
returns json
language sql security definer
as $$
  select json_build_object(
    'total_requests', count(*),
    'total_tokens', sum(total_tokens),
    'total_searches', sum(case when search_used then 1 else 0 end),
    'avg_tokens_per_request', round(avg(total_tokens)),
    'period_days', 30
  )
  from public.api_usage
  where user_id = p_user_id
    and created_at > now() - interval '30 days';
$$;

-- Soft-delete a session (keeps data for potential recovery)
create or replace function public.soft_delete_session(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql security definer
as $$
begin
  update public.chat_sessions
  set is_deleted = true, updated_at = now()
  where id = p_session_id and user_id = p_user_id;
  return found;
end;
$$;

-- Purge stale guest workflow records older than 24 hours
create or replace function public.purge_guest_workflows()
returns int
language plpgsql security definer
as $$
declare
  deleted_count int;
begin
  delete from public.workflow_state
  where user_id is null
    and created_at < now() - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. INDEXES: Additional performance indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Workflow state: quick pending/running lookup for cleanup
create index if not exists idx_workflow_state_status_updated
  on public.workflow_state (status, updated_at)
  where status in ('pending', 'running');

-- API usage: model-level cost analysis
create index if not exists idx_api_usage_model_created
  on public.api_usage (model, created_at desc);
