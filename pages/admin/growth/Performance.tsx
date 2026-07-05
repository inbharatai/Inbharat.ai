import React, { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * /admin/growth/performance — Growth Analytics Inbox.
 *
 * Reads GA4 + Search Console (last 28d by default) + the recommendations saved
 * by the last sync. The "Sync Analytics" button pulls fresh data and stores
 * insights to the knowledge base (so the agent retrieves them before drafting).
 * Graceful "connect credentials" state when the Google service account isn't
 * configured. No charts — tables + insight cards, kept simple and actionable.
 *
 * Credentials never reach any AI model; the service-account key is used only
 * server-side to mint an OAuth token for the Google APIs.
 */
interface GscTotals { clicks: number; impressions: number; ctr: number; position: number; }
interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number; }
interface Ga4Totals { sessions: number; totalUsers: number; screenPageViews: number; averageSessionDuration: number; }
interface Ga4PageRow { path: string; screenPageViews: number; sessions?: number; users?: number; }
interface Ga4DimRow { key: string; sessions: number; }
interface Ga4Report { totals: Ga4Totals; topPages: Ga4PageRow[]; byCountry: Ga4DimRow[]; byDevice: Ga4DimRow[]; bySource: Ga4DimRow[]; totalsOk?: boolean; }
interface GscReport { totals: GscTotals; topQueries: GscRow[]; topPages: GscRow[]; queryByPage: GscRow[]; }
interface Snapshot {
  configured: boolean;
  range: { days: number; start: string; end: string };
  ga4?: Ga4Report;
  gsc?: GscReport;
  error?: string;
}
interface InsightItem {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  relatedProduct: string | null;
  intentScore: number | null;
  linkedArticleId: string | null;
  keywords: string[];
  createdAt: string;
}
interface PerfResp {
  ok: boolean;
  snapshot: Snapshot;
  summary: string;
  insights: InsightItem[];
  lastSyncAt: string | null;
  error?: string;
}
interface SyncResp {
  ok: boolean;
  sync: {
    ok: boolean;
    configured: boolean;
    insights: number;
    synced: number;
    errors: number;
    summary: string;
    error?: string;
  };
  error?: string;
}

type Tab = "summary" | "top_pages" | "top_queries" | "low_ctr" | "recommendations";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "top_pages", label: "Top pages" },
  { id: "top_queries", label: "Top queries" },
  { id: "low_ctr", label: "Low-CTR opportunities" },
  { id: "recommendations", label: "Recommendations" },
];

const Performance: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [data, setData] = useState<PerfResp | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: body, error } = await fetchJson<PerfResp>("/api/growth/performance");
    if (error) setError(error);
    else setData(body);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { void load(); }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    const { data: body, error } = await fetchJson<SyncResp>("/api/growth/performance", {
      method: "POST",
      body: JSON.stringify({ days: 28 }),
    });
    setSyncing(false);
    if (error) { setSyncMsg(`Sync failed: ${error}`); return; }
    const s = body?.sync;
    if (!s?.configured) { setSyncMsg("Analytics isn't configured — add the Google service-account credentials in Vercel env, then retry."); return; }
    setSyncMsg(s.error ? `Synced ${s.synced} of ${s.insights} insights (partial: ${s.error})` : `Synced ${s.synced} of ${s.insights} insights to the knowledge base. ${s.summary}`);
    void load(); // refresh the insights + lastSyncAt
  }, [fetchJson, load]);

  if (loading && !data) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;
  if (error && !data) return (
    <div>
      <p className="text-[13px] text-rose-300">Failed: {error}</p>
      <button onClick={() => load()} className="mt-3 rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30">Retry</button>
    </div>
  );

  const snap = data?.snapshot;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            Google Analytics 4 + Search Console, last {snap?.range.days ?? 28} days. Credentials are configured server-side and
            never sent to any AI model. Insights sync to the knowledge base so the agent drafts data-driven.
          </p>
          {data?.lastSyncAt && (
            <p className="mt-1 text-[11px] text-[#7a9ab8]">Last sync: {new Date(data.lastSyncAt).toLocaleString()}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => sync()} disabled={syncing}
            className="rounded-md border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f59f4f] hover:border-[#f59f4f]/60 disabled:opacity-40">
            {syncing ? "Syncing…" : "Sync Analytics"}
          </button>
          <button onClick={() => load()} disabled={loading}
            className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30 disabled:opacity-40">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && data && <p className="mt-4 text-[13px] text-rose-300">Refresh failed: {error}</p>}
      {syncMsg && (
        <p className={`mt-4 text-[13px] ${syncMsg.startsWith("Sync failed") || syncMsg.startsWith("Analytics isn't") ? "text-rose-300" : "text-[#9fb2c6]"}`}>{syncMsg}</p>
      )}

      {snap && !snap.configured && (
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Not configured</h2>
          <p className="mt-3 text-[13px] text-[#9fb2c6]">
            Add the Google service-account credentials in the Vercel env to enable this panel + the daily analytics sync:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[11px] leading-[1.7] text-[#c8d6e8]">{`GA4_PROPERTY_ID=543156835
GSC_SITE_URL=sc-domain:inbharat.ai
GOOGLE_CLIENT_EMAIL=your-sa@inbharat.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"`}</pre>
          <p className="mt-3 text-[12px] text-[#7a9ab8]">
            Then add the service-account email as a Viewer in GA4 property 543156835 and as a user in the Search Console
            property <code className="text-[#f59f4f]">sc-domain:inbharat.ai</code>. The private key is a secret — set it in the
            Vercel dashboard, never in chat or git.
          </p>
        </div>
      )}

      {snap?.error && snap.configured && (
        <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[12px] text-amber-200/90">
          Partial sync — some Google calls failed: {snap.error}
        </p>
      )}

      {snap?.configured && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <TotalsPanel title="Google Analytics 4" range={snap.range.start + "…" + snap.range.end} rows={
              snap.ga4 ? [
                ["Users", snap.ga4.totals.totalUsers],
                ["Sessions", snap.ga4.totals.sessions],
                ["Pageviews", snap.ga4.totals.screenPageViews],
                ["Avg session (s)", snap.ga4.totals.averageSessionDuration ? Number(snap.ga4.totals.averageSessionDuration).toFixed(1) : null],
              ] : []
            } note={!snap.ga4 || snap.ga4.totalsOk === false ? "GA4 data unavailable this window (the report failed — likely the service account isn't a Viewer on the property yet)." : undefined} />
            <TotalsPanel title="Google Search Console" range={snap.range.start + "…" + snap.range.end} rows={
              snap.gsc ? [
                ["Clicks", snap.gsc.totals.clicks],
                ["Impressions", snap.gsc.totals.impressions],
                ["CTR", snap.gsc.totals.ctr != null ? `${(snap.gsc.totals.ctr * 100).toFixed(2)}%` : null],
                ["Avg position", snap.gsc.totals.position != null ? snap.gsc.totals.position.toFixed(1) : null],
              ] : []
            } note={!snap.gsc ? "GSC data unavailable this window." : undefined} />
          </div>

          <div className="mt-6 flex flex-wrap gap-1.5 border-b border-white/[0.06] pb-2">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${tab === t.id ? "bg-[#f59f4f]/10 text-[#f59f4f] ring-1 ring-[#f59f4f]/30" : "text-[#9fb2c6] hover:bg-white/[0.04] hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "summary" && <SummaryTab snap={snap} />}
            {tab === "top_pages" && <TopPagesTab snap={snap} />}
            {tab === "top_queries" && <TopQueriesTab snap={snap} />}
            {tab === "low_ctr" && <LowCtrTab snap={snap} />}
            {tab === "recommendations" && <RecommendationsTab insights={data?.insights ?? []} />}
          </div>
        </>
      )}
    </div>
  );
};

const TotalsPanel: React.FC<{ title: string; range: string; rows: [string, unknown][]; note?: string }> = ({ title, range, rows, note }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <div className="flex items-center justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">{title}</h2>
      <span className="text-[10px] text-[#7a9ab8]">{range}</span>
    </div>
    {note ? <p className="mt-3 text-[12px] text-[#9fb2c6]">{note}</p> : (
      <dl className="mt-3 divide-y divide-white/[0.04]">
        {rows.map(([k, v]) => (
          <div key={String(k)} className="flex items-center justify-between py-1.5">
            <dt className="text-[12px] text-[#9fb2c6]">{k}</dt>
            <dd className="text-[13px] font-semibold text-white">{v == null || v === "" ? "—" : String(v)}</dd>
          </div>
        ))}
      </dl>
    )}
  </div>
);

const Table: React.FC<{ headers: string[]; rows: React.ReactNode[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
    <table className="w-full text-left text-[12px]">
      <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.15em] text-[#7a9ab8]">
        <tr>{headers.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-white/[0.04]">
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-[#7a9ab8]">No data in this window.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i} className="text-[#c8d6e8]">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmt = (n: number, d = 1) => n.toFixed(d);
const slugTail = (url: string) => { const m = url.match(/\/learn-ai-with-reeturaj\/([^?#]+)/i); return m ? m[1].replace(/\/+$/, "") : url; };

const SummaryTab: React.FC<{ snap: Snapshot }> = ({ snap }) => {
  const rows: React.ReactNode[][] = [];
  if (snap.gsc) {
    for (const r of snap.gsc.topPages.slice(0, 5)) {
      rows.push([<span key="page" className="text-[#c8d6e8]">{slugTail(r.keys[0] ?? "")}</span>, String(r.clicks), String(r.impressions), pct(r.ctr), fmt(r.position)]);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Top pages (GSC)</h3>
        <Table headers={["Page", "Clicks", "Impressions", "CTR", "Pos"]} rows={rows} />
      </div>
      <div className="grid gap-4">
        <DimBlock title="Top countries" rows={snap.ga4?.byCountry ?? []} />
        <DimBlock title="Devices" rows={snap.ga4?.byDevice ?? []} />
        <DimBlock title="Traffic sources" rows={snap.ga4?.bySource ?? []} />
      </div>
    </div>
  );
};

const DimBlock: React.FC<{ title: string; rows: Ga4DimRow[] }> = ({ title, rows }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">{title}</h3>
    {rows.length === 0 ? <p className="mt-2 text-[12px] text-[#7a9ab8]">No data.</p> : (
      <ul className="mt-2 space-y-1">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key} className="flex items-center justify-between text-[12px]">
            <span className="text-[#c8d6e8]">{r.key || "(unset)"}</span>
            <span className="font-semibold text-white">{r.sessions}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const TopPagesTab: React.FC<{ snap: Snapshot }> = ({ snap }) => {
  const rows: React.ReactNode[][] = (snap.gsc?.topPages ?? []).map((r) => [
    <span key="page" className="text-[#c8d6e8]">{slugTail(r.keys[0] ?? "")}</span>,
    String(r.clicks), String(r.impressions), pct(r.ctr), fmt(r.position),
  ]);
  return <Table headers={["Page", "Clicks", "Impressions", "CTR", "Position"]} rows={rows} />;
};

const TopQueriesTab: React.FC<{ snap: Snapshot }> = ({ snap }) => {
  const rows: React.ReactNode[][] = (snap.gsc?.topQueries ?? []).map((r) => [
    <span key="query" className="text-[#c8d6e8]">{r.keys[0] ?? ""}</span>,
    String(r.clicks), String(r.impressions), pct(r.ctr), fmt(r.position),
  ]);
  return <Table headers={["Query", "Clicks", "Impressions", "CTR", "Position"]} rows={rows} />;
};

const LowCtrTab: React.FC<{ snap: Snapshot }> = ({ snap }) => {
  const rows: React.ReactNode[][] = (snap.gsc?.topPages ?? [])
    .filter((r) => r.impressions >= 200 && r.ctr < 0.02)
    .map((r) => [
      <span key="page" className="text-[#c8d6e8]">{slugTail(r.keys[0] ?? "")}</span>,
      String(r.impressions), pct(r.ctr), fmt(r.position),
      <span key="action" className="text-[#f59f4f]">Improve title + meta description</span>,
    ]);
  return (
    <div>
      <p className="mb-3 text-[12px] text-[#9fb2c6]">Pages with ≥200 impressions but &lt;2% CTR — improving the title/meta is usually the highest-leverage fix.</p>
      <Table headers={["Page", "Impressions", "CTR", "Position", "Action"]} rows={rows} />
    </div>
  );
};

const RecommendationsTab: React.FC<{ insights: InsightItem[] }> = ({ insights }) => {
  const analytics = insights.filter((i) => i.sourceType === "analytics" || i.sourceType === "search_console");
  if (analytics.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="text-[13px] text-[#9fb2c6]">No recommendations yet. Click <span className="text-[#f59f4f]">Sync Analytics</span> to pull fresh GA4 + Search Console data and generate content actions.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {analytics.map((i) => (
        <div key={i.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md bg-[#f59f4f]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#f59f4f]">
              {i.sourceType === "analytics" ? "GA4" : "GSC"} · {i.type}
            </span>
            <span className="text-[10px] text-[#7a9ab8]">priority {i.intentScore ?? "—"}</span>
          </div>
          <p className="mt-2 text-[13px] text-white">{i.title}</p>
          {i.summary && <p className="mt-1 text-[12px] text-[#9fb2c6]">{i.summary}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#7a9ab8]">
            {i.linkedArticleId && <span>article: <code className="text-[#c8d6e8]">{i.linkedArticleId}</code></span>}
            {i.relatedProduct && <span>product: {i.relatedProduct}</span>}
            {i.keywords.length > 0 && <span>query: <code className="text-[#c8d6e8]">{i.keywords[0]}</code></span>}
            {i.sourceUrl && <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="text-[#7a9ab8] underline hover:text-[#c8d6e8]">page ↗</a>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Performance;