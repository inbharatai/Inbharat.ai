import React, { useEffect, useState } from "react";

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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [auditMsg, setAuditMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/growth/status", { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data: StatusResp = await r.json();
        setAssets(data.assets || []);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAudit(domain: string) {
    setBusy(domain);
    setAuditMsg((m) => ({ ...m, [domain]: "Auditing…" }));
    try {
      const token = (window as any).__growthAccessToken;
      const res = await fetch("/api/growth/audit", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const run = data?.run;
      setAuditMsg((m) => ({
        ...m,
        [domain]: `Done — ${run?.pagesCount ?? 0} pages · avg SEO ${run?.avgSeoScore ?? "—"} · avg GEO ${run?.avgGeoScore ?? "—"}`,
      }));
    } catch (e) {
      setAuditMsg((m) => ({ ...m, [domain]: `Failed: ${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sites;