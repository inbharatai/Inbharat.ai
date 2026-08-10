-- ════════════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — COMBINED pending migrations (apply in ONE paste).
-- Generated 2026-06-28. Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- so re-running is a no-op on any partial prior apply.
--
-- HOW TO APPLY (the only path that works from a machine without IPv6 to
-- the Supabase direct DB host, which is IPv6-only):
--   1. Open https://supabase.com/dashboard → project yxyikhnlevqioaqksevy
--   2. SQL Editor → New query → paste this entire file → Run.
--   The Dashboard runs DDL server-side over HTTPS (no IPv6 / psql needed).
--   Direct DB host db.yxyikhnlevqioaqksevy.supabase.co is IPv6-only and the
--   pooler returns 'tenant/user not found' for all 4 regions, so db push /
--   psql / pg from this machine all fail — the Dashboard SQL editor is the
--   reliable route. Each statement is independent; partial success is safe.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- FILE: 20260627nnnnnn_growth_outcomes_critique.sql
-- ────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────
-- FILE: 20260627000001_growth_inbox_folders.sql
-- ────────────────────────────────────────────────────────────────────
-- InBharat Growth Agent — Phase B: Inbox as folders the agent can access & review.
--
-- The inbox was flat (every drop at growth-inbox/<sha>/<filename>). The founder
-- wants to load FOLDERS of assets the growth agent can access, review, and use as
-- context. This migration:
--   1. adds `folder` (default '' = root) so drops can be grouped by folder,
--   2. adds `fed_to_agent` so the founder explicitly marks a folder/item as
--      available agent context (default false — nothing is auto-fed),
--   3. adds `analysis` jsonb for a later vision pass (C4) to store an image/video
--      analysis without a schema change later,
--   4. re-scopes the sha256 dedup to (sha256, folder) so the same asset may live
--      in two folders, and indexes folder for the tree + context loader.
--
-- RLS stays deny-all for anon/authenticated; service_role bypasses (unchanged).

ALTER TABLE growth_inbox_items
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fed_to_agent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analysis jsonb;

-- Re-scope the sha256 uniqueness to (sha256, folder): the same file content may
-- legitimately be dropped into two different folders. Drop the old global index.
DROP INDEX IF EXISTS idx_growth_inbox_items_sha256;
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_inbox_items_sha256_folder
  ON growth_inbox_items (sha256, folder) WHERE sha256 IS NOT NULL;

-- Folder tree + recursive context loader queries.
CREATE INDEX IF NOT EXISTS idx_growth_inbox_items_folder
  ON growth_inbox_items (folder, status, created_at);
CREATE INDEX IF NOT EXISTS idx_growth_inbox_items_fed
  ON growth_inbox_items (fed_to_agent, status) WHERE fed_to_agent = true;

-- ────────────────────────────────────────────────────────────────────
-- FILE: 20260627000002_growth_strategy.sql
-- ────────────────────────────────────────────────────────────────────
-- InBharat Growth Agent — Phase D: CMO strategy layer.
--
-- A singleton (id=1) holding the founder's positioning / ICP / audience / voice /
-- competitive-diff, written by the founder (or drafted by the 'strategy' model
-- task from recent learnings + outcomes) and injected as a STRATEGY: block into
-- the promoter / inbox / critique / agent system prompts. This is what turns the
-- Growth Agent from a generic copy drafter into an expert CMO that writes on-brand.
--
-- Mirrors the growth_settings singleton pattern (20260625000001). All fields are
-- nullable text so the founder can fill them incrementally; an empty block is
-- omitted from prompts (the draft pass is unchanged when no strategy is set).
--
-- RLS: deny all client access; service_role only (admin endpoints read/write it).

CREATE TABLE IF NOT EXISTS growth_strategy (
  id                 int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  positioning         text,        -- one-line positioning / category claim
  icp                text,        -- ideal customer profile (who we sell to)
  audience           text,        -- audience for content (who we write for)
  voice              text,        -- brand voice / tone rules
  competitive_diff    text,        -- how InBharat is different from alternatives
  goals              text,        -- near-term GTM goals the agent should serve
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row so reads always find a value.
INSERT INTO growth_strategy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at touch on strategy edits.
DROP TRIGGER IF EXISTS trg_growth_strategy_touch ON growth_strategy;
CREATE TRIGGER trg_growth_strategy_touch BEFORE UPDATE ON growth_strategy
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

ALTER TABLE growth_strategy ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────
-- FILE: 20260627000003_growth_agent_conversation.sql
-- ────────────────────────────────────────────────────────────────────
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


-- ============================================================================
-- growth_leads — lead capture + attribution (Lead Generation design, 2026-06-28)
-- See docs/LEAD_GENERATION.md. Public INSERT via service role (api/growth/leads.ts);
-- admin SELECT/UPDATE gated by requireAdmin. ip_hash is a salted SHA-256 for
-- rate-limit dedupe ONLY — the raw IP is never stored. Email is the sole PII.
-- Idempotent on (email, kind, source_site) while status <> 'lost' so re-submits of
-- the same newsletter signup don't create duplicates.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.growth_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  kind text NOT NULL,
  source_site text NOT NULL DEFAULT 'inbharat.ai',
  source_path text,
  source_slug text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text,
  consent_at timestamptz NOT NULL,
  consent_text text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  owner uuid,
  notes text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_leads_kind_idx        ON public.growth_leads(kind);
CREATE INDEX IF NOT EXISTS growth_leads_source_site_idx ON public.growth_leads(source_site);
CREATE INDEX IF NOT EXISTS growth_leads_source_slug_idx ON public.growth_leads(source_slug);
CREATE INDEX IF NOT EXISTS growth_leads_status_idx      ON public.growth_leads(status);
CREATE INDEX IF NOT EXISTS growth_leads_created_at_idx  ON public.growth_leads(created_at desc);
CREATE UNIQUE INDEX IF NOT EXISTS growth_leads_email_kind_site_uniq
  ON public.growth_leads(email, kind, source_site) WHERE status <> 'lost';

ALTER TABLE public.growth_leads ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS server-side; no public policy needed (the API owns all
-- writes). Admin reads go through requireAdmin -> supabaseAdmin (service role).

-- ────────────────────────────────────────────────────────────────────
-- FILE: 20260810000001 + 20260810000002 (consolidated)
-- ────────────────────────────────────────────────────────────────────
-- 20260810000001 removed the DEV.to/Hashnode/Medium columns from
-- growth_published_memory; 20260810000002 then rebuilt the same view with
-- instagram_* alongside linkedin_*. Applying 0002 alone reaches the identical
-- end state, so only it is inlined here — running 0001 first is harmless but
-- redundant.
--
-- Both use DROP + CREATE rather than CREATE OR REPLACE: REPLACE cannot drop or
-- reorder view columns, which is what made the earlier Supabase run fail.
-- ────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth — Social publishing layer (Instagram + LinkedIn API).
--
-- The founder builds social posts from material dropped into the Growth
-- Engine Inbox: the uploaded assets ARE the post visuals (nothing AI-invented;
-- the model writes only captions + alt text). This migration adds the two
-- inbox columns the media pipeline needs, and rebuilds the published-memory
-- view for the new platform set.
--
--   1. growth_inbox_items.post_order  — the carousel/post order the social
--      layer reads (orderedCarousel; NULL falls back to created_at).
--   2. growth_inbox_items.alt_text    — per-item accessibility alt text
--      (also LinkedIn's altText field / Instagram accessibility).
--
--   3. growth_published_memory — REBUILT for the linkedin_* + instagram_*
--      platform set. Migration 20260810000001 (a sibling agent's) is REMOVING
--      the DEV.to / Hashnode / Medium columns from this view. This migration's
--      higher timestamp guarantees it runs AFTER that one, so we redefine the
--      view FRESH (CREATE OR REPLACE with the full definition) carrying ONLY
--      linkedin_* + instagram_* + the base article columns + measured_at,
--      derived from the original 20260706100000 logic. If 20260810000001 has
--      not been authored/applied, this still produces the correct final shape
--      because CREATE OR REPLACE fully replaces the definition.
--
-- growth_drafts.kind is a free-text column (NO CHECK constraint — verified in
-- 20260624000001), so kind='instagram' (and the existing 'linkedin') need no
-- ALTER. Documented here so a future reader doesn't hunt for a constraint.
--
-- growth_syndication already accepts any platform string (no CHECK), so the
-- social route's platform='instagram'|'linkedin' ledger rows insert as-is.
--
-- RLS: unchanged. growth_inbox_items keeps its deny-all + service_role bypass;
-- the view carries no RLS (its base tables are deny-all; service_role bypasses).
--
-- Apply:  node scripts/apply-migrations.cjs  (pooler — direct host is IP-banned),
--         or: supabase db push.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 + 2. Inbox media ordering + alt text ─────────────────────────
ALTER TABLE growth_inbox_items
  ADD COLUMN IF NOT EXISTS post_order int,
  ADD COLUMN IF NOT EXISTS alt_text   text;

-- Fast ordered read of a folder's post media (orderedCarousel).
CREATE INDEX IF NOT EXISTS idx_growth_inbox_items_post_order
  ON growth_inbox_items (folder, post_order, created_at);

-- ─── 3. Published-memory view: linkedin_* + instagram_* only ─────────
-- Rebuilt fresh (no devto/hashnode/medium). instagram_* is derived from the
-- latest growth_syndication row per (slug, platform='instagram'), matching how
-- the original view derived the DEV.to/Hashnode/Medium cells it replaces.
-- LinkedIn keeps its original honest limitation: the deep-link publish path
-- persists NO post URL, so linkedin_url is NULL and status is draft-derived.
-- The NEW API publish path (api/growth/social.ts) DOES write a growth_syndication
-- row with platform='linkedin' + a permalink; that is surfaced via the linkedin
-- LATERAL's syndication fallback so an API-published post shows its real URL
-- while a deep-link post still shows "posted manually" (NULL url).
-- DROP + CREATE for the same reason as 20260810000001: this definition
-- reorders columns (instagram_* inserted before measured_at), which
-- CREATE OR REPLACE cannot do. security_invoker = on clears Supabase's
-- CRITICAL "Security Definer View" advisor on this view.
DROP VIEW IF EXISTS growth_published_memory;

CREATE VIEW growth_published_memory
WITH (security_invoker = on) AS
SELECT
  pa.slug,
  pa.title,
  pa.canonical_url,
  pa.publish_date,
  pa.category,
  pa.keywords,
  pa.source_meta_sha,
  pa.synced_at,
  'published'::text                       AS inbharat_status,
  -- LinkedIn: prefer the API-published syndication row's URL/status when present
  -- (new api/growth/social.ts path); else fall back to the linkedin DRAFT status
  -- with a NULL url (the deep-link "posted manually" path). COALESCE keeps both
  -- honest.
  COALESCE(lisyn.status, li.status)       AS linkedin_status,
  COALESCE(lisyn.created_at, li.created_at) AS linkedin_at,
  lisyn.platform_url                      AS linkedin_url,
  -- Instagram: latest growth_syndication row per slug (platform='instagram').
  ig.status                               AS instagram_status,
  ig.created_at                           AS instagram_at,
  ig.platform_url                         AS instagram_url,
  -- Measured: LinkedIn outcomes only (growth_outcomes.kind CHECK = linkedin|
  -- inbox-outline). NULL for articles + Instagram by design.
  lo.measured_at                          AS measured_at
FROM published_articles pa
LEFT JOIN LATERAL (
  -- LinkedIn draft (deep-link path): status only, NO url persisted.
  SELECT d.status, d.created_at
  FROM growth_drafts d
  WHERE d.kind = 'linkedin'
    AND d.status = 'published'
    AND rtrim(regexp_replace(d.url, '^.*/learn-ai-with-reeturaj/', ''), '/') = pa.slug
  ORDER BY d.created_at DESC LIMIT 1
) li   ON TRUE
LEFT JOIN LATERAL (
  -- LinkedIn API publish (new path): latest syndication row carries the permalink.
  SELECT s.platform_url, s.status, s.created_at
  FROM growth_syndication s
  WHERE s.slug = pa.slug AND s.platform = 'linkedin'
  ORDER BY s.created_at DESC LIMIT 1
) lisyn ON TRUE
LEFT JOIN LATERAL (
  -- Instagram: latest syndication row per slug.
  SELECT s.platform_url, s.status, s.created_at
  FROM growth_syndication s
  WHERE s.slug = pa.slug AND s.platform = 'instagram'
  ORDER BY s.created_at DESC LIMIT 1
) ig   ON TRUE
LEFT JOIN LATERAL (
  SELECT o.measured_at
  FROM growth_outcomes o
  JOIN growth_drafts d ON d.id::text = o.draft_id::text
  WHERE o.kind = 'linkedin'
    AND d.kind = 'linkedin'
    AND rtrim(regexp_replace(d.url, '^.*/learn-ai-with-reeturaj/', ''), '/') = pa.slug
  ORDER BY o.measured_at DESC NULLS LAST LIMIT 1
) lo   ON TRUE;

-- NOTE: growth_outcomes.draft_id is uuid FK → growth_drafts.id (uuid). The
-- d.id::text = o.draft_id::text cast is defensive (both uuid); harmless if pg
-- parses the uuid join directly. Left as-is so a type mismatch never breaks it.
