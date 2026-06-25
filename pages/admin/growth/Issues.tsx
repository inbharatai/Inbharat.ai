import React, { useEffect, useState } from "react";

interface Issue {
  severity: "critical" | "high" | "normal" | "low";
  field: string;
  message: string;
  recommendedFix: string;
}

interface GrowthPageRow {
  url: string;
  domain: string;
  http_status: number | null;
  title: string | null;
  seo_score: number;
  geo_score: number;
  issues: Issue[];
  crawled_at: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300",
  high: "bg-orange-500/15 text-orange-300",
  normal: "bg-amber-500/15 text-amber-300",
  low: "bg-sky-500/15 text-sky-300",
};

const Issues: React.FC = () => {
  const [pages, setPages] = useState<GrowthPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/growth/pages", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPages(data.pages || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function auditUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAuditing(true);
    setAuditMsg(null);
    try {
      const res = await fetch("/api/growth/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setAuditMsg(`Audited ${url.trim()} — SEO ${data.page?.seoScore ?? "?"} · GEO ${data.page?.geoScore ?? "?"}`);
      await load();
    } catch (e) {
      setAuditMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setAuditing(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Issues</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Latest audited pages with SEO + GEO scores and prioritized recommendations.
      </p>

      <form onSubmit={auditUrl} className="mt-5 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://inbharat.ai/"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={auditing}
          className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[13px] font-semibold text-[#0a0c10] disabled:opacity-40"
        >
          {auditing ? "Auditing…" : "Audit URL"}
        </button>
      </form>
      {auditMsg && <p className="mt-2 text-[12px] text-[#9fb2c6]">{auditMsg}</p>}

      {loading && <p className="mt-6 text-[13px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-rose-300">Failed to load: {error}</p>}
      {!loading && !error && pages.length === 0 && (
        <p className="mt-6 text-[13px] text-[#7a9ab8]">No audited pages yet — run an audit from the Sites tab.</p>
      )}

      <div className="mt-6 space-y-4">
        {pages.map((p) => (
          <div key={p.url} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-white">{p.title || p.url}</p>
                <p className="truncate text-[12px] text-[#7a9ab8]">{p.url}</p>
              </div>
              <div className="flex gap-2">
                <Score label="SEO" value={p.seo_score} />
                <Score label="GEO" value={p.geo_score} />
              </div>
            </div>
            {p.issues && p.issues.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {p.issues.slice(0, 8).map((iss, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEV_COLOR[iss.severity] || "bg-slate-500/15 text-slate-300"}`}>
                      {iss.severity}
                    </span>
                    <span className="text-[#c8d6e8]"><b className="text-white">{iss.field}:</b> {iss.message} <span className="text-[#7a9ab8]">— {iss.recommendedFix}</span></span>
                  </li>
                ))}
                {p.issues.length > 8 && <li className="text-[11px] text-[#5f7c98]">+{p.issues.length - 8} more</li>}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const color = value >= 80 ? "text-emerald-300" : value >= 50 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wide text-[#7a9ab8]">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value ?? "—"}</p>
    </div>
  );
};

export default Issues;