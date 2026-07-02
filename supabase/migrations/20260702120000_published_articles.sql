-- ═══════════════════════════════════════════════════════════════════
-- published_articles — SEO memory for every article published on InBharat
--
-- NOT part of the Growth Agent. This is SEO infra: a durable, queryable
-- record of each published article's canonical URL, slug, title, publish
-- date, category, and keywords — mirrored from content/articles.meta.ts
-- by the non-growth build-time script scripts/sync-published-articles.ts
-- on every deploy. The growth agent never writes here; the sync script
-- upserts, so a re-publish updates the row (UNIQUE on slug = dedupe).
--
-- medium_url / medium_status / linkedin_url / linkedin_status are placeholders
-- for future syndication capture (deferred — capturing them requires growth-
-- agent edits the user has forbidden). They stay NULL until then.
--
-- RLS ENABLED with NO client policies (same pattern as growth_* tables):
-- anon/authenticated denied everything; only service_role (api/lib/
-- supabaseAdmin) bypasses RLS. The sync script uses supabaseAdmin.
--
-- Apply:  supabase db push   (or run via scripts/run-migration.mjs)
-- Optional at runtime: the build degrades gracefully when Supabase is not
-- configured (the sync script no-ops on missing env vars).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_articles (
  slug             text PRIMARY KEY,           -- dedupe key (UNIQUE by definition)
  title            text NOT NULL,
  canonical_url    text NOT NULL,
  publish_date     date NOT NULL,
  category         text,
  keywords         text[],                     -- from articles.meta.ts hashtags
  platform         text NOT NULL DEFAULT 'inbharat',
  syndication_type text NOT NULL DEFAULT 'original',
  medium_url       text,
  medium_status    text,
  linkedin_url     text,
  linkedin_status  text,
  source_meta_sha  text,                       -- dedupe/changed-detection marker
  synced_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE published_articles ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated get nothing; service_role bypasses RLS.

-- Helpful for the admin/GSC view: newest first.
CREATE INDEX IF NOT EXISTS published_articles_publish_date_idx
  ON published_articles (publish_date DESC);