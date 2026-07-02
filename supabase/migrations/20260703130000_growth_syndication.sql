-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — Stage 3 syndication ledger
--
-- growth_syndication: one row per syndication attempt (an approved article
-- draft pushed to an external platform — DEV.to, Hashnode, or Medium manual).
-- The Growth Agent owns this table (unlike published_articles, which is the
-- non-growth SEO mirror). Recording the platform URL + status here is the
-- syndication memory: the /admin/growth/syndication page reads it to show the
-- founder every cross-post + its outcome, with clickable platform URLs.
--
-- NOT a unique constraint on (draft_id, platform): a re-syndicate (after a fix
-- or a failed attempt) is a new row, so the founder sees the full history. The
-- page shows newest-first; the latest row per (draft_id, platform) is the
-- current state. The growth_drafts draft is NOT modified by syndication (its
-- status stays approved/published) — syndication is a parallel action.
--
-- Status values match lib/growth/syndication/types.ts SyndicationStatus:
--   published      — live on the platform (Hashnode publishPost)
--   draft          — created as a platform draft for review (DEV.to published:false)
--   manual         — Medium helper built (no API; founder imports by hand)
--   failed         — the platform API returned an error
--   not_configured — the platform's env var is absent
--
-- canonical_url is always the InBharat www canonical sent as the cross-post
-- canonical, so every row records what we told the platform to attribute.
--
-- RLS ENABLED with NO client policies (same pattern as growth_* tables):
-- anon/authenticated denied everything; only service_role (api/lib/
-- supabaseAdmin) bypasses RLS. The syndicate route uses supabaseAdmin.
--
-- Apply:  supabase db push   (or the HTTPS Management API used for prior migrations).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS growth_syndication (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id         text NOT NULL,
  slug             text NOT NULL,
  platform         text NOT NULL,            -- devto | hashnode | medium
  status           text NOT NULL,            -- published | draft | manual | failed | not_configured
  canonical_url    text NOT NULL,
  platform_url     text,                     -- null for manual/failed/not_configured
  platform_post_id text,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE growth_syndication ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated get nothing; service_role bypasses RLS.

-- The page's "latest per platform" lookup scans (draft_id, platform) newest-first.
CREATE INDEX IF NOT EXISTS growth_syndication_draft_platform_idx
  ON growth_syndication (draft_id, platform, created_at DESC);

-- Browse all cross-posts for one article.
CREATE INDEX IF NOT EXISTS growth_syndication_slug_idx
  ON growth_syndication (slug, created_at DESC);

-- The admin page lists newest-first across all articles.
CREATE INDEX IF NOT EXISTS growth_syndication_created_idx
  ON growth_syndication (created_at DESC);