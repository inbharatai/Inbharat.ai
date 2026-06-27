-- ════════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — self-critique + outcome/learning loop.
--
-- Turns the pipeline into a learning, self-critiquing agent (no auto-publish):
--   - growth_outcomes: per-published-draft outcome tracking. Seeded when a
--     draft flips to 'published' (publish.ts); the daily cron re-audits the
--     article and diffs SEO/GEO + issue-resolution deltas vs the publish-time
--     baseline. Optional per-URL GSC deltas + manual LinkedIn engagement.
--   - growth_critique_log: append-only transparency log for the second-pass
--     'review' model critique+revision of every generated draft.
--   - growth_agent_rules +source +evidence: a learned-rule marker. The weekly
--     distill pass writes PROPOSED rules (enabled=false, source='learned',
--     evidence=the outcomes that produced them); the founder enables them in
--     the Rules tab. Existing rules default to source='founder'.
--
-- RLS deny-all, service_role only — same pattern as the other growth tables.
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Apply:  supabase db push   (or scripts/apply-migrations-pg.mjs)
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. growth_outcomes — per-published-draft outcome tracking (entity) ───
CREATE TABLE IF NOT EXISTS growth_outcomes (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id             uuid        REFERENCES growth_drafts(id) ON DELETE SET NULL,
  url                  text        NOT NULL,
  kind                 text        NOT NULL,                  -- linkedin|inbox-outline
  published_at         timestamptz NOT NULL,
  -- baseline captured at publish time (latest growth_pages row then; null if never audited)
  baseline_seo         int,
  baseline_geo         int,
  baseline_issues      jsonb,
  baseline_page_id     uuid,                                 -- growth_pages.id snapshot (no FK: rows accumulate)
  -- measured (re-audit) — null until the daily cron fills them
  measured_seo         int,
  measured_geo         int,
  measured_issues      jsonb,
  measured_at          timestamptz,
  -- optional per-URL GSC deltas (Phase 3; null unless GSC configured)
  gsc_clicks           int,
  gsc_impressions      int,
  gsc_ctr              numeric(8,6),
  gsc_position         numeric(8,4),
  -- manual LinkedIn engagement (founder-pasted via the Learning tab)
  linkedin_engagement  jsonb,                                -- {impressions, reactions, comments, enteredAt}
  linkedin_entered_at   timestamptz,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_outcomes_kind_chk CHECK (kind IN ('linkedin','inbox-outline'))
);

CREATE INDEX IF NOT EXISTS idx_growth_outcomes_url
  ON growth_outcomes (url, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_outcomes_draft
  ON growth_outcomes (draft_id);
CREATE INDEX IF NOT EXISTS idx_growth_outcomes_unmeasured
  ON growth_outcomes (measured_at) WHERE measured_at IS NULL;

-- entity table → touch trigger (reuses growth_touch_updated_at() from 20260624).
DROP TRIGGER IF EXISTS trg_growth_outcomes_touch ON growth_outcomes;
CREATE TRIGGER trg_growth_outcomes_touch BEFORE UPDATE ON growth_outcomes
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- ─── 2. growth_critique_log — append-only transparency log (no updated_at) ───
CREATE TABLE IF NOT EXISTS growth_critique_log (
  id           bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id     uuid         REFERENCES growth_drafts(id) ON DELETE SET NULL,
  task         text         NOT NULL DEFAULT 'review',
  candidate    text,                                   -- pre-revision draft body
  revised      text,                                   -- post-revision draft body
  weaknesses   jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- [{severity,area,fix}]
  model        text,
  provider     text,
  cost_usd     numeric(12,6) NOT NULL DEFAULT 0,
  status       text         NOT NULL DEFAULT 'ok',        -- ok|skipped|parse_failed|redacted|model_error
  note         text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_critique_log_draft
  ON growth_critique_log (draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_critique_log_created
  ON growth_critique_log (created_at DESC);
-- NO touch trigger (append-only).

-- ─── 3. growth_agent_rules — learned-rule marker columns ───
ALTER TABLE growth_agent_rules
  ADD COLUMN IF NOT EXISTS source   text  NOT NULL DEFAULT 'founder',  -- founder|seed|learned
  ADD COLUMN IF NOT EXISTS evidence jsonb;                             -- {outcomeIds[], deltas, sampleUrls[]}

ALTER TABLE growth_agent_rules DROP CONSTRAINT IF EXISTS growth_agent_rules_source_chk;
ALTER TABLE growth_agent_rules ADD CONSTRAINT growth_agent_rules_source_chk
  CHECK (source IN ('founder','seed','learned'));

CREATE INDEX IF NOT EXISTS idx_growth_agent_rules_source
  ON growth_agent_rules (source, enabled);

-- ─── 4. RLS: deny all client access; service_role only ───
ALTER TABLE growth_outcomes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_critique_log ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated.