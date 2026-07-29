import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";
import type { KnowledgeItem, KnowledgeStatus } from "../../../lib/growth/knowledge";
import {
  feedOf,
  feedHint,
  filterIntelligence,
  sortIntelligence,
  FEED_LABEL,
  type IntelligenceFeed,
  type IntelligenceSort,
} from "../../../lib/growth/cockpit/intelligenceFeed";

/**
 * /admin/growth/intelligence — the Jervis "Intelligence Inbox": one unified,
 * filterable feed over the signals that inform the next content decision.
 *
 * The knowledge base is the single store (analytics syncs + agent-saved topics,
 * competitor gaps, founder sources, and decisions all live there). This page tags
 * each row by feed, then filters/sorts client-side via the pure
 * intelligenceFeed module (hermetically tested). Agent outputs (articles/posts/
 * drafts) are excluded — they live on Published Memory / Issues.
 *
 * Read-only. Nothing here auto-publishes. Honest empty state — no fabricated rows.
 */

type FeedFilter = IntelligenceFeed | "all";
type StatusFilter = KnowledgeStatus | "all";

const FEED_TABS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All signals" },
  { key: "analytics", label: "Analytics" },
  { key: "discovery", label: "Discovery" },
  { key: "source", label: "Sources" },
  { key: "decision", label: "Decisions" },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Any status" },
  { key: "discovered", label: "Discovered" },
  { key: "needs_review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "skipped", label: "Skipped" },
  { key: "outdated", label: "Outdated" },
  { key: "archived", label: "Archived" },
];

const FEED_CHIP: Record<IntelligenceFeed, string> = {
  analytics: "bg-sky-500/15 text-sky-300",
  discovery: "bg-violet-500/15 text-violet-300",
  source: "bg-emerald-500/15 text-emerald-300",
  decision: "bg-amber-500/15 text-amber-300",
};

const RISK_CHIP: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-300",
  high: "bg-rose-500/10 text-rose-300",
};

const Intelligence: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [counts, setCounts] = useState<{ feed: IntelligenceFeed; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IntelligenceSort>("recent");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await fetchJson<{ ok: boolean; items?: KnowledgeItem[]; counts?: { feed: IntelligenceFeed; count: number }[]; error?: string }>(
      "/api/growth/intelligence",
    );
    if (error || !data?.ok) setError(error || data?.error || "load failed");
    else {
      setItems(data.items ?? []);
      setCounts(data.counts ?? []);
    }
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => sortIntelligence(filterIntelligence(items, { feed, status, query }), sort),
    [items, feed, status, query, sort],
  );

  const countFor = (f: IntelligenceFeed) => counts.find((c) => c.feed === f)?.count ?? 0;
  const totalSignals = counts.reduce((n, c) => n + c.count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Intelligence Inbox</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            One feed over the signals that inform the next decision — analytics, discovered topics, founder sources, and
            decisions, all stored in the knowledge base. Agent outputs (articles/posts/drafts) live on
            <Link to="/admin/growth/issues" className="text-[#f59f4f] hover:underline"> Issues </Link>
            and
            <Link to="/admin/growth/knowledge" className="text-[#f59f4f] hover:underline"> Knowledge</Link>.
            Read-only — nothing here publishes.
          </p>
        </div>
        <button onClick={() => load()} disabled={loading}
          className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30 disabled:opacity-40">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Feed tabs with live counts. */}
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-white/[0.06] pb-2">
        {FEED_TABS.map((t) => {
          const n = t.key === "all" ? totalSignals : countFor(t.key);
          return (
            <button key={t.key} onClick={() => setFeed(t.key)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${feed === t.key ? "bg-[#f59f4f]/10 text-[#f59f4f] ring-1 ring-[#f59f4f]/30" : "text-[#9fb2c6] hover:bg-white/[0.04] hover:text-white"}`}>
              {t.label} <span className="ml-1 text-[10px] text-[#7a9ab8]">{n}</span>
            </button>
          );
        })}
      </div>
      {feed !== "all" && (
        <p className="mt-2 text-[11px] text-[#7a9ab8]">{feedHint(feed as IntelligenceFeed)}</p>
      )}

      {/* Filters: search + status + sort. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search signals…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-1.5 text-[12px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-lg border border-white/10 bg-[#0a0f18] px-2.5 py-1.5 text-[12px] text-white focus:border-[#f59f4f]/50 focus:outline-none">
          {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as IntelligenceSort)}
          className="rounded-lg border border-white/10 bg-[#0a0f18] px-2.5 py-1.5 text-[12px] text-white focus:border-[#f59f4f]/50 focus:outline-none">
          <option value="recent">Newest</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      {error && <p className="mt-4 text-[13px] text-rose-300">Failed: {error}</p>}
      {loading && <p className="mt-4 text-[13px] text-[#7a9ab8]">Loading…</p>}

      {!loading && !error && (
        <div className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-[13px] text-[#9fb2c6]">
                {totalSignals === 0
                  ? "No intelligence signals yet. Sync analytics on the Performance page and run the daily audit to populate this feed."
                  : "No signals match the current filters."}
              </p>
            </div>
          ) : (
            filtered.map((it) => {
              const f = feedOf(it);
              if (!f) return null;
              return (
                <div key={it.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${FEED_CHIP[f]}`}>{FEED_LABEL[f]}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${RISK_CHIP[it.riskLevel] ?? "bg-slate-500/15 text-slate-300"}`}>{it.riskLevel}</span>
                      <span className="text-[10px] text-[#7a9ab8]">{it.status.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[10px] text-[#7a9ab8]">
                      {new Date(it.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      {it.intentScore != null && ` · priority ${it.intentScore}`}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-white">{it.title}</p>
                  {it.summary && <p className="mt-1 line-clamp-2 text-[12px] text-[#9fb2c6]">{it.summary}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#7a9ab8]">
                    {it.relatedProduct && <span>product: {it.relatedProduct}</span>}
                    {it.topicCluster && <span>cluster: {it.topicCluster}</span>}
                    {it.keywords.length > 0 && <span>keywords: {it.keywords.slice(0, 3).join(", ")}</span>}
                    {it.sourceUrl && <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="text-[#7a9ab8] underline hover:text-[#c8d6e8]">source ↗</a>}
                    <Link to={`/admin/growth/knowledge?q=${encodeURIComponent(it.title.slice(0, 60))}`} className="ml-auto text-[#f59f4f] hover:underline">
                      Open in Knowledge ↗
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default Intelligence;