-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — Stage 1 hygiene migration
--
-- 1) Add the missing index on growth_pages(url, crawled_at DESC). The outcomes
--    loop (outcomes.ts seedOutcomeOnPublish + loadOutcomes) and the promoter's
--    fetchArticleContext both select growth_pages by `url` ordered by
--    crawled_at; without this index those are seq scans that grow with the
--    pages table (every daily audit appends a row per URL).
--
-- 2) Drop growth_performance_snapshots. It is dead schema: api/growth/
--    performance.ts explicitly removed its write-on-read path and nothing else
--    reads or writes it. Keeping it is pure cruft (RLS + index on an empty
--    table). Drop is safe — confirmed no code references it beyond a comment.
--
-- Apply:  supabase db push   (or run via scripts/run-migration.mjs / the
-- HTTPS Management API used for the prior migrations).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Outcome/promoter lookup path: select growth_pages by url, newest first.
CREATE INDEX IF NOT EXISTS idx_growth_pages_url_crawled
  ON growth_pages (url, crawled_at DESC);

-- 2) Drop the dead performance-snapshots table + its index + RLS.
DROP INDEX IF EXISTS idx_growth_perf_domain;
DROP TABLE IF EXISTS growth_performance_snapshots CASCADE;