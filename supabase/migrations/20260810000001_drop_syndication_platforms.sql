-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth — Rebuild growth_published_memory view WITHOUT
-- DEV.to, Hashnode, and Medium columns.
--
-- The three platforms have been removed from the Growth Agent. Their
-- historical rows in growth_syndication are kept (append-only ledger),
-- but the view no longer surfaces per-platform columns for them.
--
-- LinkedIn tracking is retained (linkedin_status, linkedin_at,
-- linkedin_url columns unchanged).
--
-- NOTE: instagram columns are NOT added here. A separate migration
-- (20260810000002) will add instagram_* columns when the Instagram
-- channel is introduced by a parallel agent.
--
-- Replaces: supabase/migrations/20260706100000_growth_published_memory.sql
-- Idempotent: CREATE OR REPLACE VIEW is safe to re-run.
-- Apply: SQL Editor → paste → Run.
-- ═══════════════════════════════════════════════════════════════════

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
  -- LinkedIn: NO URL persisted anywhere. Status derived from the linkedin draft.
  li.status                               AS linkedin_status,
  li.created_at                           AS linkedin_at,
  NULL::text                              AS linkedin_url,
  -- Measured: LinkedIn outcomes only (see original migration header). NULL for articles.
  lo.measured_at                          AS measured_at
FROM published_articles pa
LEFT JOIN LATERAL (
  -- Slug from schema_json if present (new rows), else derived from url (backfill).
  SELECT d.status, d.created_at
  FROM growth_drafts d
  WHERE d.kind = 'linkedin'
    AND d.status = 'published'
    AND rtrim(regexp_replace(d.url, '^.*/learn-ai-with-reeturaj/', ''), '/') = pa.slug
  ORDER BY d.created_at DESC LIMIT 1
) li   ON TRUE
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
-- d.id::text = o.draft_id::text cast is defensive (both uuid); remove the cast
-- if your pg parses the uuid join directly. Left as-is so a type mismatch never
-- breaks the view.
