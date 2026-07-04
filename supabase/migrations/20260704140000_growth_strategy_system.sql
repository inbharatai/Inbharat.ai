-- InBharat Growth Agent — Phase C expansion: CMO strategy *system* layer.
--
-- Adds four structured fields to growth_strategy so the founder's strategy is a
-- full world-class CMO operating system, not six blank textareas:
--   pillars      — growth pillars (SEO, content, syndication, LinkedIn, covers)
--   product_plan — per-product visibility plan (one entry per portfolio product)
--   cadence      — 90-day campaign cadence + weekly theme rotation
--   kpis         — KPIs + targets the agent is trying to move
--
-- All nullable text — omitted from prompts when empty (backward-compatible with
-- the base six fields). Idempotent: safe to re-run. The seed upserts the full
-- world-class InBharat-portfolio content into id=1 ON CONFLICT only when the row
-- is empty (DO UPDATE SET ... = COALESCE(... , <default>) so a founder-authored
-- field is never clobbered once set). RLS already denies client access.

ALTER TABLE growth_strategy
  ADD COLUMN IF NOT EXISTS pillars      text,
  ADD COLUMN IF NOT EXISTS product_plan text,
  ADD COLUMN IF NOT EXISTS cadence       text,
  ADD COLUMN IF NOT EXISTS kpis         text;

-- Idempotent seed of the full world-class strategy. Uses COALESCE so a field the
-- founder has already filled is preserved; a NULL field is filled with the
-- default. Re-running keeps founder edits intact and only fills gaps.
INSERT INTO growth_strategy (id, positioning, icp, audience, voice, competitive_diff, goals, pillars, product_plan, cadence, kpis, updated_by)
VALUES (
  1,
  'InBharat is the Bharat-built AI product studio — a DPIIT-recognized (Uni Guru Technologies LLP) outfit building vertical AI tools for India. We don''t ship horizontal SaaS; we ship deep, domain-specific AI agents and apps (study, healthcare, exams, storybooks, scam-detection, growth) that respect cost, language, and compliance. ''Build with Reeturaj'' is the founder-voice content engine that proves the work.',
  'Indian SMB founders and product teams (1–50 people) building or operating with AI, especially in regulated or Bharat-specific markets: healthcare operators, education / exam-prep startups, fintech, regional-language product teams. Secondary: operator-founders who want AI that doesn''t bleed their data or budget.',
  'Technical founders and product/engineering leaders in India who read to decide, not to be entertained. They want concrete trade-offs, real numbers, and reproducible work — not hype. They''re building AI features themselves and want to learn from someone shipping in the same constraints.',
  'Practical, founder-led, hype-free, evidence-first. Short sentences. Concrete numbers over adjectives. ''Here''s what I built, here''s what broke, here''s the fix.'' No ''revolutionize'' / ''unlock'' / ''supercharge''. Hindi–English code-switching is fine where it lands the point. Never claims we''re better than we can prove.',
  'Bharat-built vs foreign generic AI (we live the compliance, cost, and language constraints); vertical depth over horizontal breadth (each product owns a domain — Sahayaak Seva for healthcare, KathaKitaab for storybooks, TestsPrep for exams, JAK Shield for scam-detection, Phoring, UniAssist); human-gated safety as a feature, not a limitation (nothing auto-publishes; every output is reviewed).',
  'Make every InBharat portfolio tool discoverable via accurate, on-brand content + canonical-based syndication, mostly hands-free. Near-term: ship one Build-with-Reeturaj article/day, cross-post each to Medium/Hashnode/DEV with the www.inbharat.ai canonical, publish a founder-voice LinkedIn post per article, and grow GSC indexed URLs + organic clicks quarter-over-quarter. The agent drafts and the founder approves — nothing auto-publishes.',
  '1. SEO foundation — canonical www.inbharat.ai, clean sitemap, truthful lastmod, no query/lang junk, honest robots. Every page a unique canonical.
2. Content engine — ''Build with Reeturaj'' daily calendar; one reproducible article/day; covers generated on-brand; citations real.
3. Canonical-based syndication — every published article cross-posted to Medium, Hashnode, DEV.to with canonical_url set to www.inbharat.ai so Google attributes the original to InBharat.
4. LinkedIn founder-voice — one human-gated post per article in Reeturaj''s voice; the agent drafts, the founder reviews + posts.
5. Cover-driven CTR — every article gets a strong on-brand cover; the cover is also the LinkedIn og:image, so one redesign lifts both.',
  'InBharat.ai — studio site + ''Build with Reeturaj'' content hub. Channel: SEO + LinkedIn + syndication. ICP: Indian SMB founders exploring AI.
JAK Swarm — closed-loop company OS. Channel: founder-voice LinkedIn + agentic-safety deep-dives. ICP: operator-founders running small teams.
KathaKitaab — interactive storybooks. Channel: parent/educator communities + visual covers. ICP: parents of 3–10yr-olds, regional-language first.
TestsPrep — exam prep. Channel: student SEO + exam-season campaigns. ICP: Indian exam aspirants.
Sahayaak Seva — healthcare field assistance. Channel: healthcare-operator LinkedIn + compliance-first content (planned; crawl off until live). ICP: healthcare ops teams.
Phoring (phoring.in) — Channel: product SEO + founder walkthroughs. ICP: per product positioning.
UniAssist (uniassist.ai) — Channel: product SEO + student/founder channels. ICP: per product positioning.',
  'Weekly theme rotation across the portfolio. Mon: SEO/audit deep-dive. Tue: syndication + cross-post the week''s article. Wed: LinkedIn founder-voice post. Thu: cover redesign pass. Fri: outcomes review (what moved SEO/GEO). The morning cron (''Build with Reeturaj'', 8am IST) drafts the day''s article; the founder approves/publishes. 90-day plan: Q1 = SEO foundation + daily article cadence; Q2 = full syndication coverage + LinkedIn rhythm; Q3 = outcomes-led optimization (double down on what moves GSC clicks).',
  'Articles shipped per week (target: 5–7). Syndicated-platform coverage % (target: every published article on Medium+Hashnode+DEV = 100%). LinkedIn posts per week (target: 3–5). GSC indexed URLs (target: +10%/quarter). Organic clicks (target: +15%/quarter). Cover CTR on LinkedIn (target: beat prior-month baseline). All measured in growth_outcomes; the agent surfaces deltas in the morning plan.',
  'seed'
)
ON CONFLICT (id) DO UPDATE SET
  positioning    = COALESCE(growth_strategy.positioning,    EXCLUDED.positioning),
  icp            = COALESCE(growth_strategy.icp,            EXCLUDED.icp),
  audience       = COALESCE(growth_strategy.audience,       EXCLUDED.audience),
  voice          = COALESCE(growth_strategy.voice,          EXCLUDED.voice),
  competitive_diff = COALESCE(growth_strategy.competitive_diff, EXCLUDED.competitive_diff),
  goals          = COALESCE(growth_strategy.goals,          EXCLUDED.goals),
  pillars        = COALESCE(growth_strategy.pillars,        EXCLUDED.pillars),
  product_plan   = COALESCE(growth_strategy.product_plan,   EXCLUDED.product_plan),
  cadence        = COALESCE(growth_strategy.cadence,         EXCLUDED.cadence),
  kpis           = COALESCE(growth_strategy.kpis,            EXCLUDED.kpis),
  updated_by     = COALESCE(growth_strategy.updated_by,      EXCLUDED.updated_by);