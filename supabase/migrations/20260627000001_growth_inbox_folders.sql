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