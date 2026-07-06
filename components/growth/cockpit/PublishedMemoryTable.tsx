import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAdminApi } from "../../../lib/growth/adminApi";
// Type-only import: publishedMemory.ts is server-only (imports supabaseAdmin), so
// we never value-import from it client-side. `import type` is erased at compile →
// the service-role module is never pulled into the client bundle.
import type { PublishedMemoryItem } from "../../../lib/growth/publishedMemory";

/** Client-side mirror of syndicationSummary (lib/growth/publishedMemory.ts) — kept
 *  here to avoid a value import of the server-only module. Stays in sync with the
 *  server helper. */
function syndicationSummary(item: PublishedMemoryItem): { deposited: boolean; platforms: string[] } {
  const platforms: string[] = [];
  if (item.devto.status) platforms.push("devto");
  if (item.hashnode.status) platforms.push("hashnode");
  if (item.medium.status) platforms.push("medium");
  return { deposited: platforms.length > 0, platforms };
}

/**
 * Cockpit — native "Published Memory" table. One row per published article, joined
 * across published_articles + growth_syndication + growth_drafts (linkedin) by slug
 * via GET /api/growth/published-memory (the read-only growth_published_memory view).
 *
 * HONEST: the LinkedIn column shows "posted manually" (status only) — the share-
 * template flow never persists the final post URL, so we never render a fake
 * clickable LinkedIn link. measured_at is LinkedIn outcomes only; article SEO lives
 * in growth_pages via the audit runner, surfaced on the Performance page.
 *
 * Clicking a row opens the right inspector drawer with the cross-platform state.
 */
interface MemResp { ok: boolean; configured?: boolean; items: PublishedMemoryItem[]; error?: string }

const PublishedMemoryTable: React.FC<{ onSelectItem: (item: PublishedMemoryItem) => void; selectedSlug?: string | null }> = ({ onSelectItem, selectedSlug }) => {
  const { fetchJson } = useAdminApi();
  const [items, setItems] = useState<PublishedMemoryItem[]>([]);
  const [configured, setConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchJson<MemResp>("/api/growth/published-memory?limit=200");
    setError(error);
    setItems(data?.items ?? []);
    setConfigured(data?.configured ?? false);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Published Memory · what&apos;s published where</h2>
        <button onClick={load} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Refresh</button>
      </div>
      {!configured && <p className="mt-3 text-[11px] text-amber-300">Database not configured — no published memory yet. Wire Supabase env (see Settings).</p>}
      {loading && <p className="mt-3 text-[12px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-3 text-[12px] text-rose-300">Failed to load: {error}</p>}
      {!loading && !error && configured && items.length === 0 && <p className="mt-3 text-[12px] text-[#7a9ab8]">No published articles yet.</p>}

      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-white/[0.03] text-left text-[10px] uppercase tracking-wide text-[#7a9ab8]">
                <th className="px-3 py-2 font-semibold">Article</th>
                <th className="px-3 py-2 font-semibold">InBharat</th>
                <th className="px-3 py-2 font-semibold">DEV.to</th>
                <th className="px-3 py-2 font-semibold">Hashnode</th>
                <th className="px-3 py-2 font-semibold">Medium</th>
                <th className="px-3 py-2 font-semibold">LinkedIn</th>
                <th className="px-3 py-2 font-semibold">Published</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const sym = syndicationSummary(it);
                return (
                  <tr
                    key={it.slug}
                    onClick={() => onSelectItem(it)}
                    className={`cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.03] ${selectedSlug === it.slug ? "bg-[#f59f4f]/[0.07]" : ""}`}
                  >
                    <td className="max-w-[260px] px-3 py-2">
                      <p className="truncate font-semibold text-[#dde6f2]">{it.title}</p>
                      <p className="truncate text-[10px] text-[#5f7c98]">{it.slug}</p>
                      {sym.deposited && <span className="mt-0.5 inline-block rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-bold uppercase text-sky-300">cross-posted · {sym.platforms.length}</span>}
                    </td>
                    <td className="px-3 py-2"><PlatCell url={it.canonicalUrl} status="live" label="live" /></td>
                    <td className="px-3 py-2"><PlatCell url={it.devto.url} status={it.devto.status} /></td>
                    <td className="px-3 py-2"><PlatCell url={it.hashnode.url} status={it.hashnode.status} /></td>
                    <td className="px-3 py-2"><PlatCell url={it.medium.url} status={it.medium.status} /></td>
                    <td className="px-3 py-2"><PlatCell url={null} status={it.linkedin.status} manualLabel="posted manually" /></td>
                    <td className="px-3 py-2 text-[10px] text-[#7a9ab8]">{it.publishDate ? new Date(it.publishDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.length > 0 && (
        <p className="mt-2 text-[10px] text-[#5f7c98]">
          {items.length} article{items.length === 1 ? "" : "s"}. LinkedIn shows &quot;posted manually&quot; honestly — the share-template flow never persists the post URL.
          {items.some((i) => i.measuredAt) ? " measured_at = LinkedIn outcomes only." : ""}
        </p>
      )}
    </div>
  );
};

const PlatCell: React.FC<{ url: string | null; status: string | null | undefined; label?: string; manualLabel?: string }> = ({ url, status, label, manualLabel }) => {
  if (!status && !label) return <span className="text-[10px] text-[#5f7c98]">—</span>;
  const isOk = label === "live" || status === "published" || status === "draft" || status === "manual";
  const display = label ?? (status === "manual" && manualLabel ? manualLabel : status ?? "—");
  const inner = (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${isOk ? "bg-emerald-500/15 text-emerald-300" : status === "failed" ? "bg-rose-500/15 text-rose-300" : "bg-slate-500/15 text-slate-300"}`}>
      {display}
    </span>
  );
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:underline">
        {inner}
        <ExternalLink size={9} className="text-[#7a9ab8]" />
      </a>
    );
  }
  return inner;
};

export default PublishedMemoryTable;