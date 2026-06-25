-- ════════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — usage context + live-editable budget.
--
-- 1. growth_model_usage: add context_url (which article/URL a model call
--    served) + provider (openai|gemini) so the admin dashboard can show
--    "which AI API is used where". Both nullable (existing rows backfill
--    to null) — the dashboard groups null context_url under "(system)".
-- 2. growth_settings: singleton row holding the live monthly budget cap
--    (editable from the admin UI without a redeploy). RLS deny-all like
--    the other growth tables — only service_role (api/lib/supabaseAdmin)
--    reads/writes it; the admin UI never talks to it directly.
--
-- Apply:  supabase db push   (or scripts/run-migration.mjs)
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. usage context columns ───
ALTER TABLE growth_model_usage
  ADD COLUMN IF NOT EXISTS context_url text,
  ADD COLUMN IF NOT EXISTS provider   text;

-- Index the context_url lookup used by the "where used" aggregation.
CREATE INDEX IF NOT EXISTS idx_growth_model_usage_context
  ON growth_model_usage (context_url, created_at DESC);

-- ─── 2. live-editable settings (singleton, id locked to 1) ───
CREATE TABLE IF NOT EXISTS growth_settings (
  id                 int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 20,
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row so reads always find a value.
INSERT INTO growth_settings (id, monthly_budget_usd)
VALUES (1, 20)
ON CONFLICT (id) DO NOTHING;

-- updated_at touch on budget edits.
DROP TRIGGER IF EXISTS trg_growth_settings_touch ON growth_settings;
CREATE TRIGGER trg_growth_settings_touch BEFORE UPDATE ON growth_settings
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- RLS: deny all client access; service_role only (same pattern as the
-- other growth tables — see 20260624000001_growth_agent.sql).
ALTER TABLE growth_settings ENABLE ROW LEVEL SECURITY;