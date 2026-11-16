-- PROPOSAL ONLY / UNAPPLIED. Apply AFTER supabase/migrations/20261116000001_article_publication_lifecycle.sql
-- and supabase/migrations/20260810000002_social_publishing.sql via reviewed tooling.
-- No data writes/deletes, no DROP, no changes to base-table RLS or view grants.
-- Canonical snapshot evidence is distinct from optional Vercel deployment evidence.
-- All historical rows remain visible; readers choose live/history explicitly.
BEGIN;
CREATE OR REPLACE VIEW public.growth_published_memory
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
  CASE WHEN pa.publication_state IN ('live', 'removed')
       THEN pa.publication_state ELSE 'unverified' END::text AS inbharat_status,
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
  lo.measured_at                          AS measured_at,
  -- Appended only: CREATE OR REPLACE preserves existing column order and grants.
  pa.publication_state,
  pa.first_verified_at,
  pa.verified_at,
  pa.removed_at,
  pa.source_commit_sha,
  pa.canonical_snapshot_id,
  pa.canonical_snapshot_built_at,
  pa.verification_method,
  pa.deployment_id,
  pa.deployment_created_at,
  pa.vercel_verified_at
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

COMMIT;
