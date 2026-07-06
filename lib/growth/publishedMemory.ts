/**
 * InBharat Growth — Published Memory (the cockpit's "what's published where" layer).
 *
 * One row per published article joining the three disjoint sources by slug
 * (see supabase/migrations/20260706100000_growth_published_memory.sql):
 *   • published_articles  — website originals
 *   • growth_syndication  — DEV.to / Hashnode / Medium cross-posts (latest per platform)
 *   • growth_drafts kind='linkedin' status='published' — LinkedIn posts (NO URL persisted)
 *
 * HONEST: LinkedIn platform URL is never stored (share-template → manual post),
 * so linkedin_url is always null and the UI shows "posted manually". measured_at
 * is LinkedIn outcomes only (growth_outcomes.kind CHECK = linkedin|inbox-outline);
 * article SEO lives in growth_pages via the audit runner, surfaced separately.
 *
 * Server-only. supabaseAdmin bypasses RLS (the view's underlying tables are
 * deny-all). NEVER throws — degrades to [] / null on DB error so a blip can't
 * block the cockpit.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { logError } from "./authorization.js";

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
  devto: { url: string | null; status: string | null; at: string | null };
  hashnode: { url: string | null; status: string | null; at: string | null };
  medium: { url: string | null; status: string | null; at: string | null };
  linkedin: { url: string | null; status: string | null; at: string | null };
  measuredAt: string | null;
}

interface PublishedMemoryRow {
  slug: string;
  title: string;
  canonical_url: string;
  publish_date: string | null;
  category: string | null;
  keywords: string[] | null;
  source_meta_sha: string | null;
  synced_at: string | null;
  inbharat_status: string;
  devto_url: string | null;
  devto_status: string | null;
  devto_at: string | null;
  hashnode_url: string | null;
  hashnode_status: string | null;
  hashnode_at: string | null;
  medium_url: string | null;
  medium_status: string | null;
  medium_at: string | null;
  linkedin_status: string | null;
  linkedin_at: string | null;
  linkedin_url: string | null;
  measured_at: string | null;
}

export interface PublishedMemoryFilters {
  /** Filter to articles whose syndication status on this platform matches `status`. */
  platform?: "devto" | "hashnode" | "medium" | "linkedin";
  /** Status value for the platform filter (e.g. "published", "not_configured", null = any). */
  status?: string | null;
  /** Inclusive lower bound on publish_date (ISO YYYY-MM-DD). */
  since?: string;
  /** Inclusive upper bound on publish_date. */
  until?: string;
  limit?: number;
}

function toRow(r: PublishedMemoryRow): PublishedMemoryItem {
  return {
    slug: r.slug,
    title: r.title,
    canonicalUrl: r.canonical_url,
    publishDate: r.publish_date,
    category: r.category,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    sourceMetaSha: r.source_meta_sha,
    syncedAt: r.synced_at,
    inbharatStatus: r.inbharat_status,
    devto: { url: r.devto_url, status: r.devto_status, at: r.devto_at },
    hashnode: { url: r.hashnode_url, status: r.hashnode_status, at: r.hashnode_at },
    medium: { url: r.medium_url, status: r.medium_status, at: r.medium_at },
    linkedin: { url: r.linkedin_url, status: r.linkedin_status, at: r.linkedin_at },
    measuredAt: r.measured_at,
  };
}

/**
 * Platform status derived for sorting/quick-glance ("deposited" if any cross-post
 * row exists, else null). Computed in TS from the joined row — not a DB column.
 */
export function syndicationSummary(item: PublishedMemoryItem): { deposited: boolean; platforms: string[] } {
  const platforms: string[] = [];
  if (item.devto.status) platforms.push("devto");
  if (item.hashnode.status) platforms.push("hashnode");
  if (item.medium.status) platforms.push("medium");
  return { deposited: platforms.length > 0, platforms };
}

/**
 * List every published article with its cross-platform state. Newest-first by
 * publish_date. The platform/status filter is applied IN TS after the fetch
 * because the view exposes per-platform columns (not rows) — a small result set
 * (one row per published article) so post-filtering is cheap and keeps the query
 * simple. Never throws.
 */
export async function listPublishedMemory(filters: PublishedMemoryFilters = {}): Promise<PublishedMemoryItem[]> {
  if (!supabaseAdmin) return [];
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500));
  try {
    let req = supabaseAdmin
      .from("growth_published_memory")
      .select("*")
      .order("publish_date", { ascending: false })
      .limit(limit);
    if (filters.since) req = req.gte("publish_date", filters.since);
    if (filters.until) req = req.lte("publish_date", filters.until);
    const { data, error } = await req;
    if (error || !Array.isArray(data)) {
      await logError("published-memory-list-fail", "view", String(error?.message || "no data")).catch(() => undefined);
      return [];
    }
    let items = (data as PublishedMemoryRow[]).map(toRow);
    if (filters.platform && filters.status !== undefined) {
      const want = filters.status ?? null;
      items = items.filter((it) => {
        const cell = filters.platform === "devto" ? it.devto.status
          : filters.platform === "hashnode" ? it.hashnode.status
          : filters.platform === "medium" ? it.medium.status
          : it.linkedin.status;
        return (cell ?? null) === want;
      });
    }
    return items;
  } catch (e) {
    await logError("published-memory-list-fail", "view", String((e as Error)?.message || "throw")).catch(() => undefined);
    return [];
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
    return toRow(data as PublishedMemoryRow);
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