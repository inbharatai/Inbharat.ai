-- ════════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — editable registry + agent rules + inbox items.
--
-- Makes the repo/asset registry DB-backed + live-editable (no redeploy):
--   - editor columns on growth_repo_registry / growth_authorized_assets
--     (source = seed|ui, editor_locked, GitHub verify cache cols)
--   - growth_agent_rules: founder-authored do/dont/voice/schedule rules,
--     injected into the promoter's system prompt (the agent's "memory")
--   - growth_inbox_items: tracks dropped content files (Phase 2 ingestion)
--
-- The two JSON config files remain the SEED/fallback (lib/growth/authorization.ts
-- reads DB-first, cached, falling back to the JSON so the pipeline never breaks
-- and hermetic tests with no DB stay green).
--
-- RLS deny-all, service_role only — same pattern as the other growth tables.
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Apply:  supabase db push   (or scripts/apply-migrations-pg.mjs)
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Editor columns on the (currently EMPTY) registry tables ───
ALTER TABLE growth_authorized_assets
  ADD COLUMN IF NOT EXISTS source         text    NOT NULL DEFAULT 'seed',   -- seed|ui
  ADD COLUMN IF NOT EXISTS editor_locked  boolean NOT NULL DEFAULT false;

ALTER TABLE growth_repo_registry
  ADD COLUMN IF NOT EXISTS source          text    NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS editor_locked   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_commit_sha text,
  ADD COLUMN IF NOT EXISTS last_commit_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_pr_state   text,   -- open|closed|merged|none
  ADD COLUMN IF NOT EXISTS last_checked_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_growth_repo_registry_status
  ON growth_repo_registry (public_repo_status, allow_agent_read);

-- ─── 2. Agent memory / rules ───
CREATE TABLE IF NOT EXISTS growth_agent_rules (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope       text NOT NULL,            -- repo|domain|global
  scope_key   text,                     -- repo slug | domain | NULL for global
  kind        text NOT NULL,            -- do|dont|voice|schedule
  rule_text   text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_agent_rules_scope_chk CHECK (scope IN ('repo','domain','global')),
  CONSTRAINT growth_agent_rules_kind_chk  CHECK (kind IN ('do','dont','voice','schedule'))
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_rules_lookup
  ON growth_agent_rules (enabled, scope, scope_key);

DROP TRIGGER IF EXISTS trg_growth_agent_rules_touch ON growth_agent_rules;
CREATE TRIGGER trg_growth_agent_rules_touch BEFORE UPDATE ON growth_agent_rules
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- ─── 3. Inbox items (used by Phase 2 drop-folder; created here so one apply) ───
CREATE TABLE IF NOT EXISTS growth_inbox_items (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  storage_path    text NOT NULL,             -- growth-inbox/<sha>/<filename>
  kind            text NOT NULL,             -- md|image|video|txt
  original_name   text,
  status          text NOT NULL DEFAULT 'pending',  -- pending|ingested|error
  sha256          text,
  linked_draft_id uuid REFERENCES growth_drafts(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ingested_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_growth_inbox_items_status ON growth_inbox_items (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_inbox_items_sha256 ON growth_inbox_items (sha256) WHERE sha256 IS NOT NULL;

-- ─── RLS: deny all client access; service_role only ───
ALTER TABLE growth_agent_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_inbox_items  ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated roles; service_role bypasses RLS.