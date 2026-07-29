import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  FileText,
  RefreshCw,
  TrendingUp,
  Wallet,
  Globe,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Send,
  Image as ImageIcon,
} from "lucide-react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import {
  computeActions,
  computeAlerts,
  type InsightsShape,
  type PipelineShape,
  type TodayAction,
} from "../../../lib/growth/cockpit/todayCommand";

/**
 * Cockpit "Today Command" — the live, prioritized "what to do now" surface on the
 * index route's Today tab. Reuses two existing endpoints only (no new backend):
 *   • GET /api/growth/insights  — counts, stuckRuns, lastCronRun, integrations, recentActivity
 *   • GET /api/growth/pipeline  — today's article / LinkedIn / cover draft statuses
 *
 * It turns those raw signals into a ranked Recommended Next Actions list + an
 * Errors & alerts strip, plus two on-demand toolbar actions ("Sync analytics" →
 * POST /api/growth/performance, "Run daily audit" → POST /api/growth/cron/daily).
 * Nothing here publishes anything; the action rows deep-link to the human-gated
 * review surfaces. Honest empty state — no fabricated metrics.
 *
 * The pure derivation lives in lib/growth/cockpit/todayCommand.ts (React-free,
 * hermetically tested). This component only fetches + renders + attaches icons.
 */

type InsightsResp = InsightsShape & { ok: boolean; error?: string };
type PipelineResp = PipelineShape & { ok: boolean; error?: string };

const ICON_BY_KEY: Record<string, React.ComponentType<{ size?: number }>> = {
  file: FileText,
  send: Send,
  image: ImageIcon,
  globe: Globe,
  alert: AlertTriangle,
  bar: BarChart3,
  wallet: Wallet,
  trend: TrendingUp,
};

const TodayCommand: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [insights, setInsights] = useState<InsightsResp | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ins, pip] = await Promise.all([
      fetchJson<InsightsResp>("/api/growth/insights"),
      fetchJson<PipelineResp>("/api/growth/pipeline"),
    ]);
    setInsights(ins.data);
    setPipeline(pip.data);
    setError(ins.error || pip.error || (ins.data?.error ?? null) || (pip.data?.error ?? null));
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { load(); }, [load]);

  async function runTool(label: string, path: string, body?: Record<string, unknown>) {
    setToolBusy(true);
    setToolMsg(`${label}…`);
    const { data, error } = await fetchJson<{ ok: boolean; error?: string; configured?: boolean }>(path, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
    setToolBusy(false);
    if (error || !data?.ok) {
      setToolMsg(`${label} failed: ${error || data?.error || "unknown"}`);
      return;
    }
    setToolMsg(`${label} done ✓`);
    void load();
  }

  const actions: TodayAction[] = computeActions(insights, pipeline);
  const alerts = computeAlerts(insights);

  return (
    <div className="space-y-4">
      {/* Toolbar: on-demand ops + refresh. Nothing here publishes content. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => runTool("Sync analytics", "/api/growth/performance", { days: 28 })}
          disabled={toolBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-[#c0cfe0] disabled:opacity-40 hover:border-white/20 hover:text-white"
        >
          <BarChart3 size={13} /> Sync analytics
        </button>
        <button
          onClick={() => runTool("Run daily audit", "/api/growth/cron/daily")}
          disabled={toolBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-[#c0cfe0] disabled:opacity-40 hover:border-white/20 hover:text-white"
        >
          <RefreshCw size={13} /> Run daily audit
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-[#c0cfe0] disabled:opacity-40 hover:bg-white/[0.06]"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        {toolMsg && <span className="text-[11px] text-[#9fb2c6]">{toolMsg}</span>}
      </div>

      {loading && <p className="text-[12px] text-[#7a9ab8]">Loading today’s command…</p>}
      {error && !loading && <p className="text-[12px] text-rose-300">Failed to load: {error}</p>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recommended next actions */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Recommended next actions</h2>
            {actions.length === 0 ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-emerald-300/80">
                <CheckCircle2 size={14} /> Nothing waiting on you — the pipeline is clear.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {actions.map((a) => {
                  const Icon = ICON_BY_KEY[a.iconKey] ?? FileText;
                  return (
                    <li key={a.id}>
                      <Link to={a.to} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
                        <Icon size={15} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-[#dde6f2]">{a.label}</span>
                          {a.hint && <span className="block truncate text-[10.5px] text-[#7a9ab8]">{a.hint}</span>}
                        </span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.priority === "high" ? "bg-rose-400" : a.priority === "medium" ? "bg-amber-400" : "bg-sky-400"}`} />
                        <ArrowRight size={13} className="shrink-0 text-[#7a9ab8] transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Errors & alerts */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Errors &amp; alerts</h2>
            {alerts.length === 0 ? (
              <p className="mt-3 text-[12px] text-[#7a9ab8]">No errors or alerts in the recent window.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {alerts.map((al) => (
                  <li key={al.id} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]">
                    <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${al.severity === "error" ? "text-rose-400" : "text-amber-400"}`} />
                    <span className="text-[#c8d6e8]">{al.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* Integration health dots — booleans only, never secrets. */}
            {insights?.integrations && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3 text-[10px]">
                {(["gemini", "growthOpenai", "supabase", "ga4", "gsc", "cronSecret"] as const).map((k) => (
                  <span key={k} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${insights.integrations![k] ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${insights.integrations![k] ? "bg-emerald-400" : "bg-rose-400"}`} />
                    {k === "growthOpenai" ? "openai" : k === "cronSecret" ? "cron-secret" : k}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodayCommand;