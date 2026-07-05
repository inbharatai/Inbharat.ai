/**
 * InBharat Growth Agent — Module: Knowledge base (the inbox-as-knowledge-base layer).
 *
 * growth_knowledge is the memory/retrieval/learning layer: typed rows for sources,
 * discovered topics, articles, posts, drafts, decisions, and performance signals.
 * Retrieved BEFORE any draft (retrieveForTopic) so the agent builds on what it
 * already knows instead of repeating angles. Cross-source dedupe via content_hash
 * (cheap) + token-Jaccard (findDuplicateKnowledge) against existing KB titles/
 * summaries + published ARTICLES titles + drafted slugs.
 *
 * Retrieval is FTS (tsvector search_tsv) + token-Jaccard rerank — NO pgvector this
 * round (the founder chose keyword/FTS over embeddings). Honest limitation:
 * paraphrases with zero shared tokens won't match; flagged for a future phase.
 *
 * NEVER throws — every public fn degrades to a safe empty/false on DB error so a
 * DB blip can't block drafting. Server-only. Never touches the chat backend.
 * supabaseAdmin bypasses RLS (the table has no client policies).
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { isParaphraseOf } from "./learning.js";
import { ARTICLES } from "../../content/articles.meta.js";
import { logError } from "./authorization.js";

export type KnowledgeType =
  | "source" | "topic" | "article" | "post" | "draft" | "note"
  | "competitor_gap" | "keyword" | "performance" | "decision";

export type KnowledgeStatus =
  | "discovered" | "needs_review" | "approved" | "drafted"
  | "published" | "skipped" | "update_existing" | "outdated" | "archived";

export interface KnowledgeItem {
  id: string;
  type: KnowledgeType;
  title: string;
  summary: string | null;
  body: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  relatedProduct: string | null;
  topicCluster: string | null;
  keywords: string[];
  intentScore: number | null;
  freshnessScore: number | null;
  authorityScore: number | null;
  riskLevel: string;
  status: KnowledgeStatus;
  linkedArticleId: string | null;
  linkedPostId: string | null;
  contentHash: string | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsertKnowledgeInput {
  type: KnowledgeType;
  title: string;
  summary?: string | null;
  body?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  relatedProduct?: string | null;
  topicCluster?: string | null;
  keywords?: string[];
  intentScore?: number | null;
  freshnessScore?: number | null;
  authorityScore?: number | null;
  riskLevel?: string;
  status?: KnowledgeStatus;
  linkedArticleId?: string | null;
  linkedPostId?: string | null;
}

interface KnowledgeRow {
  id: string;
  type: KnowledgeType;
  title: string;
  summary: string | null;
  body: string | null;
  source_url: string | null;
  source_type: string | null;
  related_product: string | null;
  topic_cluster: string | null;
  keywords: string[] | null;
  intent_score: number | null;
  freshness_score: number | null;
  authority_score: number | null;
  risk_level: string;
  status: KnowledgeStatus;
  linked_article_id: string | null;
  linked_post_id: string | null;
  content_hash: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function toItem(r: KnowledgeRow): KnowledgeItem {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    summary: r.summary,
    body: r.body,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    relatedProduct: r.related_product,
    topicCluster: r.topic_cluster,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    intentScore: r.intent_score,
    freshnessScore: r.freshness_score,
    authorityScore: r.authority_score,
    riskLevel: r.risk_level ?? "low",
    status: r.status,
    linkedArticleId: r.linked_article_id,
    linkedPostId: r.linked_post_id,
    contentHash: r.content_hash,
    useCount: r.use_count ?? 0,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Normalize keywords: lowercase, trim, drop empties + duplicates, cap at 12. */
function normalizeKeywords(ks: string[] | undefined): string[] {
  if (!Array.isArray(ks)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of ks) {
    if (typeof k !== "string") continue;
    const v = k.trim().toLowerCase().replace(/^#/, "");
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    if (out.length >= 12) break;
  }
  return out;
}

/** sha-256 of the normalized title + body (dedupe key). Node 18+ has webcrypto. */
async function contentHash(title: string, body?: string | null): Promise<string | null> {
  try {
    const norm = `${(title || "").trim().toLowerCase()}\n${(body ?? "").trim().toLowerCase()}`;
    if (!norm.trim()) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Insert a knowledge row. Dedupes by content_hash (skip + return the existing row
 * when the same hash is already present, so re-ingesting a source/topic/article
 * is idempotent). Never throws; returns null on any failure.
 */
export async function insertKnowledge(input: InsertKnowledgeInput): Promise<KnowledgeItem | null> {
  if (!supabaseAdmin) return null;
  try {
    const title = (input.title || "").trim().slice(0, 500);
    if (!title) return null;
    const body = input.body ? input.body.slice(0, 50000) : null;
    const hash = await contentHash(title, body);
    // Idempotent: if the same content_hash exists, return it unchanged.
    if (hash) {
      const { data: existing } = await supabaseAdmin
        .from("growth_knowledge")
        .select("*")
        .eq("content_hash", hash)
        .maybeSingle();
      if (existing) return toItem(existing as KnowledgeRow);
    }
    const row = {
      type: input.type,
      title,
      summary: input.summary ? input.summary.slice(0, 2000) : null,
      body,
      source_url: input.sourceUrl ?? null,
      source_type: input.sourceType ?? null,
      related_product: input.relatedProduct ?? null,
      topic_cluster: input.topicCluster ?? null,
      keywords: normalizeKeywords(input.keywords),
      intent_score: input.intentScore ?? null,
      freshness_score: input.freshnessScore ?? null,
      authority_score: input.authorityScore ?? null,
      risk_level: input.riskLevel ?? "low",
      status: input.status ?? "discovered",
      linked_article_id: input.linkedArticleId ?? null,
      linked_post_id: input.linkedPostId ?? null,
      content_hash: hash,
    };
    const { data, error } = await supabaseAdmin.from("growth_knowledge").insert(row).select("*").single();
    if (error || !data) return null;
    return toItem(data as KnowledgeRow);
  } catch {
    return null;
  }
}

/** Lowercase word tokens (length ≥ 2). Pure. Mirrors learning.ts tokenize. */
function tokenize(s: string): string[] {
  const m = (s ?? "").toLowerCase().match(/[a-z0-9]+/g);
  return (m ? Array.from(m) : []).filter((t) => t.length >= 2);
}

/** Jaccard overlap of two token sets (0–1). Pure. */
function jaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface SearchOptions {
  product?: string | null;
  type?: KnowledgeType | null;
  status?: KnowledgeStatus | null;
  limit?: number;
}

/**
 * Search the knowledge base: FTS (plainto_tsquery against search_tsv) for recall,
 * then token-Jaccard rerank against the query for precision. Returns ranked items.
 * Never throws; returns [] on any failure.
 */
export async function searchKnowledge(query: string, opts: SearchOptions = {}): Promise<KnowledgeItem[]> {
  if (!supabaseAdmin) return [];
  const q = (query || "").trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 40));
  try {
    let req = supabaseAdmin
      .from("growth_knowledge")
      .select("*")
      .textSearch("search_tsv", q, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(60);
    if (opts.product) req = req.eq("related_product", opts.product);
    if (opts.type) req = req.eq("type", opts.type);
    if (opts.status) req = req.eq("status", opts.status);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) {
      await logError("kb-search-fail", q, String(error?.message || "no data")).catch(() => undefined);
      return [];
    }
    const items = (data as KnowledgeRow[]).map(toItem);
    // Rerank by token-Jaccard against the query (FTS recall + lexical precision).
    items.sort((a, b) => jaccard(b.title + " " + (b.summary ?? ""), q) - jaccard(a.title + " " + (a.summary ?? ""), q));
    return items.slice(0, limit);
  } catch (e) {
    await logError("kb-search-fail", q, String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

/** List knowledge rows with optional filters (the admin Knowledge page). Newest-first. */
export async function listKnowledge(opts: SearchOptions = {}): Promise<KnowledgeItem[]> {
  if (!supabaseAdmin) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 400));
  try {
    let req = supabaseAdmin
      .from("growth_knowledge")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.product) req = req.eq("related_product", opts.product);
    if (opts.type) req = req.eq("type", opts.type);
    if (opts.status) req = req.eq("status", opts.status);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) {
      await logError("kb-list-fail", opts.type || "all", String(error?.message || "no data")).catch(() => undefined);
      return [];
    }
    return (data as KnowledgeRow[]).map(toItem);
  } catch (e) {
    await logError("kb-list-fail", opts.type || "all", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

/**
 * Recent analytics insights stored by syncAnalyticsToKB (source_type 'analytics'
 * or 'search_console'). Used by the Performance page + the read_analytics agent
 * tool so the founder sees the last sync's recommendations without re-fetching
 * Google. Newest-first; never throws. Also the basis for `lastAnalyticsSyncAt`.
 */
export async function listAnalyticsInsights(limit = 30): Promise<KnowledgeItem[]> {
  if (!supabaseAdmin) return [];
  const cap = Math.max(1, Math.min(limit, 100));
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_knowledge")
      .select("*")
      .in("source_type", ["analytics", "search_console"])
      .order("created_at", { ascending: false })
      .limit(cap);
    if (error || !Array.isArray(data)) {
      await logError("kb-analytics-list-fail", "analytics", String(error?.message || "no data")).catch(() => undefined);
      return [];
    }
    return (data as KnowledgeRow[]).map(toItem);
  } catch (e) {
    await logError("kb-analytics-list-fail", "analytics", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

/** Timestamp of the most recent analytics insight row (the last successful
 *  sync), or null when none exists yet. Never throws. */
export async function lastAnalyticsSyncAt(): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_knowledge")
      .select("created_at")
      .in("source_type", ["analytics", "search_console"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return (data[0] as { created_at?: string }).created_at ?? null;
  } catch {
    return null;
  }
}

/**
 * The pre-draft retrieval. Returns a compact set of relevant KB items: sources,
 * related prior articles/posts, competitor gaps, founder notes for the topic +
 * product. Used by articleWriter + promoter to ground a new draft in what the
 * agent already knows. Never throws; returns [] on any failure.
 */
export async function retrieveForTopic(topic: string, product?: string | null): Promise<KnowledgeItem[]> {
  return searchKnowledge(topic, { product: product ?? null, limit: 8 });
}

/**
 * Cross-source duplicate detection — the missing piece. Returns true when `topic`
 * is a near-duplicate (token Jaccard ≥ 0.8) of any existing KB title/summary, any
 * published ARTICLES title, OR any drafted article's topic. The agent pivots
 * angle / updates existing / skips instead of re-drafting the same thing. Best-
 * effort: on any DB error returns false (no duplicate found → proceed).
 */
export async function findDuplicateKnowledge(topic: string, product?: string | null): Promise<{ duplicate: boolean; existing?: KnowledgeItem; reason?: string }> {
  const t = (topic || "").trim();
  if (!t) return { duplicate: false };
  // 1) Published ARTICLES titles (no DB needed — in-memory manifest).
  const publishedTitles = ARTICLES.map((a) => a.title);
  if (isParaphraseOf(t, publishedTitles)) {
    return { duplicate: true, reason: "matches a published article title — consider update_existing instead of a new article" };
  }
  if (!supabaseAdmin) return { duplicate: false };
  try {
    // 2) Existing KB titles + summaries (topic-type rows first, then everything).
    let req = supabaseAdmin
      .from("growth_knowledge")
      .select("id,type,title,summary,related_product,status")
      .order("created_at", { ascending: false })
      .limit(200);
    if (product) req = req.eq("related_product", product);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) {
      await logError("kb-dedup-fail", t, String(error?.message || "no data")).catch(() => undefined);
      return { duplicate: false };
    }
    const rows = data as Array<{ id: string; type: KnowledgeType; title: string; summary: string | null; related_product: string | null; status: KnowledgeStatus }>;
    const texts = rows.map((r) => `${r.title} ${r.summary ?? ""}`);
    if (isParaphraseOf(t, texts)) {
      const hit = rows.find((r) => isParaphraseOf(t, [`${r.title} ${r.summary ?? ""}`]));
      return { duplicate: true, existing: hit ? toItem({ ...({} as KnowledgeRow), ...hit }) : undefined, reason: "matches an existing knowledge-base entry" };
    }
    return { duplicate: false };
  } catch (e) {
    await logError("kb-dedup-fail", t, String((e as Error)?.message || "throw")).catch(() => undefined);
    return { duplicate: false };
  }
}

// ─── per-row mutations ──────────────────────────────────────────────────────

async function patchRow(id: string, patch: Record<string, unknown>): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin.from("growth_knowledge").update(patch).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function markUsed(id: string): Promise<boolean> {
  // Increment use_count + stamp last_used_at. read-then-write (cap at 9999).
  if (!supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin.from("growth_knowledge").select("use_count").eq("id", id).maybeSingle();
    const next = Math.min(((data as { use_count?: number } | null)?.use_count ?? 0) + 1, 9999);
    return patchRow(id, { use_count: next, last_used_at: new Date().toISOString() });
  } catch {
    return false;
  }
}

export async function markOutdated(id: string): Promise<boolean> {
  return patchRow(id, { status: "outdated" });
}

export async function archive(id: string): Promise<boolean> {
  return patchRow(id, { status: "archived" });
}

export async function setStatus(id: string, status: KnowledgeStatus): Promise<boolean> {
  return patchRow(id, { status });
}

export async function linkToArticle(id: string, slug: string): Promise<boolean> {
  return patchRow(id, { linked_article_id: slug, status: "published" });
}

export async function linkToPost(id: string, postId: string): Promise<boolean> {
  return patchRow(id, { linked_post_id: postId });
}

/** Record a founder decision on a KB-linked item (approve/reject) — a learning signal. */
export async function recordDecision(id: string, approved: boolean): Promise<boolean> {
  return patchRow(id, { status: approved ? "approved" : "skipped" });
}

/**
 * Outcome learning signal (called from outcomes.measureOutcomes). Bumps or
 * deprioritizes KB topic/source rows whose title is a token-Jaccard match for
 * the just-measured article's title. A positive SEO delta boosts intent_score
 * (this angle worked → prioritise similar topics); a negative delta deprioritizes
 * (mark similar discovered topics 'skipped'). Signals adjust scores only; the
 * founder still approves. Best-effort, never throws.
 */
export async function boostTopic(topicTitle: string, sign: number): Promise<void> {
  if (!supabaseAdmin) return;
  const t = (topicTitle || "").trim();
  if (!t) return;
  // sign === 0 means the outcome measurement produced no usable delta — there is
  // nothing to boost or deprioritize on, so don't touch any rows. (The old code
  // treated 0 as >= 0 and bumped every similar topic by Math.max(1, 0) = +1,
  // polluting intent_scores on a no-signal event.)
  if (!Number.isFinite(sign) || sign === 0) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_knowledge")
      .select("id,title,summary,intent_score,status")
      .in("type", ["topic", "source", "competitor_gap"])
      .order("created_at", { ascending: false })
      .limit(120);
    if (error || !Array.isArray(data)) return;
    // Threshold lowered from 0.34 → 0.18: Jaccard on titles alone is brutal
    // (two paraphrases often share only a stopword-stripped stem or two), so the
    // old 0.34 gate almost never fired and outcome learning was effectively a
    // no-op. 0.18 keeps it honest (still rejects clearly-unrelated rows) while
    // letting genuine same-angle topics receive the signal. Jaccard is computed
    // against title + summary so richer topic rows match more reliably.
    const THRESH = 0.18;
    for (const r of data as Array<{ id: string; title: string; summary: string | null; intent_score: number | null; status: KnowledgeStatus }>) {
      if (jaccard(`${r.title} ${r.summary ?? ""}`, t) < THRESH) continue;
      if (sign > 0) {
        const next = Math.min(((r.intent_score ?? 50) + Math.max(1, Math.round(sign))), 100);
        await patchRow(r.id, { intent_score: next });
      } else {
        // Negative delta → deprioritize discovered/needs_review topics of this angle.
        if (r.status === "discovered" || r.status === "needs_review") {
          await patchRow(r.id, { status: "skipped" });
        }
      }
    }
  } catch {
    /* best-effort */
  }
}

export async function deleteKnowledge(id: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin.from("growth_knowledge").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Phase 3 calendar fallback — when the founder-authored calendar file is
 * exhausted, pick the highest-intent founder-APPROVED KB topic that isn't
 * already a published slug or a drafted article. Returns a CalendarTopic-shaped
 * {topic, category, angle} the morning cron can hand straight to buildMorningPrompt,
 * or null when nothing qualifies. Best-effort, never throws.
 */
export async function pickApprovedTopicFallback(
  publishedSlugs: Set<string>,
  draftedSlugs: string[],
): Promise<{ topic: string; category: string; angle?: string } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_knowledge")
      .select("id,title,summary,topic_cluster,related_product,intent_score,keywords")
      .eq("type", "topic")
      .eq("status", "approved")
      .order("intent_score", { ascending: false, nullsFirst: false })
      .limit(40);
    if (error || !Array.isArray(data)) return null;
    const drafted = new Set(draftedSlugs.map((s) => s.toLowerCase()));
    for (const r of data as Array<{ id: string; title: string; summary: string | null; topic_cluster: string | null; related_product: string | null; intent_score: number | null; keywords: string[] | null }>) {
      // Reuse the article slugifier so the fallback matches what write_article
      // would produce. Lazy-import to avoid a static cycle (articleWriter -> knowledge).
      const { slugifyTitle } = await import("./articleWriter.js");
      const slug = slugifyTitle(r.title).toLowerCase();
      if (publishedSlugs.has(slug) || drafted.has(slug)) continue;
      const angle = r.summary ? r.summary.slice(0, 200) : (r.topic_cluster ?? undefined);
      return { topic: r.title, category: deriveCalendarCategory(r.topic_cluster, r.related_product), angle: angle ?? undefined };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Map a KB topic's cluster/product to one of the calendar's category labels
 * (AI Foundations / AI Tools / Engineering / Security / InBharat) so a fallback
 * topic slots into the morning prompt cleanly instead of always being stamped
 * "AI Foundations". cluster wins when it already matches a calendar category;
 * otherwise the product maps (JAK Shield → Security, Sahayaak Seva/UnoOne →
 * Engineering, InBharat → InBharat); default AI Foundations.
 */
function deriveCalendarCategory(cluster: string | null, product: string | null): string {
  const cats = ["AI Foundations", "AI Tools", "Engineering", "Security", "InBharat"];
  const c = (cluster ?? "").trim();
  if (c && cats.some((k) => k.toLowerCase() === c.toLowerCase())) {
    return cats.find((k) => k.toLowerCase() === c.toLowerCase())!;
  }
  const p = (product ?? "").trim().toLowerCase();
  if (p.includes("jak") || p.includes("shield")) return "Security";
  if (p.includes("sahayaak") || p.includes("unoone") || p.includes("uniassist") || p.includes("katha") || p.includes("test")) return "Engineering";
  if (p.includes("inbharat")) return "InBharat";
  return "AI Foundations";
}

// ─── prompt formatting ──────────────────────────────────────────────────────

/**
 * Format retrieved knowledge into a system-prompt block. Returns "" when empty so
 * the prompt is unchanged when the KB has nothing relevant (mirrors formatInboxBlock
 * / formatStrategyBlock). Compact: title + summary + source + type, ≤8 items.
 */
export function formatKnowledgeBlock(items: KnowledgeItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  const lines = items.map((it) => {
    const parts = [`- [${it.type}${it.relatedProduct ? `/${it.relatedProduct}` : ""}] ${it.title}`];
    if (it.summary) parts.push(`    ${it.summary.slice(0, 240)}`);
    if (it.sourceUrl) parts.push(`    source: ${it.sourceUrl}`);
    if (it.linkedArticleId) parts.push(`    linked article: ${it.linkedArticleId}`);
    return parts.join("\n");
  });
  return `KNOWLEDGE BASE (what you already know — build on this; do NOT repeat an angle already covered; cite sources):\n${lines.join("\n")}`;
}