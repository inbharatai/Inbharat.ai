-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth — Published Memory view (the Jervis cockpit piece #2)
--
-- growth_published_memory: a READ-ONLY view joining the three disjoint
-- "what's published where" sources by slug so the cockpit + cross-platform
-- dedupe have one row per article with every platform URL/status:
--   • published_articles  — website originals (PK=slug, canonical, title, date)
--   • growth_syndication  — DEV.to / Hashnode / Medium cross-posts (append-only;
--     latest row per (slug, platform) is the current state)
--   • growth_drafts kind='linkedin' status='published' — LinkedIn posts
--
-- Slug is the only reliable join key across the three. canonical_url is
-- derivable from slug, so we don't store it twice. NO content_hash column —
-- the view is read-only; body-hash change detection (if ever needed) is
-- computed in TS from the markdown, not materialized here.
--
-- HONEST limitations baked into the view (surfaced in the cockpit UI):
--   • LinkedIn post URL is NEVER persisted. The share-template flow returns a
--     URL the founder posts manually; no column stores the final post URL.
--     linkedin_url is always NULL here; linkedin_status is derived from the
--     draft status only. The UI shows "posted manually", not a fake URL.
--   • measured_at is LinkedIn-only. growth_outcomes.kind is CHECK-constrained
--     to linkedin|inbox-outline, so article publishes never create outcome
--     rows. measured_at is NULL for articles by design — article SEO lives in
--     growth_pages via the audit runner, surfaced separately in the cockpit.
--
-- LinkedIn slug backfill: promoter.ts historically did NOT write
-- schema_json.slug on linkedin drafts (only articleUrl). The LinkedIn LATERAL
-- therefore derives the slug from the row's url column with a COALESCE fallback
-- so existing rows resolve. New rows (post promoter.ts patch) carry schema_json.slug.
--
-- Views carry no RLS. Underlying tables are RLS deny-all; service_role
-- (api/lib/supabaseAdmin) bypasses. supabaseAdmin.from('growth_published_memory')
-- .select() is confirmed queryable. No grants needed.
--
-- Apply:  node scripts/apply-migrations.cjs  (pooler — direct host is IP-banned).
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
  -- DEV.to (latest row per slug+platform)
  dev.platform_url                        AS devto_url,
  dev.status                              AS devto_status,
  dev.created_at                          AS devto_at,
  -- Hashnode
  hash.platform_url                       AS hashnode_url,
  hash.status                             AS hashnode_status,
  hash.created_at                         AS hashnode_at,
  -- Medium
  med.platform_url                        AS medium_url,
  med.status                              AS medium_status,
  med.created_at                          AS medium_at,
  -- LinkedIn: NO URL persisted anywhere. Status derived from the linkedin draft.
  li.status                               AS linkedin_status,
  li.created_at                           AS linkedin_at,
  NULL::text                              AS linkedin_url,
  -- Measured: LinkedIn outcomes only (see header). NULL for articles.
  lo.measured_at                          AS measured_at
FROM published_articles pa
LEFT JOIN LATERAL (
  SELECT platform_url, status, created_at
  FROM growth_syndication s
  WHERE s.slug = pa.slug AND s.platform = 'devto'
  ORDER BY created_at DESC LIMIT 1
) dev  ON TRUE
LEFT JOIN LATERAL (
  SELECT platform_url, status, created_at
  FROM growth_syndication s
  WHERE s.slug = pa.slug AND s.platform = 'hashnode'
  ORDER BY created_at DESC LIMIT 1
) hash ON TRUE
LEFT JOIN LATERAL (
  SELECT platform_url, status, created_at
  FROM growth_syndication s
  WHERE s.slug = pa.slug AND s.platform = 'medium'
  ORDER BY created_at DESC LIMIT 1
) med  ON TRUE
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