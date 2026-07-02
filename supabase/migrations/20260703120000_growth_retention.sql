-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — Stage 2 retention migration
--
-- The growth tables grow without limit:
--   - growth_pages: every daily audit appends a row per URL (one per page per
--     run). Over months the table grows unbounded; the outcomes + promoter
--     lookups only ever need the NEWEST row per URL, so older rows are pure cruft.
--   - growth_model_usage / growth_agent_logs / growth_critique_log: append-only
--     audit/cost tables. The dashboard only shows recent activity; old rows are
--     not read but bloat the tables + the seq scans that feed the dashboard.
--
-- This migration defines prune_growth_tables(...) — a PL/pgSQL function the daily
-- cron (api/growth/cron/daily.ts) calls via supabaseAdmin.rpc once a day, so
-- retention runs alongside the audit/promote/outcomes run. Running it in the cron
-- (not a one-shot migration) keeps the tables bounded ongoing, and the first run
-- clears the accumulated backlog.
--
-- All four deletes are index-driven (no seq scans):
--   - growth_pages partition ordering uses idx_growth_pages_url_crawled (Stage 1).
--   - the three TTL deletes use the existing created_at DESC indexes
--     (idx_growth_logs_created / idx_growth_model_usage_created / critique created_at).
--
-- Idempotent + safe: re-running once the tables are within bounds deletes nothing.
-- No foreign keys reference any of these four tables (verified), so the deletes
-- never hit a FK violation.
--
-- Apply:  supabase db push   (or the HTTPS Management API used for prior migrations).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prune_growth_tables(
  pages_per_url INT DEFAULT 50,
  usage_days    INT DEFAULT 90,
  logs_days     INT DEFAULT 30,
  critique_days INT DEFAULT 90
) RETURNS TABLE(deleted_pages INT, deleted_usage INT, deleted_logs INT, deleted_critique INT)
LANGUAGE plpgsql AS $$
DECLARE
  dp INT := 0;
  du INT := 0;
  dl INT := 0;
  dc INT := 0;
BEGIN
  -- Keep the newest `pages_per_url` rows per URL; delete the rest. The PARTITION
  -- BY url ORDER BY crawled_at DESC is served by idx_growth_pages_url_crawled.
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY url ORDER BY crawled_at DESC) AS rn
    FROM growth_pages
  ),
  del AS (
    DELETE FROM growth_pages p USING ranked r
    WHERE p.id = r.id AND r.rn > pages_per_url
    RETURNING p.id
  )
  SELECT count(*) INTO dp FROM del;

  -- TTL: drop rows older than N days. Index-driven by the created_at DESC indexes.
  DELETE FROM growth_model_usage WHERE created_at < now() - make_interval(days => usage_days);
  GET DIAGNOSTICS du = ROW_COUNT;

  DELETE FROM growth_agent_logs WHERE created_at < now() - make_interval(days => logs_days);
  GET DIAGNOSTICS dl = ROW_COUNT;

  DELETE FROM growth_critique_log WHERE created_at < now() - make_interval(days => critique_days);
  GET DIAGNOSTICS dc = ROW_COUNT;

  RETURN QUERY SELECT dp, du, dl, dc;
END;
$$;