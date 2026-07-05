/**
 * InBharat Growth Agent — Module: CMO Strategy layer (Phase D).
 *
 * The founder's positioning / ICP / audience / voice / competitive-diff plus a
 * structured system layer (growth pillars, per-product visibility plan, 90-day
 * cadence, KPIs) lives in a singleton `growth_strategy` row (id=1), written by
 * the founder OR drafted by the 'strategy' model task from recent measured
 * outcomes. The block is injected into the promoter / inbox / critique / agent
 * system prompts so every draft is on-brand — this is what makes the agent an
 * expert CMO, not a generic copy drafter.
 *
 * A coded DEFAULT_STRATEGY (world-class, InBharat-portfolio-specific) is returned
 * when the DB / row is absent, so the page is never blank even before the seed
 * migration runs — and the agent is an expert CMO out of the box.
 *
 * Mirrors the rules.ts loader/formatter/cache pattern. Cached with
 * bustStrategyCache() after an admin edit (next load re-reads the DB). Never
 * throws. Server-only. Gemini-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini } from "./gemini.js";

export interface Strategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
  /** Structured system layer (Phase C expansion). Each is null-safe — omitted from
   *  the prompt when empty so existing prompt injection stays backward-compatible. */
  pillars: string | null;
  productPlan: string | null;
  cadence: string | null;
  kpis: string | null;
}

interface StrategyRow {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitive_diff: string | null;
  goals: string | null;
  pillars: string | null;
  product_plan: string | null;
  cadence: string | null;
  kpis: string | null;
}

/**
 * World-class, InBharat-portfolio-specific default strategy. Returned by
 * loadStrategy() when the DB or the singleton row is absent (pre-migration or
 * not-yet-seeded), so the page is never blank and the agent's prompt is never
 * strategy-less. The seed migration upserts this exact content into id=1.
 */
export const DEFAULT_STRATEGY: Strategy = {
  positioning:
    "InBharat is the Bharat-built AI product studio — a DPIIT-recognized (Uni Guru Technologies LLP) outfit building vertical AI tools for India. We don't ship horizontal SaaS; we ship deep, domain-specific AI agents and apps (study, healthcare, exams, storybooks, scam-detection, growth) that respect cost, language, and compliance. 'Build with Reeturaj' is the founder-voice content engine that proves the work.",
  icp:
    "Indian SMB founders and product teams (1–50 people) building or operating with AI, especially in regulated or Bharat-specific markets: healthcare operators, education / exam-prep startups, fintech, regional-language product teams. Secondary: operator-founders who want AI that doesn't bleed their data or budget.",
  audience:
    "Technical founders and product/engineering leaders in India who read to decide, not to be entertained. They want concrete trade-offs, real numbers, and reproducible work — not hype. They're building AI features themselves and want to learn from someone shipping in the same constraints.",
  voice:
    "Practical, founder-led, hype-free, evidence-first. Short sentences. Concrete numbers over adjectives. 'Here's what I built, here's what broke, here's the fix.' No 'revolutionize' / 'unlock' / 'supercharge'. Hindi–English code-switching is fine where it lands the point. Never claims we're better than we can prove.",
  competitiveDiff:
    "Bharat-built vs foreign generic AI (we live the compliance, cost, and language constraints); vertical depth over horizontal breadth (each product owns a domain — Sahayaak Seva for healthcare, KathaKitaab for storybooks, TestsPrep for exams, JAK Shield for scam-detection, Phoring, UniAssist); human-gated safety as a feature, not a limitation (nothing auto-publishes; every output is reviewed).",
  goals:
    "Make every InBharat portfolio tool discoverable via accurate, on-brand content + canonical-based syndication, mostly hands-free. Near-term: ship one Build-with-Reeturaj article/day, cross-post each to Medium/Hashnode/DEV with the www.inbharat.ai canonical, publish a founder-voice LinkedIn post per article, and grow GSC indexed URLs + organic clicks quarter-over-quarter. The agent drafts and the founder approves — nothing auto-publishes.",
  pillars:
    "1. SEO foundation — canonical www.inbharat.ai, clean sitemap, truthful lastmod, no query/lang junk, honest robots. Every page a unique canonical.\n2. Content engine — 'Build with Reeturaj' daily calendar; one reproducible article/day; covers generated on-brand; citations real.\n3. Canonical-based syndication — every published article cross-posted to Medium, Hashnode, DEV.to with canonical_url set to www.inbharat.ai so Google attributes the original to InBharat.\n4. LinkedIn founder-voice — one human-gated post per article in Reeturaj's voice; the agent drafts, the founder reviews + posts.\n5. Cover-driven CTR — every article gets a strong on-brand cover; the cover is also the LinkedIn og:image, so one redesign lifts both.",
  productPlan:
    "InBharat.ai — studio site + 'Build with Reeturaj' content hub. Channel: SEO + LinkedIn + syndication. ICP: Indian SMB founders exploring AI.\nJAK Swarm — closed-loop company OS. Channel: founder-voice LinkedIn + agentic-safety deep-dives. ICP: operator-founders running small teams.\nKathaKitaab — interactive storybooks. Channel: parent/educator communities + visual covers. ICP: parents of 3–10yr-olds, regional-language first.\nTestsPrep — exam prep. Channel: student SEO + exam-season campaigns. ICP: Indian exam aspirants.\nSahayaak Seva — healthcare field assistance. Channel: healthcare-operator LinkedIn + compliance-first content (planned; crawl off until live). ICP: healthcare ops teams.\nPhoring (phoring.in) — Channel: product SEO + founder walkthroughs. ICP: per product positioning.\nUniAssist (uniassist.ai) — Channel: product SEO + student/founder channels. ICP: per product positioning.",
  cadence:
    "Weekly theme rotation across the portfolio. Mon: SEO/audit deep-dive. Tue: syndication + cross-post the week's article. Wed: LinkedIn founder-voice post. Thu: cover redesign pass. Fri: outcomes review (what moved SEO/GEO). The morning cron ('Build with Reeturaj', 8am IST) drafts the day's article; the founder approves/publishes. 90-day plan: Q1 = SEO foundation + daily article cadence; Q2 = full syndication coverage + LinkedIn rhythm; Q3 = outcomes-led optimization (double down on what moves GSC clicks).",
  kpis:
    "Articles shipped per week (target: 5–7). Syndicated-platform coverage % (target: every published article on Medium+Hashnode+DEV = 100%). LinkedIn posts per week (target: 3–5). GSC indexed URLs (target: +10%/quarter). Organic clicks (target: +15%/quarter). Cover CTR on LinkedIn (target: beat prior-month baseline — measurement pending, not yet in growth_outcomes). SEO/GEO deltas + issues-resolved ARE measured in growth_outcomes; the agent surfaces them in the morning plan.",
};

let strategyCache: Strategy | null = null;

/** Invalidate the strategy cache after an admin edit (next load re-reads the DB). */
export function bustStrategyCache(): void {
  strategyCache = null;
}

/** Load the founder's strategy singleton. Returns the cached value on repeat
 *  calls in the same process; callers bust the cache after an edit. Never throws.
 *  Returns DEFAULT_STRATEGY (world-class InBharat CMO content) when the DB / table
 *  / row is absent, so the page is never blank and the agent's prompt is never
 *  strategy-less — even before the seed migration runs. */
export async function loadStrategy(): Promise<Strategy> {
  if (strategyCache) return strategyCache;
  if (!supabaseAdmin) {
    strategyCache = { ...DEFAULT_STRATEGY };
    return strategyCache;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_strategy")
      .select("positioning,icp,audience,voice,competitive_diff,goals,pillars,product_plan,cadence,kpis")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      strategyCache = { ...DEFAULT_STRATEGY };
      return strategyCache;
    }
    const r = data as StrategyRow;
    // Adopt the DB row. Null fields stay null (the founder may have cleared one);
    // we do NOT backfill a single field from DEFAULT_STRATEGY, because mixing the
    // founder's intent with a default mid-row is confusing. The seed migration is
    // the path that fills a fresh row with DEFAULT_STRATEGY wholesale.
    strategyCache = {
      positioning: r.positioning ?? null,
      icp: r.icp ?? null,
      audience: r.audience ?? null,
      voice: r.voice ?? null,
      competitiveDiff: r.competitive_diff ?? null,
      goals: r.goals ?? null,
      pillars: r.pillars ?? null,
      productPlan: r.product_plan ?? null,
      cadence: r.cadence ?? null,
      kpis: r.kpis ?? null,
    };
    return strategyCache;
  } catch {
    strategyCache = { ...DEFAULT_STRATEGY };
    return strategyCache;
  }
}

const LABELS: { key: keyof Strategy; label: string }[] = [
  { key: "positioning", label: "POSITIONING" },
  { key: "icp", label: "ICP (ideal customer profile)" },
  { key: "audience", label: "AUDIENCE (content readers)" },
  { key: "voice", label: "VOICE / TONE" },
  { key: "competitiveDiff", label: "COMPETITIVE DIFFERENCE" },
  { key: "goals", label: "GTM GOALS" },
  { key: "pillars", label: "GROWTH PILLARS" },
  { key: "productPlan", label: "PER-PRODUCT VISIBILITY PLAN" },
  { key: "cadence", label: "90-DAY CADENCE + WEEKLY THEME" },
  { key: "kpis", label: "KPIs + TARGETS" },
];

/**
 * Format the strategy into a system-prompt block. Returns "" when every field is
 * empty, so the prompt is unchanged when the founder hasn't set a strategy yet
 * (mirrors formatRulesBlock). The structured system fields (pillars/productPlan/
 * cadence/kpis) are woven in alongside the base fields so the agent actually
 * obeys the whole strategy, not just the positioning line.
 */
export function formatStrategyBlock(strategy: Strategy): string {
  const sections = LABELS.map(({ key, label }) => {
    const v = strategy[key];
    return typeof v === "string" && v.trim() ? `${label}:\n${v.trim()}` : null;
  }).filter(Boolean);
  if (sections.length === 0) return "";
  return `STRATEGY (founder-authored positioning — obey; keep every draft on-brand and on-audience):\n${sections.join("\n\n")}`;
}

export interface DraftedStrategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
  note?: string;
}

/**
 * Draft a strategy from recent measured outcomes + critique learnings (the
 * "Generate draft from recent learnings" action). The 'strategy' task (Gemini
 * gemini-2.5-flash) synthesizes the six BASE fields from the evidence. The four
 * structured system fields (pillars/productPlan/cadence/kpis) are pre-seeded and
 * not re-drafted by the model — the founder edits those by hand. The founder
 * reviews + edits the result before saving — nothing is auto-applied. Never
 * throws; returns {note} on any failure. `evidence` is a pre-built compact
 * string of recent deltas.
 */
export async function draftStrategyFromEvidence(evidence: string): Promise<DraftedStrategy> {
  const task: GrowthTask = "strategy";
  const choice = pickModel(task);
  const empty = (note: string): DraftedStrategy => ({
    positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null, note,
  });
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return empty("strategy model not configured or monthly budget exhausted");
  }

  const system =
    "You are a B2B GTM strategist drafting a content strategy for InBharat AI, an Indian AI product studio. " +
    "Synthesize positioning, ICP, audience, voice, competitive difference, and near-term goals from the evidence. " +
    "Be concrete, hype-free, and specific to InBharat (Indian AI infra + agent products). " +
    "Respond ONLY with compact JSON: " +
    "{\"positioning\": string, \"icp\": string, \"audience\": string, \"voice\": string, \"competitiveDiff\": string, \"goals\": string}.";
  const user =
    `EVIDENCE (recent measured content outcomes + critique learnings):\n${evidence.slice(0, 4000)}\n\n` +
    `Draft the six strategy fields. Each is a short paragraph (1–3 sentences). JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return empty("redacted secret in strategy prompt; aborted model call");
  }

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.5, maxOutputTokens: 900 });
  } catch (e) {
    void logUsage({
      model: choice.model, task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: 0,
      totalTokens: Math.ceil((system.length + user.length) / 4),
      costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider,
    });
    return empty(`strategy model call failed: ${(e as Error).message}`);
  }

  const parsed = safeParseStrategy(raw);
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  const costUsd = estimateCost(choice, totalTokens);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd,
    status: parsed ? "ok" : "parse_failed",
    contextUrl: null, provider: choice.provider,
  });
  if (!parsed) return empty("strategy model returned no usable JSON; nothing drafted");
  return parsed;
}

function safeParseStrategy(raw: string): DraftedStrategy | null {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const s = (k: string): string | null => {
    const v = obj?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const drafted: DraftedStrategy = {
    positioning: s("positioning"),
    icp: s("icp"),
    audience: s("audience"),
    voice: s("voice"),
    competitiveDiff: s("competitiveDiff"),
    goals: s("goals"),
  };
  // Require at least one non-empty field, else treat as empty.
  if (!Object.values(drafted).some((v) => typeof v === "string" && v.length > 0)) return null;
  return drafted;
}

/**
 * Build the compact evidence string from recent measured outcomes for the
 * strategy-draft model call: which articles moved SEO/GEO, recurring critique
 * weaknesses. Never throws; returns "" when there's no recent evidence.
 */
export async function gatherStrategyEvidence(): Promise<string> {
  if (!supabaseAdmin) return "";
  try {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("growth_outcomes")
      .select("url,kind,baseline_seo,measured_seo,baseline_geo,measured_geo")
      .not("measured_seo", "is", null)
      .gte("measured_at", since)
      .order("measured_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data) || data.length === 0) return "";
    const lines = (data as Array<{ url: string; kind: string; baseline_seo: number | null; measured_seo: number | null; baseline_geo: number | null; measured_geo: number | null }>).map((o) => {
      const dSeo = (o.measured_seo ?? 0) - (o.baseline_seo ?? 0);
      const dGeo = (o.measured_geo ?? 0) - (o.baseline_geo ?? 0);
      return `- ${o.url} (${o.kind}): SEO ${o.baseline_seo ?? "?"}→${o.measured_seo ?? "?"} (${dSeo >= 0 ? "+" : ""}${dSeo}), GEO ${dGeo >= 0 ? "+" : ""}${dGeo}`;
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}