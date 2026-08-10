/**
 * InBharat Growth Cockpit — read-only 9-stage pipeline board aggregator.
 *
 * Maps the 3 disjoint status vocabularies (KnowledgeStatus / draft status /
 * SyndicationStatus) to the 9 cockpit stages at VIEW TIME — no new DB writes,
 * no new statuses. Approval stays a human click; "Ready = approved" is a label
 * here, not a lifecycle change.
 *
 *   idea       = growth_knowledge status in (discovered, needs_review)
 *   research   = growth_knowledge type in (source, competitor_gap)
 *   brief      = (none — the morning prompt is ephemeral; shown as "—" honestly)
 *   draft      = growth_drafts status='pending' AND no growth_critique_log rows
 *   review     = growth_drafts status='pending' AND has growth_critique_log rows
 *   ready      = growth_drafts status='approved'
 *   deposited  = growth_syndication latest row per slug (any platform)
 *   published  = published_articles rows + growth_drafts kind='linkedin' status='published'
 *   measured   = growth_outcomes where measured_at IS NOT NULL
 *                 (LinkedIn only — growth_outcomes.kind CHECK = linkedin|inbox-outline,
 *                  so article publishes NEVER create outcome rows; the article
 *                  column shows "—" with a tooltip — honest)
 *
 * Filters (status + platform only — the plan cut the other 5): applied
 * best-effort to the stages where they're meaningful and ignored elsewhere:
 *   • status (draft status: pending|approved|published|rejected) → draft/review/
 *     ready/published stages.
 *   • platform (linkedin|inbharat) → deposited + published.
 *
 * Per stage: count + up to 50 compact cards + overflow flag. Server-only.
 * supabaseAdmin bypasses RLS. NEVER throws — degrades to empty stages on DB
 * error so a blip can't block the cockpit.
 */
import { supabaseAdmin } from "../../../api/lib/supabaseAdmin.js";
import { logError } from "../authorization.js";
import type { PipelineStageId } from "./stageChip.js";

export interface PipelineCard {
  id: string;
  title: string;
  slug?: string | null;
  url?: string | null;
  platform?: string | null;
  product?: string | null;
  status?: string | null;
  /** intent_score 0..100 (knowledge rows only); drives the P1/P2/P3 chip. */
  priority?: number | null;
  /** risk_level low|medium|high (knowledge rows only); drives the risk chip. */
  risk?: string | null;
  createdAt?: string | null;
}

export interface PipelineStage {
  stage: PipelineStageId;
  count: number;
  items: PipelineCard[];
  overflow: boolean; // true when count > items.length (capped at 50)
  /** Honest note when the stage is empty-by-design or partially filtered. */
  note?: string;
}

export interface PipelineBoardFilters {
  status?: string | null;   // draft status
  platform?: string | null; // linkedin|instagram|inbharat (devto|hashnode|medium removed)
  cap?: number;             // per-stage card cap (default 50)
}

const DEFAULT_CAP = 50;

/** Honest stage-specific note (independent of DB availability). brief = the
 *  morning cron prompt is ephemeral; measured = LinkedIn outcomes only. */
function stageHonestNote(stage: PipelineStageId): string | undefined {
  if (stage === "brief") return "Briefs are the morning cron prompt — ephemeral, not stored. Drafts land in Draft/Review.";
  if (stage === "measured") return "LinkedIn outcomes only — growth_outcomes.kind is CHECK-constrained to linkedin|inbox-outline, so article publishes never create outcome rows. Article SEO lives in growth_pages via the audit runner.";
  return undefined;
}

function emptyStage(stage: PipelineStageId, count = 0, note?: string): PipelineStage {
  return { stage, count, items: [], overflow: false, note };
}

function capItems<T>(arr: T[], cardCap: number): { items: T[]; overflow: boolean; count: number } {
  const count = arr.length;
  return { items: arr.slice(0, cardCap), overflow: count > cardCap, count };
}

/**
 * Aggregate the 9-stage board. Never throws — on any DB error returns the
 * stages that resolved + empty stages for the rest, so the cockpit still loads.
 */
export async function getPipelineBoard(filters: PipelineBoardFilters = {}): Promise<{ stages: PipelineStage[]; configured: boolean }> {
  const cardCap = Math.max(1, Math.min(filters.cap ?? DEFAULT_CAP, 200));
  if (!supabaseAdmin) {
    return {
      stages: PIPELINE_STAGE_IDS.map((s) => emptyStage(s, 0, stageHonestNote(s) ?? NOT_CONFIGURED_NOTE)),
      configured: false,
    };
  }
  const status = filters.status?.trim() || null;
  const platform = filters.platform?.trim() || null;

  // Parallel fetches — each is best-effort; a failure in one doesn't abort the
  // others (Promise.allSettled). Tables are deny-all; service_role bypasses.
  const [knowledge, drafts, critiqueIds, syndication, publishedArticles, linkedinPublished, instagramPublished, outcomes] = await Promise.all([
    fetchKnowledge(),
    fetchDrafts(status),
    fetchCritiqueDraftIds(),
    fetchSyndication(platform),
    fetchPublishedArticles(),
    fetchSocialPublished("linkedin"),
    fetchSocialPublished("instagram"),
    fetchOutcomes(),
  ]);

  const stages: PipelineStage[] = [];

  // 1. idea — knowledge status in (discovered, needs_review)
  {
    const items = knowledge
      .filter((k) => k.status === "discovered" || k.status === "needs_review")
      .map(knowledgeCard);
    const c = capItems(items, cardCap);
    stages.push({ stage: "idea", count: c.count, items: c.items, overflow: c.overflow });
  }

  // 2. research — knowledge type in (source, competitor_gap)
  {
    const items = knowledge
      .filter((k) => k.type === "source" || k.type === "competitor_gap")
      .map(knowledgeCard);
    const c = capItems(items, cardCap);
    stages.push({ stage: "research", count: c.count, items: c.items, overflow: c.overflow });
  }

  // 3. brief — none (morning prompt is ephemeral). Honest "—".
  stages.push(emptyStage("brief", 0, stageHonestNote("brief")));

  // 4 + 5. draft / review — split pending drafts by whether they have critique_log rows.
  const critSet = critiqueIds;
  {
    const pending = drafts.filter((d) => d.status === "pending");
    const draftItems = pending.filter((d) => !critSet.has(d.id)).map(draftCard);
    const reviewItems = pending.filter((d) => critSet.has(d.id)).map(draftCard);
    const cd = capItems(draftItems, cardCap);
    const cr = capItems(reviewItems, cardCap);
    stages.push({ stage: "draft", count: cd.count, items: cd.items, overflow: cd.overflow });
    stages.push({ stage: "review", count: cr.count, items: cr.items, overflow: cr.overflow });
  }

  // 6. ready — approved drafts
  {
    const items = drafts.filter((d) => d.status === "approved").map(draftCard);
    const c = capItems(items, cardCap);
    stages.push({ stage: "ready", count: c.count, items: c.items, overflow: c.overflow });
  }

  // 7. deposited — distinct slugs in growth_syndication (latest row per slug)
  {
    // The fetch already returns latest-first; dedupe by slug keeping the first.
    const seen = new Set<string>();
    const items: PipelineCard[] = [];
    for (const s of syndication) {
      const slug = s.slug || s.draft_id || s.id;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      items.push({ id: s.id, title: s.slug || "syndicated", slug: s.slug, url: s.platform_url, platform: s.platform, status: s.status, createdAt: s.created_at });
    }
    const c = capItems(items, cardCap);
    const note = platform && c.count === 0 ? `no syndication on platform "${platform}"` : undefined;
    stages.push({ stage: "deposited", count: c.count, items: c.items, overflow: c.overflow, note });
  }

  // 8. published — published_articles (website) + linkedin + instagram published drafts
  {
    const webItems: PipelineCard[] = publishedArticles.map((a) => ({
      id: a.slug, title: a.title, slug: a.slug, url: a.canonical_url, platform: "inbharat", status: "published", createdAt: a.publish_date,
    }));
    const liItems: PipelineCard[] = linkedinPublished.map((d) => ({
      id: d.id, title: d.title, url: d.url, platform: "linkedin", status: "published", createdAt: d.created_at,
    }));
    const igItems: PipelineCard[] = instagramPublished.map((d) => ({
      id: d.id, title: d.title, url: d.url, platform: "instagram", status: "published", createdAt: d.created_at,
    }));
    let items = [...webItems, ...liItems, ...igItems];
    if (platform) items = items.filter((it) => it.platform === platform);
    const c = capItems(items, cardCap);
    stages.push({ stage: "published", count: c.count, items: c.items, overflow: c.overflow });
  }

  // 9. measured — outcomes with measured_at (LinkedIn only — honest)
  {
    const items: PipelineCard[] = outcomes.map((o) => ({
      id: o.id, title: o.title || "LinkedIn outcome", platform: "linkedin", status: "measured", createdAt: o.measured_at,
    }));
    const c = capItems(items, cardCap);
    stages.push({
      stage: "measured",
      count: c.count,
      items: c.items,
      overflow: c.overflow,
      note: stageHonestNote("measured"),
    });
  }

  return { stages, configured: true };
}

const PIPELINE_STAGE_IDS: PipelineStageId[] = ["idea", "research", "brief", "draft", "review", "ready", "deposited", "published", "measured"];
const NOT_CONFIGURED_NOTE = "Database not configured — stage count is 0.";

// ─── Row shapes ─────────────────────────────────────────────────────────────
interface KnowledgeRow { id: string; title: string; type: string; status: string; related_product: string | null; intent_score: number | null; risk_level: string | null; linked_article_id: string | null; created_at: string | null }
interface DraftRow { id: string; kind: string; status: string; url: string | null; title: string | null; schema_json: { slug?: string; product?: string } | null; created_at: string | null }
interface SyndicationRow { id: string; slug: string | null; draft_id: string | null; platform: string; status: string; platform_url: string | null; created_at: string | null }
interface PublishedRow { slug: string; title: string; canonical_url: string; publish_date: string | null }

// ─── Mappers ────────────────────────────────────────────────────────────────
function knowledgeCard(k: KnowledgeRow): PipelineCard {
  return { id: k.id, title: k.title, product: k.related_product, status: k.status, priority: k.intent_score, risk: k.risk_level, url: k.linked_article_id ? `/admin/growth/knowledge#${k.id}` : null, createdAt: k.created_at };
}
function draftCard(d: DraftRow): PipelineCard {
  const sj = d.schema_json ?? {};
  const platform = d.kind === "linkedin" ? "linkedin" : d.kind === "instagram" ? "instagram" : "inbharat";
  return { id: d.id, title: d.title ?? d.kind, slug: typeof sj.slug === "string" ? sj.slug : null, url: d.url, platform, product: typeof sj.product === "string" ? sj.product : null, status: d.status, createdAt: d.created_at };
}

// ─── Fetchers (each best-effort, never throws) ──────────────────────────────
async function fetchKnowledge(): Promise<KnowledgeRow[]> {
  try {
    const { data, error } = await supabaseAdmin!
      .from("growth_knowledge")
      .select("id,title,type,status,related_product,intent_score,risk_level,linked_article_id,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return [];
    return data as KnowledgeRow[];
  } catch (e) {
    void logError("pipeline-board-knowledge-fail", "knowledge", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

async function fetchDrafts(statusFilter: string | null): Promise<DraftRow[]> {
  try {
    let req = supabaseAdmin!
      .from("growth_drafts")
      .select("id,kind,status,url,title,schema_json,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (statusFilter) req = req.eq("status", statusFilter);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) return [];
    return data as DraftRow[];
  } catch (e) {
    void logError("pipeline-board-drafts-fail", "drafts", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

async function fetchCritiqueDraftIds(): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseAdmin!
      .from("growth_critique_log")
      .select("draft_id")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error || !Array.isArray(data)) return new Set();
    return new Set((data as Array<{ draft_id: string | null }>).map((r) => r.draft_id).filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

async function fetchSyndication(platformFilter: string | null): Promise<SyndicationRow[]> {
  try {
    let req = supabaseAdmin!
      .from("growth_syndication")
      .select("id,slug,draft_id,platform,status,platform_url,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (platformFilter) req = req.eq("platform", platformFilter);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) return [];
    return data as SyndicationRow[];
  } catch {
    return [];
  }
}

async function fetchPublishedArticles(): Promise<PublishedRow[]> {
  try {
    const { data, error } = await supabaseAdmin!
      .from("published_articles")
      .select("slug,title,canonical_url,publish_date")
      .order("publish_date", { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return [];
    return data as PublishedRow[];
  } catch {
    return [];
  }
}

async function fetchSocialPublished(channel: "linkedin" | "instagram"): Promise<Array<{ id: string; title: string | null; url: string | null; created_at: string | null }>> {
  try {
    const { data, error } = await supabaseAdmin!
      .from("growth_drafts")
      .select("id,title,url,created_at")
      .eq("kind", channel)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ id: string; title: string | null; url: string | null; created_at: string | null }>;
  } catch {
    return [];
  }
}

async function fetchOutcomes(): Promise<Array<{ id: string; measured_at: string | null; draft_id: string | null; kind: string; title?: string }>> {
  try {
    const { data, error } = await supabaseAdmin!
      .from("growth_outcomes")
      .select("id,measured_at,draft_id,kind")
      .not("measured_at", "is", null)
      .order("measured_at", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ id: string; measured_at: string | null; draft_id: string | null; kind: string; title?: string }>;
  } catch {
    return [];
  }
}