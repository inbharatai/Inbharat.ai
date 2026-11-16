/**
 * InBharat Growth — Published Memory (the cockpit's "what's published where" layer).
 *
 * One row per historical website article joining the sources by slug
 * (see supabase/migrations/20261116000002_article_publication_read_models.sql):
 *   • published_articles  — website originals
 *   • growth_drafts + growth_syndication — social posts (independent lifecycle)
 *
 * Note: DEV.to, Hashnode, and Medium syndication channels have been removed.
 *
 * HONEST: LinkedIn API posts can have a stored permalink; manual share-template
 * posts have no stored URL. Website removal never removes their social history.
 * measured_at is LinkedIn outcomes only (growth_outcomes.kind CHECK = linkedin|inbox-outline);
 * article SEO lives in growth_pages via the audit runner, surfaced separately.
 *
 * Server-only. supabaseAdmin bypasses RLS (the view's underlying tables are
 * deny-all). NEVER throws — degrades to [] / null on DB error so a blip can't
 * block the cockpit.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { logError } from "./authorization.js";
import type { ArticleObservationInventory } from "./analyticsInsights.js";

export type PublicationState = "live" | "unverified" | "removed";

/** The legacy view literal "published" is NOT verification evidence. */
export function publicationState(value: unknown): PublicationState {
  return value === "live" || value === "removed" ? value : "unverified";
}

export interface PublishedMemoryItem {
  slug: string;
  title: string;
  canonicalUrl: string;
  publishDate: string | null;
  category: string | null;
  keywords: string[];
  sourceMetaSha: string | null;
  syncedAt: string | null;
  inbharatStatus: string;
  /** Optional for compatibility with cached/pre-lifecycle clients. Reader always sets these. */
  publicationState?: PublicationState;
  firstVerifiedAt?: string | null;
  verifiedAt?: string | null;
  removedAt?: string | null;
  sourceCommitSha?: string | null;
  canonicalSnapshotId?: string | null;
  canonicalSnapshotBuiltAt?: string | null;
  verificationMethod?: string | null;
  deploymentId?: string | null;
  deploymentCreatedAt?: string | null;
  vercelVerifiedAt?: string | null;
  linkedin: { url: string | null; status: string | null; at: string | null };
  /** Absent until migration 20260810000002 adds the instagram_* view columns. */
  instagram?: { url: string | null; status: string | null; at: string | null };
  measuredAt: string | null;
}

export interface PublishedMemoryRow {
  slug: string;
  title: string;
  canonical_url: string;
  publish_date: string | null;
  category: string | null;
  keywords: string[] | null;
  source_meta_sha: string | null;
  synced_at: string | null;
  inbharat_status: string;
  publication_state?: string;
  first_verified_at?: string | null;
  verified_at?: string | null;
  removed_at?: string | null;
  source_commit_sha?: string | null;
  canonical_snapshot_id?: string | null;
  canonical_snapshot_built_at?: string | null;
  verification_method?: string | null;
  deployment_id?: string | null;
  deployment_created_at?: string | null;
  vercel_verified_at?: string | null;
  linkedin_status: string | null;
  linkedin_at: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  instagram_status: string | null;
  instagram_at: string | null;
  measured_at: string | null;
}

export interface PublishedMemoryFilters {
  /** Defaults to current live. History includes live, removed AND unverified rows. */
  selection?: "live" | "history" | "unverified" | "removed";
  /** Filter to articles whose syndication status on this platform matches `status`. */
  platform?: "linkedin" | "instagram";
  /** Status value for the platform filter (e.g. "published", "not_configured", null = any). */
  status?: string | null;
  /** Inclusive lower bound on publish_date (ISO YYYY-MM-DD). */
  since?: string;
  /** Inclusive upper bound on publish_date. */
  until?: string;
  limit?: number;
}

export function mapPublishedMemoryRow(r: PublishedMemoryRow): PublishedMemoryItem {
  return {
    slug: r.slug,
    title: r.title,
    canonicalUrl: r.canonical_url,
    publishDate: r.publish_date,
    category: r.category,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    sourceMetaSha: r.source_meta_sha,
    syncedAt: r.synced_at,
    // Require the new lifecycle column: an old constant status must never imply live.
    inbharatStatus: publicationState(r.publication_state),
    publicationState: publicationState(r.publication_state),
    firstVerifiedAt: r.first_verified_at ?? null,
    verifiedAt: r.verified_at ?? null,
    removedAt: r.removed_at ?? null,
    sourceCommitSha: r.source_commit_sha ?? null,
    canonicalSnapshotId: r.canonical_snapshot_id ?? null,
    canonicalSnapshotBuiltAt: r.canonical_snapshot_built_at ?? null,
    verificationMethod: r.verification_method ?? null,
    deploymentId: r.deployment_id ?? null,
    deploymentCreatedAt: r.deployment_created_at ?? null,
    vercelVerifiedAt: r.vercel_verified_at ?? null,
    linkedin: { url: r.linkedin_url, status: r.linkedin_status, at: r.linkedin_at },
    instagram: { url: r.instagram_url ?? null, status: r.instagram_status ?? null, at: r.instagram_at ?? null },
    measuredAt: r.measured_at,
  };
}

/**
 * Platform status derived for sorting/quick-glance ("deposited" if any cross-post
 * row exists, else null). Computed in TS from the joined row — not a DB column.
 * DEV.to, Hashnode, and Medium have been removed; LinkedIn and Instagram remain.
 */
export function syndicationSummary(item: PublishedMemoryItem): { deposited: boolean; platforms: string[] } {
  const platforms: string[] = [];
  // Optional-chained on purpose: the instagram_* view columns only exist after
  // migration 20260810000002, and callers (tests, cached rows, a pre-migration
  // DB) can legitimately hand us a row without them. A missing column must read
  // as "no cross-post", never throw.
  if (item.linkedin?.status) platforms.push("linkedin");
  if (item.instagram?.status) platforms.push("instagram");
  return { deposited: platforms.length > 0, platforms };
}

/** Pure selection, also used on legacy rows after honest normalization. */
export function selectPublishedMemory(items: PublishedMemoryItem[], filters: PublishedMemoryFilters = {}): PublishedMemoryItem[] {
  const selection = filters.selection ?? "live";
  return items.filter((it) =>
    (selection === "history" || it.publicationState === selection) &&
    (!filters.platform || filters.status === undefined ||
      ((filters.platform === "instagram" ? it.instagram?.status : it.linkedin?.status) ?? null) === (filters.status ?? null))
  );
}

/** Current live by default; explicit history retains tombstones and legacy rows.
 * Select * is intentional: pre-migration rows normalize to unverified instead of
 * failing a missing-column query. Page BEFORE filtering, limit AFTER filtering,
 * so recent tombstones/social nonmatches cannot hide older matching live rows. */
export async function listPublishedMemory(filters: PublishedMemoryFilters = {}, client = supabaseAdmin): Promise<PublishedMemoryItem[]> {
  if (!client) return [];
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));
  const items: PublishedMemoryItem[] = [];
  try {
    for (let offset = 0; ; offset += 500) {
      let req = client.from("growth_published_memory").select("*")
        .order("publish_date", { ascending: false }).order("slug", { ascending: true })
        .range(offset, offset + 499);
      if (filters.since) req = req.gte("publish_date", filters.since);
      if (filters.until) req = req.lte("publish_date", filters.until);
      const { data, error } = await req;
      if (error || !Array.isArray(data)) throw new Error(error?.message || "no data");
      items.push(...selectPublishedMemory((data as PublishedMemoryRow[]).map(mapPublishedMemoryRow), filters));
      if (items.length >= limit || data.length < 500) return items.slice(0, limit);
    }
  } catch (e) {
    await logError("published-memory-list-fail", "view", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
  }
}

/** Read-only inventory for analytics. Legacy schema remains visible as unverified;
 * query failures are explicit, never an empty successful live inventory. */
export async function getArticleObservationInventory(client = supabaseAdmin): Promise<ArticleObservationInventory> {
  if (!client) return { status: "unavailable", articles: [], reason: "Publication database is not configured; verification age is unknown." };
  const articles: ArticleObservationInventory["articles"] = [];
  try {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("published_articles").select("*")
        .eq("platform", "inbharat").eq("syndication_type", "original")
        .order("slug", { ascending: true }).range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new Error("Publication inventory could not be read; verification age is unknown.");
      for (const r of data) articles.push({
        slug: r.slug, title: r.title, publicationState: publicationState(r.publication_state),
        firstVerifiedAt: r.first_verified_at ?? null, verifiedAt: r.verified_at ?? null,
        verificationMethod: r.verification_method ?? null,
        canonicalSnapshotId: r.canonical_snapshot_id ?? null, sourceCommitSha: r.source_commit_sha ?? null,
      });
      if (data.length < 500) return { status: "available", articles };
    }
  } catch {
    return { status: "unavailable", articles: [], reason: "Publication inventory could not be read; verification age is unknown." };
  }
}

/** One article's published memory by slug, or null if not found / on error. */
export async function getPublishedMemoryBySlug(slug: string): Promise<PublishedMemoryItem | null> {
  if (!supabaseAdmin || !slug) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_published_memory")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return mapPublishedMemoryRow(data as PublishedMemoryRow);
  } catch (e) {
    await logError("published-memory-get-fail", slug, String((e as Error)?.message || "throw")).catch(() => undefined);
    return null;
  }
}

/**
 * Every slug already syndicated to a platform (used by the duplicate gate + the
 * pipeline board's Deposited stage). Returns a Set for O(1) membership. Never
 * throws — returns an empty Set on error so dedupe degrades to "proceed".
 */
export async function syndicatedSlugs(): Promise<Set<string>> {
  if (!supabaseAdmin) return new Set();
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_syndication")
      .select("slug")
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) return new Set();
    return new Set((data as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean));
  } catch (e) {
    await logError("published-memory-syndicated-fail", "set", String((e as Error)?.message || "throw")).catch(() => undefined);
    return new Set();
  }
}