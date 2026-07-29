/**
 * Pure "Intelligence Inbox" logic — a unified, filterable feed over the knowledge
 * base. The KB already stores analytics insights (GA4/GSC sync writes rows with
 * source_type 'analytics'/'search_console'), discovered topics, competitor gaps,
 * founder-authored sources, and decisions — so the "intelligence inbox" is one
 * tagged view over that single table, not a new store.
 *
 * React-free so scripts/test-growth.ts can drive it with fixtures (no DOM). The
 * page (pages/admin/growth/Intelligence.tsx) fetches /api/growth/intelligence and
 * renders; this module only derives feed tags, filters, counts, and sort order.
 *
 * HONESTY CONTRACT: nothing here fetches or mutates. Items the agent produced as
 * outputs (articles, posts, drafts) are excluded from the signal feed — they live
 * on the Published Memory / Issues surfaces. The inbox is for *inputs* that inform
 * the next decision.
 */

import type { KnowledgeItem, KnowledgeStatus } from "../knowledge.js";

export type IntelligenceFeed = "analytics" | "discovery" | "source" | "decision";

export interface IntelligenceFilters {
  feed?: IntelligenceFeed | "all";
  query?: string;
  status?: KnowledgeStatus | "all";
  product?: string;
}

export type IntelligenceSort = "recent" | "priority";

export interface FeedCount { feed: IntelligenceFeed; count: number; }

const ANALYTICS_SOURCES = new Set(["analytics", "search_console"]);

/** Map a KB row to its intelligence feed bucket. Pure + testable. */
export function feedOf(item: KnowledgeItem): IntelligenceFeed | null {
  if (ANALYTICS_SOURCES.has((item.sourceType ?? "").toLowerCase())) return "analytics";
  switch (item.type) {
    case "topic":
    case "competitor_gap":
      return "discovery";
    case "source":
      return "source";
    case "decision":
      return "decision";
    default:
      return null; // article / post / draft / note / keyword / performance — outputs or non-signals
  }
}

/** True if the row is an intelligence signal (an input that informs the next
 *  decision), false for agent outputs (articles/posts/drafts). Pure + testable. */
export function isSignal(item: KnowledgeItem): boolean {
  return feedOf(item) !== null;
}

export const FEED_LABEL: Record<IntelligenceFeed, string> = {
  analytics: "Analytics signal",
  discovery: "Discovery",
  source: "Founder source",
  decision: "Decision",
};

const FEED_RANK: Record<IntelligenceFeed, number> = {
  decision: 0,
  analytics: 1,
  discovery: 2,
  source: 3,
};

function textOf(item: KnowledgeItem): string {
  return `${item.title} ${item.summary ?? ""} ${item.body ?? ""}`.toLowerCase();
}

/** Filter the unified feed. Pure + testable. */
export function filterIntelligence(items: KnowledgeItem[], f: IntelligenceFilters): KnowledgeItem[] {
  const q = (f.query ?? "").trim().toLowerCase();
  const product = (f.product ?? "").trim().toLowerCase();
  return items.filter((it) => {
    if (!isSignal(it)) return false;
    if (f.feed && f.feed !== "all" && feedOf(it) !== f.feed) return false;
    if (f.status && f.status !== "all" && it.status !== f.status) return false;
    if (product && (it.relatedProduct ?? "").toLowerCase() !== product) return false;
    if (q && !textOf(it).includes(q)) return false;
    return true;
  });
}

/** Sort the filtered feed. 'recent' = newest createdAt first; 'priority' = highest
 *  intentScore first (intentScore may be null → treated as 0, sorted last within
 *  priority). Pure + testable. */
export function sortIntelligence(items: KnowledgeItem[], sort: IntelligenceSort): KnowledgeItem[] {
  const copy = items.slice();
  if (sort === "priority") {
    copy.sort((a, b) => {
      const pa = a.intentScore ?? 0;
      const pb = b.intentScore ?? 0;
      if (pb !== pa) return pb - pa;
      // tiebreak by recency
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  } else {
    copy.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  return copy;
}

/** Per-feed counts over a list (only signal feeds counted). Pure + testable. */
export function feedCounts(items: KnowledgeItem[]): FeedCount[] {
  const counts: Record<string, number> = { analytics: 0, discovery: 0, source: 0, decision: 0 };
  for (const it of items) {
    const f = feedOf(it);
    if (f) counts[f]++;
  }
  return (Object.keys(counts) as IntelligenceFeed[])
    .map((feed) => ({ feed, count: counts[feed] }))
    .sort((a, b) => FEED_RANK[a.feed] - FEED_RANK[b.feed]);
}

/** A one-line "what is this" hint per feed, shown under the filter chip. */
export function feedHint(feed: IntelligenceFeed): string {
  switch (feed) {
    case "analytics": return "GA4 + Search Console signals synced from the Performance page.";
    case "discovery": return "Discovered topics + competitor gaps the agent surfaced.";
    case "source": return "Founder-authored notes + captured context the agent retrieves before drafting.";
    case "decision": return "Recorded decisions that constrain future drafts.";
  }
}