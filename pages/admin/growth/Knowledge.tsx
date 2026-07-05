import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import type { KnowledgeItem, KnowledgeType, KnowledgeStatus } from "../../../lib/growth/knowledge";

/**
 * /admin/growth/knowledge — the inbox-as-knowledge-base browser. Search + filter
 * the growth_knowledge table (sources, discovered topics, articles, posts,
 * decisions, performance signals) the Growth Agent retrieves before drafting.
 * Mark items outdated/archived, approve/reject discovered topics, link to a
 * published article, or delete. Founde-authored + agent-saved rows both show.
 *
 * The agent tools (save_knowledge / search_knowledge / list_knowledge /
 * find_duplicate) read/write the same table via lib/growth/knowledge.ts; this
 * page is the founder's review surface. Nothing here auto-publishes.
 */
const TYPES: { key: KnowledgeType | "all"; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "topic", label: "Topics" },
  { key: "source", label: "Sources" },
  { key: "article", label: "Articles" },
  { key: "post", label: "Posts" },
  { key: "competitor_gap", label: "Competitor gaps" },
  { key: "decision", label: "Decisions" },
  { key: "performance", label: "Performance" },
  { key: "note", label: "Notes" },
  { key: "keyword", label: "Keywords" },
  { key: "draft", label: "Drafts" },
];

const STATUSES: { key: KnowledgeStatus | "all"; label: string }[] = [
  { key: "all", label: "Any status" },
  { key: "discovered", label: "Discovered" },
  { key: "needs_review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "drafted", label: "Drafted" },
  { key: "published", label: "Published" },
  { key: "skipped", label: "Skipped" },
  { key: "update_existing", label: "Update existing" },
  { key: "outdated", label: "Outdated" },
  { key: "archived", label: "Archived" },
];

const STATUS_CHIP: Record<string, string> = {
  discovered: "bg-sky-500/15 text-sky-300",
  needs_review: "bg-amber-500/15 text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  drafted: "bg-violet-500/15 text-violet-300",
  published: "bg-emerald-500/15 text-emerald-300",
  skipped: "bg-slate-500/15 text-slate-300",
  update_existing: "bg-amber-500/15 text-amber-300",
  outdated: "bg-slate-500/15 text-slate-300",
  archived: "bg-slate-700/30 text-slate-400",
};

const RISK_CHIP: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-300",
  high: "bg-rose-500/10 text-rose-300",
};

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const selectCls = "rounded-lg border border-white/10 bg-[#0a0f18] px-2.5 py-2 text-[12px] text-white focus:border-[#f59f4f]/50 focus:outline-none";

const KnowledgePage: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<KnowledgeType | "all">("all");
  const [status, setStatus] = useState<KnowledgeStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    params.set("limit", "200");
    const { data, error } = await fetchJson<{ ok: boolean; items?: KnowledgeItem[]; error?: string }>(
      `/api/growth/knowledge?${params.toString()}`,
    );
    if (error || !data?.ok) setError(error || data?.error || "load failed");
    else setItems(data.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(id: string, action: string, extra?: Record<string, string>) {
    setBusyId(id);
    setMsg(null);
    const { data, error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/knowledge", {
      method: "PATCH",
      body: JSON.stringify({ id, action, ...extra }),
    });
    setBusyId(null);
    if (error || !data?.ok) { setMsg(error || data?.error || "update failed"); return; }
    setMsg(`Updated (${action}).`);
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this knowledge row? This cannot be undone.")) return;
    setBusyId(id);
    const { data, error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/knowledge", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    setBusyId(null);
    if (error || !data?.ok) { setMsg(error || data?.error || "delete failed"); return; }
    setMsg("Deleted.");
    void load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        The Growth Agent&apos;s memory layer — sources, discovered topics, prior articles/posts, decisions, and
        performance signals it retrieves before drafting so it builds on what it already knows instead of repeating
        angles. Cross-source dedupe by content hash + token match. The agent saves rows here automatically
        (web search results, critiques, publishes, outcomes); you can also save rows by hand.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
          placeholder="Search the knowledge base (FTS + token rerank)…"
          className={inputCls + " max-w-md"}
        />
        <select value={type} onChange={(e) => setType(e.target.value as KnowledgeType | "all")} className={selectCls}>
          {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as KnowledgeStatus | "all")} className={selectCls}>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[13px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90"
        >
          Search
        </button>
      </div>

      {msg && <p className="mt-3 text-[12px] text-emerald-300">{msg}</p>}
      {error && <p className="mt-3 text-[12px] text-rose-300">{error}</p>}

      <p className="mt-3 text-[11px] text-[#5f7c98]">{loading ? "Loading…" : `${items.length} item(s)`}</p>

      <div className="mt-3 space-y-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-[#0a0f18] text-[#9fb2c6]">{it.type}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_CHIP[it.status] ?? "bg-slate-500/15 text-slate-300"}`}>{it.status}</span>
                  {it.relatedProduct && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-[#0a0f18] text-[#7ab9e6]">{it.relatedProduct}</span>}
                  {it.riskLevel && it.riskLevel !== "low" && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${RISK_CHIP[it.riskLevel] ?? ""}`}>risk: {it.riskLevel}</span>}
                  {it.useCount > 0 && <span className="text-[9px] text-[#5f7c98]">· used {it.useCount}×</span>}
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-white">{it.title}</p>
                {it.summary && <p className="mt-1 text-[12px] leading-relaxed text-[#9fb2c6]">{it.summary}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-[#5f7c98]">
                  {it.sourceUrl && <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#7ab9e6] hover:underline truncate max-w-[300px]">source ↗</a>}
                  {it.linkedArticleId && <span>article: {it.linkedArticleId}</span>}
                  {it.intentScore != null && <span>intent {it.intentScore}</span>}
                  {it.keywords.length > 0 && <span className="truncate max-w-[260px]">#{it.keywords.join(" #")}</span>}
                  <span>{new Date(it.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {it.status === "discovered" || it.status === "needs_review" ? (
                  <>
                    <button onClick={() => patch(it.id, "approve")} disabled={busyId === it.id} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 disabled:opacity-40">Approve</button>
                    <button onClick={() => patch(it.id, "reject")} disabled={busyId === it.id} className="rounded-md border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-[#c8d6e8] disabled:opacity-40">Skip</button>
                  </>
                ) : null}
                <button onClick={() => patch(it.id, "markOutdated")} disabled={busyId === it.id} className="rounded-md border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-[#c8d6e8] disabled:opacity-40">Mark outdated</button>
                <button onClick={() => patch(it.id, "archive")} disabled={busyId === it.id} className="rounded-md border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-[#c8d6e8] disabled:opacity-40">Archive</button>
                <button onClick={() => remove(it.id)} disabled={busyId === it.id} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 disabled:opacity-40">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p className="py-6 text-center text-[12px] text-[#7a9ab8]">No knowledge rows match. The agent saves rows here as it works (web search results, critiques, publishes).</p>
        )}
      </div>
    </div>
  );
};

export default KnowledgePage;