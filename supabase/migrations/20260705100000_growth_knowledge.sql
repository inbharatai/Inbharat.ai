-- ═══════════════════════════════════════════════════════════════════
-- InBharat Growth Agent — knowledge base (the inbox-as-knowledge-base layer)
--
-- growth_knowledge: the memory/retrieval/learning layer for the Growth Agent.
-- Stores sources, discovered topics, articles, posts, drafts, decisions, and
-- performance signals as typed rows, retrieved before any draft so the agent
-- builds on what it already knows instead of repeating angles. Cross-source
-- dedupe via content_hash + token-Jaccard (lib/growth/knowledge.ts).
--
-- Retrieval is FTS (tsvector) + token-Jaccard rerank — NO pgvector this round
-- (the founder chose keyword/FTS over embeddings). Honest limitation: paraphrases
-- with zero shared tokens won't match; flagged for a future phase if needed.
--
-- Status values (status text, no enum constraint — easy to extend):
--   discovered | needs_review | approved | drafted | published | skipped
--   | update_existing | outdated | archived
-- Type values (type text):
--   source | topic | article | post | draft | note | competitor_gap | keyword
--   | performance | decision
-- risk_level: low | medium | high (high → extra founder review for medical /
-- legal / patent / visa / finance / government topics — set by topicDiscovery).
--
-- RLS ENABLED with NO client policies (same pattern as growth_* tables):
-- anon/authenticated denied everything; only service_role (api/lib/supabaseAdmin)
-- bypasses RLS. The api/growth/knowledge route + lib/growth/knowledge.ts use
-- supabaseAdmin.
--
-- Apply:  node scripts/apply-migrations.cjs  (pooler, see memory/deploy notes).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS growth_knowledge (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text NOT NULL,                 -- source|topic|article|post|draft|note|competitor_gap|keyword|performance|decision
  title             text NOT NULL,
  summary           text,
  body              text,                           -- full text (article body, source excerpt, decision rationale)
  source_url        text,
  source_type       text,                            -- web|repo|website|linkedin|user_note|search_console|analytics
  related_product   text,                            -- inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep|null
  topic_cluster     text,                            -- grouping key for related topics (e.g. "ai-agents", "seo")
  keywords          text[] DEFAULT '{}',             -- keyword tags for retrieval + dedupe
  intent_score      int,                             -- 0-100 (topics)
  freshness_score   int,                             -- 0-100 (topics)
  authority_score   int,                             -- 0-100 (sources)
  risk_level        text DEFAULT 'low',              -- low|medium|high
  status            text DEFAULT 'discovered',       -- see header
  linked_article_id text,                            -- slug when linked to a published article
  linked_post_id    text,                            -- growth_syndication id / linkedin post id when linked to a post
  content_hash      text,                            -- sha256 of normalized title+body for dedupe
  use_count         int NOT NULL DEFAULT 0,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Full-text search vector over title + summary + body + keywords. Maintained
  -- by a trigger (NOT a GENERATED column — to_tsvector isn't treated as immutable
  -- on this Postgres, so GENERATED ALWAYS AS (...) STORED is rejected). Reranked
  -- by token-Jaccard in lib/growth/knowledge.ts.
  search_tsv        tsvector
);

ALTER TABLE growth_knowledge ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated get nothing; service_role bypasses RLS.

-- Maintain search_tsv on insert/update (replaces the rejected GENERATED column).
-- to_tsvector with an explicit regconfig is immutable-safe inside a trigger.
CREATE OR REPLACE FUNCTION public.growth_knowledge_search_tsv()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    to_tsvector('english'::regconfig,
      coalesce(NEW.title, '') || ' ' || coalesce(NEW.summary, '') || ' '
      || coalesce(NEW.body, '') || ' ' || coalesce(array_to_string(NEW.keywords, ' '), ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS growth_knowledge_search_tsv_insert ON public.growth_knowledge;
DROP TRIGGER IF EXISTS growth_knowledge_search_tsv_update ON public.growth_knowledge;
CREATE TRIGGER growth_knowledge_search_tsv_insert
  BEFORE INSERT ON public.growth_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.growth_knowledge_search_tsv();
CREATE TRIGGER growth_knowledge_search_tsv_update
  BEFORE UPDATE OF title, summary, body, keywords ON public.growth_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.growth_knowledge_search_tsv();

-- Fast full-text search.
CREATE INDEX IF NOT EXISTS growth_knowledge_search_tsv_idx
  ON growth_knowledge USING GIN (search_tsv);

-- The primary browse key: per-product topic queues ordered by intent.
CREATE INDEX IF NOT EXISTS growth_knowledge_product_status_intent_idx
  ON growth_knowledge (related_product, status, intent_score DESC NULLS LAST);

-- Duplicate detection: same product + type + content_hash is the cheap dedupe path.
CREATE INDEX IF NOT EXISTS growth_knowledge_product_type_hash_idx
  ON growth_knowledge (related_product, type, content_hash);

-- Recency browse.
CREATE INDEX IF NOT EXISTS growth_knowledge_created_idx
  ON growth_knowledge (created_at DESC);

-- content_hash is the per-source dedupe key (one row per unique content).
CREATE UNIQUE INDEX IF NOT EXISTS growth_knowledge_content_hash_uniq
  ON growth_knowledge (content_hash) WHERE content_hash IS NOT NULL;

-- Keep updated_at in sync automatically (same pattern as the other growth_* tables).
CREATE OR REPLACE FUNCTION public.growth_knowledge_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS growth_knowledge_touch_updated_at ON public.growth_knowledge;
CREATE TRIGGER growth_knowledge_touch_updated_at
  BEFORE UPDATE ON public.growth_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.growth_knowledge_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Repurpose growth_keywords (created earlier but unused) for raw keyword tracking.
-- Additive only — existing rows (if any) are untouched.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE growth_keywords
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS product text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS score int,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;