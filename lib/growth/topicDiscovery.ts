/**
 * InBharat Growth Agent — Module: High-intent topic discovery (Phase 3).
 *
 * For each InBharat product, run Gemini google_search grounding (via
 * lib/growth/search.ts — reuses GEMINI_API_KEY, no Serper key) against the
 * founder's high-intent query templates, score the resulting topics 0–100 across
 * 12 dimensions, dedupe against the KB + published articles
 * (findDuplicateKnowledge), and store the survivors as growth_knowledge rows
 * (type='topic', status='discovered' — or 'needs_review' for high-risk
 * medical/legal/patent/visa/finance/government topics). The founder
 * approves/rejects in the Knowledge UI; the approved topics are the morning
 * cron's calendar-fallback queue (pickApprovedTopicFallback).
 *
 * HONESTY: Gemini google_search returns a grounded answer + citation chunks,
 * NOT a raw organic result list and NOT search volume. We never fabricate
 * volume — intent is marked "estimated intent", derived from result signals
 * (intent keywords in titles/answer text, result count, source authority,
 * freshness). Source links are cited. Regulated topics get risk_level='high'
 * and status='needs_review' so the founder reviews them before drafting.
 *
 * No pgvector; dedupe is token-Jaccard via findDuplicateKnowledge. Never throws —
 * degrades to empty/[] on any failure (Gemini down, DB absent). Server-only.
 */
import { insertKnowledge, findDuplicateKnowledge, type KnowledgeItem } from "./knowledge.js";
import { groundedSearch } from "./search.js";

export type ProductId =
  | "inbharat" | "sahayaak-seva" | "jak-shield" | "unoone"
  | "uniassist" | "kathakitaab" | "testsprep";

interface ProductTemplate {
  product: ProductId;
  label: string;
  queries: string[];
}

/** Founder-authored high-intent query templates per product. Transactional /
 *  comparison / "best AI tool for" intents surface buyer-stage demand. */
const PRODUCT_TEMPLATES: ProductTemplate[] = [
  { product: "inbharat", label: "InBharat AI studio", queries: [
    "best AI tool for Indian startups", "agentic AI workflow for business", "MCP security for agents",
    "AI governance for agents", "browser automation agent 2026", "AI for Indian startups build",
  ]},
  { product: "sahayaak-seva", label: "Sahayaak Seva healthcare", queries: [
    "AI for rural healthcare India", "healthcare documentation AI", "offline AI for clinics",
    "AI medical scribe India", "AI for community health workers",
  ]},
  { product: "jak-shield", label: "JAK Shield risk detection", queries: [
    "deepfake detection for business", "AI risk detection tool", "tender scam detection AI",
    "AI content safety classifier", "PII detection AI",
  ]},
  { product: "unoone", label: "UnoOne expert mode", queries: [
    "AI expert mode assistant", "voice AI accessibility tool", "AI skills platform",
    "multilingual AI assistant offline",
  ]},
  { product: "uniassist", label: "UniAssist study abroad", queries: [
    "study abroad AI assistant", "AI for university applications", "visa application AI assistant",
    "AI counselor for international students",
  ]},
  { product: "kathakitaab", label: "KathaKitaab storybooks", queries: [
    "AI interactive storybooks for kids", "multilingual AI storybook", "AI reader app children",
    "learn AI storytelling",
  ]},
  { product: "testsprep", label: "TestsPrep exams", queries: [
    "AI test prep tool", "AI for exam practice", "AI mock test platform India",
    "adaptive learning AI",
  ]},
];

export const DISCOVERY_PRODUCTS = PRODUCT_TEMPLATES.map((p) => p.product);

/** The 12 scoring dimensions (each 0–100; priority is the weighted sum). */
export const SCORE_DIMENSIONS = [
  "intent_strength", "inbharat_relevance", "product_fit", "founder_authority_fit",
  "seo_opportunity", "geo_opportunity", "lead_potential", "follower_potential",
  "freshness", "competition_difficulty", "source_availability", "risk_level",
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export interface TopicScore {
  dimension: ScoreDimension;
  score: number;
  rationale: string;
}

export interface DiscoveredTopic {
  query: string;
  title: string;
  targetAudience: string;
  searchIntent: string;
  whyNow: string;
  inbharatAngle: string;
  productAngle: string;
  suggestedArticleTitle: string;
  suggestedKeywords: string[];
  sourceLinks: string[];
  scores: TopicScore[];
  priority: number;
  riskLevel: "low" | "medium" | "high";
  recommendedAction: "draft_new" | "update_existing" | "skip";
  estimatedIntent: string; // honest label — NOT confirmed search volume
  duplicate: boolean;
}

interface OrganicHit { title?: string; link?: string; snippet?: string; }

/** Fetch search results for one query via Gemini google_search grounding. Never
 *  throws; returns [] on any failure (key missing, HTTP error, timeout, network,
 *  no grounding chunks). Capped at 8. Maps groundedSearch's {title,url,snippet}
 *  rows to the {title,link,snippet} shape scoreTopic/composeTopic read. No
 *  per-result date — Gemini grounding doesn't expose one (scoreTopic reads year
 *  mentions from query+title+snippet text, not a date field, so this is fine). */
async function searchHits(query: string): Promise<OrganicHit[]> {
  const res = await groundedSearch(query);
  if (!res) return [];
  return res.results.slice(0, 8).map((r) => ({ title: r.title, link: r.url, snippet: r.snippet }));
}

/** Lowercase word tokens (length ≥ 2). Pure. */
function tokenize(s: string): string[] {
  const m = (s ?? "").toLowerCase().match(/[a-z0-9]+/g);
  return (m ? Array.from(m) : []).filter((t) => t.length >= 2);
}

const INTENT_KEYWORDS = [
  "best", "vs", "compare", "alternative", "top", "review", "pricing", "cost",
  "how to", "guide", "tutorial", "buy", "hire", "for business", "for startups",
  "build", "implement", "setup", "deploy",
];
const RISK_KEYWORDS = [
  "medical", "clinical", "diagnosis", "treatment", "legal", "lawyer", "attorney",
  "patent", "ip", "visa", "immigration", "finance", "investment", "tax", "insurance",
  "government", "compliance", "regulation", "fda", "drug",
];

/** Score one topic across the 12 dimensions. Pure + deterministic (no network).
 *  Derives signals from the organic results + query text — never fabricates. */
export function scoreTopic(
  query: string,
  organic: OrganicHit[],
  product: ProductId,
): { scores: TopicScore[]; priority: number; riskLevel: "low" | "medium" | "high" } {
  const qTokens = tokenize(query);
  const titles = organic.map((o) => `${o.title ?? ""} ${o.snippet ?? ""}`);
  const allText = (query + " " + titles.join(" ")).toLowerCase();
  const resultCount = organic.length;

  // 1) intent_strength — transactional/comparison keywords in query + result titles.
  const intentHits = INTENT_KEYWORDS.filter((k) => allText.includes(k)).length;
  const intent_strength = clamp(Math.round((intentHits / 8) * 100 + 20));

  // 2) inbharat_relevance — query tokens overlap with "ai"/"agent"/"indian"/"bharat".
  const bharatHits = ["ai", "agent", "indian", "bharat", "ml", "llm"].filter((t) => qTokens.includes(t)).length;
  const inbharat_relevance = clamp(Math.round((bharatHits / 4) * 100 + 30));

  // 3) product_fit — does the query match the product's domain keywords.
  const productFit = productKeywordOverlap(product, qTokens);
  const product_fit = clamp(productFit);

  // 4) founder_authority_fit — Reeturaj builds AI products; technical topics fit.
  const authorityHits = ["ai", "agent", "build", "deploy", "architecture", "engineering"].filter((t) => qTokens.includes(t)).length;
  const founder_authority_fit = clamp(Math.round((authorityHits / 5) * 100 + 25));

  // 5) seo_opportunity — fewer results = less competition = more opportunity.
  const seo_opportunity = clamp(Math.round(100 - Math.min(resultCount * 10, 80) + 10));

  // 6) geo_opportunity — generative-engine optimization: technical/how-to queries
  // surface well in AI overviews; informational intent reduces it slightly.
  const geo_opportunity = clamp(Math.round(intent_strength * 0.6 + (allText.includes("how to") ? 20 : 0) + 10));

  // 7) lead_potential — B2B "for business"/"for startups" signals = buyer demand.
  // Substring match on allText (query + titles + snippets, lowercased) so a
  // signal word anywhere in the result set counts; matches the intentHits pattern.
  const leadHits = ["business", "startups", "enterprise", "company", "team"].filter((t) => allText.includes(t)).length;
  const lead_potential = clamp(Math.round((leadHits / 4) * 100 + 25));

  // 8) follower_potential — broad-audience topics (learning/build) grow audience.
  const follower_potential = clamp(Math.round((intentHits / 6) * 60 + 30));

  // 9) freshness — 2026/current-year mentions + result dates.
  const yearHits = (allText.match(/202[4-9]/g) ?? []).length;
  const freshness = clamp(Math.round(Math.min(yearHits * 25, 60) + 30));

  // 10) competition_difficulty — more results + big-name domains = harder.
  const bigDomains = organic.filter((o) => /wikipedia\.org|github\.com|techcrunch\.com|forbes\.com|medium\.com/i.test(o.link ?? "")).length;
  const competition_difficulty = clamp(Math.round(Math.min(resultCount * 8 + bigDomains * 12, 95) + 5));

  // 11) source_availability — enough results to cite (≥4 = strong).
  const source_availability = clamp(Math.round(Math.min(resultCount * 14, 90) + 10));

  // 12) risk_level — regulated-topic keywords flip high risk (low score).
  const riskHits = RISK_KEYWORDS.filter((k) => allText.includes(k)).length;
  const risk_score = clamp(100 - Math.min(riskHits * 30, 90)); // high risk → low score
  const riskLevel: "low" | "medium" | "high" = riskHits >= 3 ? "high" : riskHits >= 1 ? "medium" : "low";

  const scores: TopicScore[] = [
    { dimension: "intent_strength", score: intent_strength, rationale: `${intentHits} intent keyword(s) detected` },
    { dimension: "inbharat_relevance", score: inbharat_relevance, rationale: `${bharatHits} core-term match(es)` },
    { dimension: "product_fit", score: product_fit, rationale: `product ${product} keyword overlap` },
    { dimension: "founder_authority_fit", score: founder_authority_fit, rationale: `${authorityHits} authority-term match(es)` },
    { dimension: "seo_opportunity", score: seo_opportunity, rationale: `${resultCount} organic results` },
    { dimension: "geo_opportunity", score: geo_opportunity, rationale: "how-to + intent signal" },
    { dimension: "lead_potential", score: lead_potential, rationale: `${leadHits} B2B signal(s)` },
    { dimension: "follower_potential", score: follower_potential, rationale: "broad-audience build signal" },
    { dimension: "freshness", score: freshness, rationale: `${yearHits} year mention(s)` },
    { dimension: "competition_difficulty", score: competition_difficulty, rationale: `${bigDomains} big-domain result(s)` },
    { dimension: "source_availability", score: source_availability, rationale: `${resultCount} citable result(s)` },
    { dimension: "risk_level", score: risk_score, rationale: `${riskHits} regulated-keyword hit(s)` },
  ];

  // Weighted priority — product_fit + intent + lead weigh most; risk pulls down.
  const weights: Record<ScoreDimension, number> = {
    intent_strength: 0.15, inbharat_relevance: 0.1, product_fit: 0.18, founder_authority_fit: 0.08,
    seo_opportunity: 0.08, geo_opportunity: 0.07, lead_potential: 0.12, follower_potential: 0.05,
    freshness: 0.07, competition_difficulty: 0.03, source_availability: 0.04, risk_level: 0.03,
  };
  let priority = 0;
  for (const s of scores) priority += (s.score / 100) * (weights[s.dimension] ?? 0);
  priority = clamp(Math.round(priority * 100));
  return { scores, priority, riskLevel };
}

function productKeywordOverlap(product: ProductId, qTokens: string[]): number {
  const map: Record<ProductId, string[]> = {
    inbharat: ["ai", "agent", "startup", "indian", "bharat", "build", "platform"],
    "sahayaak-seva": ["healthcare", "health", "clinic", "medical", "rural", "sahayaak", "seva"],
    "jak-shield": ["risk", "deepfake", "scam", "safety", "shield", "pii", "detection"],
    unoone: ["expert", "voice", "accessibility", "skills", "unoone"],
    uniassist: ["study", "abroad", "university", "visa", "student", "uniassist"],
    kathakitaab: ["storybook", "storybooks", "kids", "children", "reader", "kathakitaab"],
    testsprep: ["test", "exam", "prep", "mock", "adaptive", "testsprep"],
  };
  const ks = map[product] ?? [];
  const hits = ks.filter((k) => qTokens.includes(k)).length;
  return Math.round((hits / Math.max(ks.length, 1)) * 100);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Compose the topic output from a query + its organic results. Pure (no DB). */
export function composeTopic(
  query: string,
  organic: OrganicHit[],
  product: ProductId,
  duplicate: { duplicate: boolean; existing?: KnowledgeItem; reason?: string },
): DiscoveredTopic {
  const { scores, priority, riskLevel } = scoreTopic(query, organic, product);
  const topTitle = organic.find((o) => o.title)?.title?.trim() || query;
  const suggestedArticleTitle = titleCase(query);
  const sourceLinks = organic.map((o) => o.link).filter((x): x is string => typeof x === "string" && !!x).slice(0, 5);
  const recommendedAction: DiscoveredTopic["recommendedAction"] = duplicate.duplicate
    ? (duplicate.existing && duplicate.existing.status === "published" ? "update_existing" : "skip")
    : "draft_new";
  return {
    query,
    title: topTitle,
    targetAudience: audienceFor(product),
    searchIntent: intentLabel(query),
    whyNow: `${new Date().getFullYear()} buyer-stage demand (estimated intent, not confirmed volume)`,
    inbharatAngle: `InBharat perspective: practical, hype-free, Indian-engineering context on "${query}".`,
    productAngle: `${productLabel(product)} angle: tie the topic to a real product capability.`,
    suggestedArticleTitle,
    suggestedKeywords: tokenize(query).slice(0, 8),
    sourceLinks,
    scores,
    priority,
    riskLevel,
    recommendedAction,
    estimatedIntent: "estimated intent (derived from result signals — NOT confirmed search volume)",
    duplicate: duplicate.duplicate,
  };
}

function titleCase(q: string): string {
  return q.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}
function audienceFor(p: ProductId): string {
  const m: Record<ProductId, string> = {
    inbharat: "Indian AI founders + builders", "sahayaak-seva": "healthcare operators in India",
    "jak-shield": "security + risk teams", unoone: "power users needing expert mode",
    uniassist: "students applying abroad", kathakitaab: "parents + educators", testsprep: "exam aspirants",
  };
  return m[p] ?? "AI builders";
}
function intentLabel(q: string): string {
  if (/best|top|vs|compare|alternative/.test(q)) return "comparison/evaluation";
  if (/how to|guide|tutorial|build|setup/.test(q)) return "informational/how-to";
  if (/pricing|cost|buy|hire/.test(q)) return "transactional";
  return "informational";
}
function productLabel(p: ProductId): string {
  const t = PRODUCT_TEMPLATES.find((x) => x.product === p);
  return t?.label ?? p;
}

export interface DiscoverResult {
  product: ProductId;
  discovered: number;
  duplicates: number;
  saved: number;
  topics: DiscoveredTopic[];
  notConfigured: boolean;
}

/**
 * Run discovery for one product. Runs each query template through Gemini
 * google_search grounding, composes a topic per query, dedupes via
 * findDuplicateKnowledge (skip / update_existing / draft_new), and inserts
 * survivors as growth_knowledge topic rows. Never throws. Returns
 * notConfigured:true when GEMINI_API_KEY is unset (honest degradation).
 */
export async function discoverTopics(product: ProductId, count = 6): Promise<DiscoverResult> {
  const template = PRODUCT_TEMPLATES.find((p) => p.product === product);
  if (!template) return { product, discovered: 0, duplicates: 0, saved: 0, topics: [], notConfigured: true };
  if (!process.env.GEMINI_API_KEY) {
    return { product, discovered: 0, duplicates: 0, saved: 0, topics: [], notConfigured: true };
  }
  const topics: DiscoveredTopic[] = [];
  let duplicates = 0;
  let saved = 0;
  for (const query of template.queries.slice(0, Math.max(1, Math.min(count, template.queries.length)))) {
    const organic = await searchHits(query);
    if (organic.length === 0) continue;
    const dup = await findDuplicateKnowledge(query, product);
    const topic = composeTopic(query, organic, product, dup);
    topics.push(topic);
    if (dup.duplicate) { duplicates++; continue; }
    // Insert as a KB topic row. High-risk regulated topics → needs_review so the
    // founder reviews before any draft (never auto-drafts regulated content).
    const status = topic.riskLevel === "high" ? "needs_review" : "discovered";
    const item = await insertKnowledge({
      type: "topic",
      title: topic.suggestedArticleTitle,
      summary: `${topic.searchIntent} · ${topic.whyNow} · priority ${topic.priority}`,
      body: topic.inbharatAngle + "\n" + topic.productAngle + "\n\nSources:\n" + topic.sourceLinks.map((l) => `- ${l}`).join("\n"),
      sourceType: "web",
      relatedProduct: product,
      topicCluster: topic.query.slice(0, 80),
      keywords: topic.suggestedKeywords,
      intentScore: topic.priority,
      freshnessScore: topic.scores.find((s) => s.dimension === "freshness")?.score ?? null,
      authorityScore: topic.scores.find((s) => s.dimension === "founder_authority_fit")?.score ?? null,
      riskLevel: topic.riskLevel,
      status,
    });
    if (item) saved++;
  }
  return { product, discovered: topics.length, duplicates, saved, topics, notConfigured: false };
}

/** Run discovery across ALL products (the weekly cron). Best-effort per product.
 *  Products run CONCURRENTLY (Promise.all) so 7 products × 4 queries of Gemini
 *  google_search can't blow the 300s cron maxDuration — sequential worst case
 *  was 28 × 20s timeout = 560s. Each product's failure is isolated (catch →
 *  notConfigured result) so one bad product doesn't sink the run. */
export async function discoverAllProducts(): Promise<DiscoverResult[]> {
  const results = await Promise.all(
    DISCOVERY_PRODUCTS.map(async (product) => {
      try { return await discoverTopics(product, 4); }
      catch { return { product, discovered: 0, duplicates: 0, saved: 0, topics: [], notConfigured: true } as DiscoverResult; }
    }),
  );
  return results;
}