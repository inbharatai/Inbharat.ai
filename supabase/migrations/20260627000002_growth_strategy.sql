-- InBharat Growth Agent — Phase D: CMO strategy layer.
--
-- A singleton (id=1) holding the founder's positioning / ICP / audience / voice /
-- competitive-diff, written by the founder (or drafted by the 'strategy' model
-- task from recent learnings + outcomes) and injected as a STRATEGY: block into
-- the promoter / inbox / critique / agent system prompts. This is what turns the
-- Growth Agent from a generic copy drafter into an expert CMO that writes on-brand.
--
-- Mirrors the growth_settings singleton pattern (20260625000001). All fields are
-- nullable text so the founder can fill them incrementally; an empty block is
-- omitted from prompts (the draft pass is unchanged when no strategy is set).
--
-- RLS: deny all client access; service_role only (admin endpoints read/write it).

CREATE TABLE IF NOT EXISTS growth_strategy (
  id                 int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  positioning         text,        -- one-line positioning / category claim
  icp                text,        -- ideal customer profile (who we sell to)
  audience           text,        -- audience for content (who we write for)
  voice              text,        -- brand voice / tone rules
  competitive_diff    text,        -- how InBharat is different from alternatives
  goals              text,        -- near-term GTM goals the agent should serve
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row so reads always find a value.
INSERT INTO growth_strategy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at touch on strategy edits.
DROP TRIGGER IF EXISTS trg_growth_strategy_touch ON growth_strategy;
CREATE TRIGGER trg_growth_strategy_touch BEFORE UPDATE ON growth_strategy
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

ALTER TABLE growth_strategy ENABLE ROW LEVEL SECURITY;