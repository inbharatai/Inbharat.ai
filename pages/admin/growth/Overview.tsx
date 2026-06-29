import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * Growth Agent — live ops dashboard ("what's going on").
 *
 * Pulls a single snapshot from /api/growth/insights: last cron run, page/task/
 * draft/approval counts, this-month spend vs cap, a recent-activity feed, and
 * integration health. The "Run daily audit now" button POSTs /api/growth/cron/daily
 * (the admin trigger path in authorizeCron) so the founder can run the agent on
 * demand and see per-domain results without waiting for the 06:17 UTC cron.
 */
interface LastCronRun {
  domain: string;
  status: string;
  pages: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}
interface InsightsResp {
  ok: boolean;
  configured?: boolean;
  lastCronRun?: LastCronRun | null;
  counts?: {
    pages: number;
    openTasks: number;
    draftsByStatus: Record<string, number>;
    approvalsThisMonth: number;
  };
  spend?: { spentUsd: number; capUsd: number; projectedUsd: number; remainingUsd: number; source: string };
  recentActivity?: { type: string; detail: string; createdAt: string }[];
  integrations?: { gemini: boolean; growthOpenai: boolean; supabase: boolean; cronSecret: boolean; ga4: boolean; gsc: boolean };
  error?: string;
}
interface CronResult {
  domain: string;
  status: string;
  pages?: number;
  promoted?: number;
  error?: string;
}
interface CronResp {
  ok: boolean;
  trigger?: string;
  results?: CronResult[];
  error?: string;
}

const ACTIVITY_COLOR: Record<string, string> = {
  cron: "text-[#f59f4f]",
  draft: "text-sky-300",
  approval: "text-emerald-300",
  error: "text-rose-300",
};

function fmtUsd(n: number): string {
  return `$${(n || 0).toFixed(n && n < 10 ? 4 : 2)}`;
}
function fmtRel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

const Overview: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [data, setData] = useState<InsightsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CronResult[] | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: body, error } = await fetchJson<InsightsResp>("/api/growth/insights");
    if (error && !body) setError(error);
    else setError(null);
    setData(body);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    setRunResult(null);
    const { data: body, error } = await fetchJson<CronResp>("/api/growth/cron/daily", { method: "POST" });
    setRunning(false);
    if (error) {
      setRunMsg(`Run failed: ${error}`);
      return;
    }
    setRunResult(body?.results ?? []);
    setRunMsg(body?.results?.length ? `Run complete (${body.trigger}) — ${body.results.filter((r) => r.status !== "failed").length} OK.` : "Run complete — no authorized domains to audit.");
    await load();
  }

  const counts = data?.counts;
  const spend = data?.spend;
  const drafts = counts?.draftsByStatus ?? {};
  const pendingDrafts = drafts.pending ?? 0;
  const integrations = data?.integrations;
  const lastRun = data?.lastCronRun;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            The InBharat Growth Agent audits SEO + GEO (AI-search readiness) for authorized sites only. It drafts content
            and covers, but <span className="font-semibold text-[#f59f4f]">never publishes without your approval</span> —
            a one-click publish commits the article + cover straight to GitHub <code className="text-[#f59f4f]">main</code>,
            which Vercel auto-rebuilds. No pull requests, no auto-ships.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[12.5px] font-semibold text-[#0a0c10] disabled:opacity-40"
          title="Trigger the daily audit now (the same job the cron runs at 06:17 UTC)"
        >
          {running ? "Running…" : "Run daily audit now"}
        </button>
      </div>

      {loading && <p className="mt-6 text-[13px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-rose-300">Failed to load: {error}</p>}
      {runMsg && <p className="mt-3 text-[12px] text-[#9fb2c6]">{runMsg}</p>}

      {/* Status cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Last cron run"
          value={lastRun ? lastRun.status : "never"}
          hint={lastRun ? `${lastRun.pages} pages · ${fmtRel(lastRun.startedAt)}` : "not run yet"}
          tone={lastRun?.status === "completed" ? "ok" : lastRun?.status === "failed" ? "bad" : "neutral"}
        />
        <Stat label="Pages audited" value={String(counts?.pages ?? 0)} hint="across all sites" />
        <Stat label="Open issues" value={String(counts?.openTasks ?? 0)} hint="from audits" tone={(counts?.openTasks ?? 0) > 0 ? "warn" : "ok"} />
        <Stat label="Pending drafts" value={String(pendingDrafts)} hint="awaiting review" tone={pendingDrafts > 0 ? "warn" : "ok"} />
        <Stat label="Approvals" value={String(counts?.approvalsThisMonth ?? 0)} hint="this month" tone={(counts?.approvalsThisMonth ?? 0) > 0 ? "ok" : "neutral"} />
        <Stat
          label="This month"
          value={spend ? `${fmtUsd(spend.spentUsd)} / ${fmtUsd(spend.capUsd)}` : "—"}
          hint={spend ? `projected ${fmtUsd(spend.projectedUsd)}` : ""}
          tone={spend && spend.projectedUsd > spend.capUsd ? "bad" : "ok"}
        />
      </div>

      {pendingDrafts > 0 && (
        <p className="mt-3 text-[12px] text-[#9fb2c6]">
          {pendingDrafts} promotion draft{pendingDrafts === 1 ? "" : "s"} awaiting your review on the{" "}
          <Link to="/admin/growth/issues" className="text-[#f59f4f] hover:underline">Issues tab</Link>.
        </p>
      )}

      {/* Run-now result */}
      {runResult && runResult.length > 0 && (
        <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Latest run — per domain</h2>
          <ul className="mt-3 space-y-2">
            {runResult.map((r) => (
              <li key={r.domain} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[12.5px]">
                <span className="font-semibold text-white">{r.domain}</span>
                <span className={r.status === "failed" ? "text-rose-300" : "text-emerald-300"}>
                  {r.status === "failed" ? `failed — ${r.error || "error"}` : `${r.pages ?? 0} pages · ${r.promoted ?? 0} drafted`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Integration health */}
      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Integration health</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <Dot label="Gemini" ok={integrations?.gemini} />
          <Dot label="OpenAI (growth)" ok={integrations?.growthOpenai} />
          <Dot label="Supabase" ok={integrations?.supabase} />
          <Dot label="Cron secret" ok={integrations?.cronSecret} />
          <Dot label="GA4" ok={integrations?.ga4} />
          <Dot label="GSC" ok={integrations?.gsc} />
        </div>
        <p className="mt-3 text-[11px] text-[#5f7c98]">
          Booleans only — secret values never leave the server. Wire missing integrations in Vercel env (see Settings).
        </p>
      </section>

      {/* Recent activity */}
      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Recent activity</h2>
        <ul className="mt-3 space-y-2">
          {(data?.recentActivity ?? []).length === 0 && <li className="text-[12px] text-[#7a9ab8]">No recent activity.</li>}
          {(data?.recentActivity ?? []).map((a, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
              <span className={`text-[12.5px] ${ACTIVITY_COLOR[a.type] ?? "text-[#c8d6e8]"}`}>{a.detail}</span>
              <span className="text-[11px] text-[#5f7c98]">{fmtRel(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint: string; tone?: "ok" | "warn" | "bad" | "neutral" }> = ({ label, value, hint, tone }) => {
  const color = tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-white" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[#7a9ab8]">{label}</p>
      <p className={`mt-1.5 text-base font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#5f7c98]">{hint}</p>
    </div>
  );
};

const Dot: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <span className="flex items-center gap-2 text-[12.5px] text-[#c8d6e8]">
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-500/70"}`} />
    {label}
  </span>
);

export default Overview;