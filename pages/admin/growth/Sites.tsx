import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface Asset {
  domain: string;
  name: string;
  status: string;
  canCrawl: boolean;
  canAudit: boolean;
  canDraft: boolean;
  canCreatePR: boolean;
  requiresHumanApproval: boolean;
}

interface StatusResp {
  ok: boolean;
  assets?: Asset[];
  requestId?: string;
}

const Sites: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [auditMsg, setAuditMsg] = useState<Record<string, string>>({});
  // per-domain discovery counts + last-run message
  const [discovery, setDiscovery] = useState<Record<string, { discovered: number; new: number; changed: number; orphaned: number }>>({});
  const [discoveryMsg, setDiscoveryMsg] = useState<Record<string, string>>({});
  const [discoveryBusy, setDiscoveryBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchJson<StatusResp>("/api/growth/status");
      if (cancelled) return;
      if (error) setError(error);
      else setAssets(data?.assets || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchJson]);

  async function runAudit(domain: string) {
    setBusy(domain);
    setAuditMsg((m) => ({ ...m, [domain]: "Auditing…" }));
    const { data, error } = await fetchJson<{ run?: { pagesCount?: number; avgSeoScore?: number; avgGeoScore?: number } }>(
      "/api/growth/audit",
      { method: "POST", body: JSON.stringify({ domain }) },
    );
    const run = data?.run;
    setAuditMsg((m) => ({
      ...m,
      [domain]: error
        ? `Failed: ${error}`
        : `Done — ${run?.pagesCount ?? 0} pages · avg SEO ${run?.avgSeoScore ?? "—"} · avg GEO ${run?.avgGeoScore ?? "—"}`,
    }));
    setBusy(null);
  }

  async function runDiscovery(domain: string) {
    setDiscoveryBusy(domain);
    setDiscoveryMsg((m) => ({ ...m, [domain]: "Discovering…" }));
    const { data, error } = await fetchJson<{
      discovered?: string[];
      new?: string[];
      changed?: { url: string; field: string; before: unknown; after: unknown }[];
      orphaned?: { url: string; reason: string }[];
    }>("/api/growth/discovery", { method: "POST", body: JSON.stringify({ domain }) });
    if (error) {
      setDiscoveryMsg((m) => ({ ...m, [domain]: `Failed: ${error}` }));
    } else {
      const d = {
        discovered: data?.discovered?.length ?? 0,
        new: data?.new?.length ?? 0,
        changed: data?.changed?.length ?? 0,
        orphaned: data?.orphaned?.length ?? 0,
      };
      setDiscovery((s) => ({ ...s, [domain]: d }));
      setDiscoveryMsg((m) => ({
        ...m,
        [domain]: `Done — ${d.new} new · ${d.changed} changed · ${d.orphaned} orphaned (of ${d.discovered} in sitemap)`,
      }));
    }
    setDiscoveryBusy(null);
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;
  if (error) return <p className="text-[13px] text-rose-300">Failed to load: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Authorized sites</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Only these domains may be crawled and audited. Each must allow human approval; publishing is never automatic.
      </p>

      <div className="mt-6 space-y-3">
        {assets.map((a) => (
          <div key={a.domain} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-white">{a.name}</p>
                <p className="text-[12px] text-[#7a9ab8]">{a.domain}</p>
                <p className="mt-2 text-[11px] text-[#5f7c98]">
                  crawl:{a.canCrawl ? "✓" : "✗"} · audit:{a.canAudit ? "✓" : "✗"} · draft:{a.canDraft ? "✓" : "✗"} · PR:{a.canCreatePR ? "✓" : "✗"} · human-approve:{a.requiresHumanApproval ? "✓" : "✗"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                  a.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
                ].join(" ")}>
                  {a.status}
                </span>
                <button
                  onClick={() => runAudit(a.domain)}
                  disabled={!a.canAudit || busy === a.domain}
                  className="rounded-lg bg-[#f59f4f] px-3.5 py-1.5 text-[12px] font-semibold text-[#0a0c10] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy === a.domain ? "Running…" : "Run audit"}
                </button>
              </div>
            </div>
            {auditMsg[a.domain] && (
              <p className="mt-3 text-[12px] text-[#9fb2c6]">{auditMsg[a.domain]}</p>
            )}

            {/* Phase 3 — full-site discovery panel */}
            <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Full-site discovery</p>
                  <p className="text-[11px] text-[#5f7c98]">Sitemap-driven: finds new, changed, and orphaned pages vs. last audit.</p>
                </div>
                <button
                  onClick={() => runDiscovery(a.domain)}
                  disabled={!a.canCrawl || discoveryBusy === a.domain}
                  className="rounded-md border border-[#f59f4f]/40 px-3 py-1.5 text-[11px] font-semibold text-[#f59f4f] transition-colors hover:bg-[#f59f4f]/10 disabled:opacity-40"
                >
                  {discoveryBusy === a.domain ? "Running…" : "Run discovery"}
                </button>
              </div>
              {discovery[a.domain] && (
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "in sitemap", val: discovery[a.domain].discovered, cls: "text-white" },
                    { label: "new", val: discovery[a.domain].new, cls: "text-emerald-300" },
                    { label: "changed", val: discovery[a.domain].changed, cls: "text-amber-300" },
                    { label: "orphaned", val: discovery[a.domain].orphaned, cls: "text-rose-300" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md border border-white/10 bg-[#0a0f18] py-1.5">
                      <p className={`text-[15px] font-bold ${s.cls}`}>{s.val}</p>
                      <p className="text-[9px] uppercase tracking-wide text-[#5f7c98]">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {discoveryMsg[a.domain] && (
                <p className="mt-2 text-[11px] text-[#9fb2c6]">{discoveryMsg[a.domain]}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sites;