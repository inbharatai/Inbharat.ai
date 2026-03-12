-- InBharat.ai: workflow_state table for agentic orchestration
-- Tracks multi-step workflows, their steps, and execution state.
-- Run in Supabase SQL Editor or via: supabase db push

create table if not exists public.workflow_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,   -- null for guests
  session_id uuid references public.chat_sessions(id) on delete cascade,
  workflow_type text not null default 'single' check (workflow_type in ('single', 'multi_step')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  intent_detected text not null default 'general',
  app_target text not null default 'inbharat' check (app_target in ('inbharat', 'uniassist', 'testprep', 'mixed')),
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fast lookups: active workflows per user, recent workflows per session
create index if not exists idx_workflow_state_user
  on public.workflow_state (user_id, updated_at desc);

create index if not exists idx_workflow_state_session
  on public.workflow_state (session_id, created_at desc);

-- RLS: users can only see/edit their own workflows
alter table public.workflow_state enable row level security;

create policy "Users can CRUD own workflows"
  on public.workflow_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at in sync automatically
create or replace function public.set_workflow_state_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_workflow_state_updated_at
  before update on public.workflow_state
  for each row execute function public.set_workflow_state_updated_at();
