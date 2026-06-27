-- InBharat Growth Agent — Phase C: conversational agent + Auto Mode.
--
-- 1. growth_agent_threads / growth_agent_messages: persistence for the CMO chat
--    surface so the founder can converse with the agent, watch what it's doing
--    (tool calls narrated), and resume threads. The agent never publishes — every
--    artifact it creates is a human-gated draft in growth_drafts.
--
-- 2. growth_auto_mode: a singleton (id=1) holding the Auto Mode toggle. Default
--    is OFF + auto_approve OFF. When ON (enabled), a cron loop runs the agent
--    autonomously but STILL gates publish by the approval queue unless the founder
--    explicitly turns on auto_approve (hands-off shipping). Budget-guarded.
--
-- RLS: deny all client access; service_role only (admin endpoints read/write).
-- Mirrors the growth_settings / growth_strategy singleton patterns.

-- ─── 1. Conversation persistence ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_agent_threads (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text NOT NULL DEFAULT 'New conversation',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_threads_updated ON growth_agent_threads (updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_agent_messages (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id   uuid NOT NULL REFERENCES growth_agent_threads(id) ON DELETE CASCADE,
  role        text NOT NULL,                        -- user | assistant | tool
  content     text,                                  -- assistant/user text (null for pure tool messages)
  tool_name   text,                                  -- which tool was called (role='tool' / assistant tool-call)
  tool_args   jsonb,                                 -- args the model passed
  tool_result jsonb,                                 -- serialized result the tool returned
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_messages_thread ON growth_agent_messages (thread_id, created_at ASC);

-- updated_at touch on thread activity (new message bumps thread to top of list).
DROP TRIGGER IF EXISTS trg_growth_agent_threads_touch ON growth_agent_threads;
CREATE TRIGGER trg_growth_agent_threads_touch BEFORE UPDATE ON growth_agent_threads
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- ─── 2. Auto Mode singleton ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_auto_mode (
  id                int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled           boolean NOT NULL DEFAULT false,
  -- When true the loop also approves + publishes on its own (hands-off). OFF by
  -- default; the founder opts in deliberately. Every auto-publish is audited with
  -- auto=true so it is reviewable.
  auto_approve      boolean NOT NULL DEFAULT false,
  cadence_minutes   int  NOT NULL DEFAULT 30 CHECK (cadence_minutes >= 5 AND cadence_minutes <= 1440),
  max_tasks_per_run int  NOT NULL DEFAULT 5  CHECK (max_tasks_per_run >= 1 AND max_tasks_per_run <= 20),
  last_run_at       timestamptz,
  last_run_summary  text,
  updated_by        text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO growth_auto_mode (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_growth_auto_mode_touch ON growth_auto_mode;
CREATE TRIGGER trg_growth_auto_mode_touch BEFORE UPDATE ON growth_auto_mode
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

ALTER TABLE growth_agent_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_auto_mode      ENABLE ROW LEVEL SECURITY;