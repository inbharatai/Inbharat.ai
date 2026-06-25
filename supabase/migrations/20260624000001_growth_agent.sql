-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — schema (Phase 1 + 2, audit-only)
--
-- All 12 tables from the master plan. RLS is ENABLED with NO client
-- policies (same pattern as guest_usage): anon/authenticated roles are
-- denied everything; only the service_role (api/lib/supabaseAdmin)
-- bypasses RLS. The admin UI never talks to these tables directly — it
-- goes through /api/growth/* which uses supabaseAdmin.
--
-- Apply:  supabase db push      (or run via scripts/run-migration.mjs)
-- All tables are optional at runtime: the API degrades gracefully when
-- Supabase is not configured (mirrors lib/orchestration/stateManager).
-- ═══════════════════════════════════════════════════════════════════

-- Shared updated_at touch function (namespaced to avoid collisions)
CREATE OR REPLACE FUNCTION growth_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 1. Authorized assets (mirror of config/growth-authorized-assets.json) ───
CREATE TABLE IF NOT EXISTS growth_authorized_assets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain        text NOT NULL UNIQUE,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  can_crawl            boolean NOT NULL DEFAULT false,
  can_audit            boolean NOT NULL DEFAULT false,
  can_draft            boolean NOT NULL DEFAULT false,
  can_create_pr        boolean NOT NULL DEFAULT false,
  can_publish_directly boolean NOT NULL DEFAULT false,
  requires_human_approval boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Repo registry (mirror of config/repo-registry.json) ───
CREATE TABLE IF NOT EXISTS growth_repo_registry (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_name         text NOT NULL,
  product_slug         text NOT NULL UNIQUE,
  canonical_private_repo text,
  public_repo          text,
  website_path         text,
  source_of_truth      text NOT NULL DEFAULT 'canonical_private',
  public_repo_status   text NOT NULL DEFAULT 'public_mirror_current',
  crawl_private_repo   boolean NOT NULL DEFAULT false,
  crawl_public_repo    boolean NOT NULL DEFAULT false,
  allow_agent_read     boolean NOT NULL DEFAULT false,
  allow_agent_pr       boolean NOT NULL DEFAULT false,
  notes                text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Crawl runs ───
CREATE TABLE IF NOT EXISTS growth_crawl_runs (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain       text NOT NULL,
  status       text NOT NULL DEFAULT 'running',   -- running|completed|failed
  pages_count  int  NOT NULL DEFAULT 0,
  avg_seo_score  int,
  avg_geo_score  int,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_crawl_runs_domain ON growth_crawl_runs (domain, created_at DESC);

-- ─── 4. Audited pages ───
CREATE TABLE IF NOT EXISTS growth_pages (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crawl_run_id     uuid REFERENCES growth_crawl_runs(id) ON DELETE CASCADE,
  url              text NOT NULL,
  domain           text NOT NULL,
  http_status      int,
  title            text,
  meta_description text,
  canonical        text,
  h1               text,
  word_count       int,
  seo_score        int,
  geo_score        int,
  issues           jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  crawled_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_pages_domain ON growth_pages (domain, crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_pages_run ON growth_pages (crawl_run_id);

-- ─── 5. Keywords (high-intent engine; populated in Phase 4) ───
CREATE TABLE IF NOT EXISTS growth_keywords (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword         text NOT NULL,
  product_slug    text,
  intent          text,           -- e.g. enterprise risk/compliance
  funnel_stage    text,           -- top|mid|bottom
  recommended_url text,
  existing_page   boolean,
  priority        text NOT NULL DEFAULT 'normal', -- critical|high|normal|low
  content_type    text,
  cta             text,
  status          text NOT NULL DEFAULT 'new',     -- new|mapped|drafted|published
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_keywords_priority ON growth_keywords (priority, status);

-- ─── 6. Tasks (correction/SEO/GEO tasks) ───
CREATE TABLE IF NOT EXISTS growth_tasks (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type        text NOT NULL,      -- seo|geo|mismatch|keyword|internal-link
  scope       text,               -- url|domain|repo
  title       text NOT NULL,
  description text,
  priority    text NOT NULL DEFAULT 'normal',
  status      text NOT NULL DEFAULT 'open',  -- open|in_progress|done|wontfix
  source      text,               -- crawler|audit|repo-truth
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_tasks_status ON growth_tasks (status, priority);

-- ─── 7. Drafts (content writer output; Phase 5) ───
CREATE TABLE IF NOT EXISTS growth_drafts (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id           uuid REFERENCES growth_tasks(id) ON DELETE SET NULL,
  kind              text NOT NULL,   -- landing|meta|faq|schema|readme|product
  url               text,
  title             text,
  meta_description  text,
  body_md           text,
  schema_json       jsonb,
  status            text NOT NULL DEFAULT 'draft',  -- draft|pending|approved|rejected|published
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_drafts_status ON growth_drafts (status);

-- ─── 8. Performance snapshots (GA4 + GSC) ───
CREATE TABLE IF NOT EXISTS growth_performance_snapshots (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain      text NOT NULL,
  source      text NOT NULL,        -- ga4|gsc|indexnow|uptime
  metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_perf_domain ON growth_performance_snapshots (domain, source, captured_at DESC);

-- ─── 9. Agent logs (incl. denied-attempt audit trail) ───
CREATE TABLE IF NOT EXISTS growth_agent_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level       text NOT NULL DEFAULT 'info',   -- info|warn|deny|error
  action      text NOT NULL,
  scope       text,                            -- domain|repo|url
  detail      text,
  denied      jsonb,                            -- populated on deny-by-default
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_logs_created ON growth_agent_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_logs_level ON growth_agent_logs (level, created_at DESC);

-- ─── 10. Model usage + cost ───
CREATE TABLE IF NOT EXISTS growth_model_usage (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model             text NOT NULL,
  task              text NOT NULL,        -- audit|draft|review|summary
  prompt_tokens     int  NOT NULL DEFAULT 0,
  completion_tokens int  NOT NULL DEFAULT 0,
  total_tokens      int  NOT NULL DEFAULT 0,
  cost_usd          numeric(12,6) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'ok',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_model_usage_created ON growth_model_usage (created_at DESC);

-- ─── 11. Approvals (human approval gate) ───
CREATE TABLE IF NOT EXISTS growth_approvals (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id   uuid REFERENCES growth_drafts(id) ON DELETE CASCADE,
  reviewer   text,
  decision   text NOT NULL,    -- approved|rejected
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_approvals_draft ON growth_approvals (draft_id);

-- ─── 12. PR jobs (Phase 6) ───
CREATE TABLE IF NOT EXISTS growth_pr_jobs (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id   uuid REFERENCES growth_drafts(id) ON DELETE SET NULL,
  repo       text NOT NULL,
  branch      text,
  pr_number   int,
  pr_url      text,
  status      text NOT NULL DEFAULT 'pending', -- pending|created|merged|failed
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_pr_jobs_status ON growth_pr_jobs (status);

-- ─── updated_at triggers for tables that carry updated_at ───
DROP TRIGGER IF EXISTS trg_growth_assets_touch ON growth_authorized_assets;
CREATE TRIGGER trg_growth_assets_touch BEFORE UPDATE ON growth_authorized_assets
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

DROP TRIGGER IF EXISTS trg_growth_repo_touch ON growth_repo_registry;
CREATE TRIGGER trg_growth_repo_touch BEFORE UPDATE ON growth_repo_registry
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

DROP TRIGGER IF EXISTS trg_growth_tasks_touch ON growth_tasks;
CREATE TRIGGER trg_growth_tasks_touch BEFORE UPDATE ON growth_tasks
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

DROP TRIGGER IF EXISTS trg_growth_drafts_touch ON growth_drafts;
CREATE TRIGGER trg_growth_drafts_touch BEFORE UPDATE ON growth_drafts
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

DROP TRIGGER IF EXISTS trg_growth_pr_jobs_touch ON growth_pr_jobs;
CREATE TRIGGER trg_growth_pr_jobs_touch BEFORE UPDATE ON growth_pr_jobs
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- ─── RLS: deny all client access; service_role only ───
ALTER TABLE growth_authorized_assets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_repo_registry           ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_crawl_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_pages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_keywords                ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_drafts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_performance_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_agent_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_model_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_approvals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_pr_jobs                 ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated roles; service_role bypasses RLS.