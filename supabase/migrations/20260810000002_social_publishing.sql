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
CREATE OR REPLACE VIEW growth_published_memory AS
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
