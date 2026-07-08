-- Growth Agent Issues-module perf indexes (2026-07-08).
--
-- The Issues page (and the shared pipeline strip) run several filtered/ordered
-- SELECTs that previously did seq scans + sorts over ever-growing tables on every
-- page load. These composites let Postgres serve the exact order-by/filter the
-- queries use, without changing any query or contract.
--
-- All IF NOT EXISTS → safe to re-run, and safe alongside the existing single-
-- column indexes (idx_growth_drafts_status etc.) which stay for other paths.

-- /api/growth/pages (Issues "Audited pages" tab, no domain filter): the default
-- path orders by crawled_at DESC with no WHERE. The existing (domain, crawled_at)
-- composite can't serve an order-by on its second column alone, so this was a seq
-- scan + sort over all growth_pages on every Issues load.
CREATE INDEX IF NOT EXISTS idx_growth_pages_crawled_at
  ON growth_pages (crawled_at DESC);

-- /api/growth/draft-threads (every Issues mount): filters role='tool' + orders
-- created_at DESC, limit 800. The only existing index is (thread_id, created_at)
-- — no role index → seq scan + sort over the whole messages table every load.
CREATE INDEX IF NOT EXISTS idx_growth_agent_messages_role_created
  ON growth_agent_messages (role, created_at DESC);

-- /api/growth/approvals (Issues Queue): orders by status, created_at DESC. The
-- existing index is (status) only → still needs a sort. This composite serves the
-- exact order the query uses.
CREATE INDEX IF NOT EXISTS idx_growth_drafts_status_created
  ON growth_drafts (status, created_at DESC);

-- /api/growth/pipeline (today's pipeline strip): filters kind IN (article,
-- linkedin, cover) + created_at >= <since>, ordered created_at DESC. No kind/
-- created_at index existed → seq scan + filter + sort on every strip fetch.
CREATE INDEX IF NOT EXISTS idx_growth_drafts_kind_created
  ON growth_drafts (kind, created_at DESC);