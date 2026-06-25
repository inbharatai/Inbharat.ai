import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface MetricsResult {
  configured: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
interface PerfResp {
  ok: boolean;
  ga4?: MetricsResult;
  gsc?: MetricsResult;
  error?: string;
}

const Performance: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [data, setData] = useState<PerfResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: body, error } = await fetchJson<PerfResp>("/api/growth/performance");
      if (cancelled) return;
      if (error) setError(error);
      else setData(body);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchJson]);

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;
  if (error) return <p className="text-[13px] text-rose-300">Failed: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Performance</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Google Analytics 4 + Search Console, last 28 days. Credentials are configured server-side and
        never sent to any AI model.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Google Analytics 4" result={data?.ga4} rows={(d) => [
          ["Sessions", d.sessions],
          ["Users", d.totalUsers],
          ["Pageviews", d.screenPageViews],
          ["Avg session (s)", d.averageSessionDuration ? Number(d.averageSessionDuration).toFixed(1) : null],
          ["Range", d.range],
        ]} />
        <Panel title="Google Search Console" result={data?.gsc} rows={(d) => [
          ["Clicks", d.clicks],
          ["Impressions", d.impressions],
          ["CTR", d.ctr != null ? `${(Number(d.ctr) * 100).toFixed(2)}%` : null],
          ["Position", d.position != null ? Number(d.position).toFixed(1) : null],
          ["Range", d.range],
        ]} />
      </div>
    </div>
  );
};

const Panel: React.FC<{
  title: string;
  result?: MetricsResult;
  rows: (d: Record<string, unknown>) => [string, unknown][];
}> = ({ title, result, rows }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">{title}</h2>
    {!result?.configured && (
      <p className="mt-3 text-[13px] text-[#9fb2c6]">Not configured. Add the service-account credentials
        (<code className="text-[#f59f4f]">GA4_*</code> / <code className="text-[#f59f4f]">GSC_*</code>) in the
        Vercel env to enable this panel.</p>
    )}
    {result?.configured && result.error && (
      <p className="mt-3 text-[13px] text-rose-300">Error: {result.error}</p>
    )}
    {result?.configured && result.data && !result.error && (
      <dl className="mt-3 divide-y divide-white/[0.04]">
        {rows(result.data).map(([k, v]) => (
          <div key={String(k)} className="flex items-center justify-between py-1.5">
            <dt className="text-[12px] text-[#9fb2c6]">{k}</dt>
            <dd className="text-[13px] font-semibold text-white">{v == null || v === "" ? "—" : String(v)}</dd>
          </div>
        ))}
      </dl>
    )}
  </div>
);

export default Performance;