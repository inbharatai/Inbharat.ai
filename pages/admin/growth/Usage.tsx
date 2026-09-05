import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * Growth Agent — API usage dashboard (the centerpiece).
 *
 * Answers the founder's two questions: "which AI API is used where?" and "how
 * much is it costing?". Reads /api/growth/usage (model spend + tokens broken
 * down by provider / model / task / article / day) and /api/growth/budget (the
 * live monthly cap). The budget editor PATCHes /api/growth/budget — changes
 * take effect on the next withinBudget() check, no redeploy. All charts are
 * dependency-free CSS bars (consistent with the lean stack).
 */
interface Bucket {
  key: string;
  calls: number;
  tokens: number;
  costUsd: number;
  provider?: string;
  pctSpend?: number;
}
interface RecentCall {
  model: string | null;
  provider: string;
  task: string | null;
  contextUrl: string | null;
  totalTokens: number;
  costUsd: number;
  status: string | null;
  createdAt: string;
}
interface DayBucket {
  day: string;
  calls: number;
  tokens: number;
  costUsd: number;
}
interface MonthBlock {
  spentUsd: number;
  capUsd: number;
  projectedUsd: number;
  remainingUsd: number;
  source: "db" | "env" | "default";
}
interface UsageResp {
  ok: boolean;
  configured?: boolean;
  windowDays?: number;
  totals?: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    providers: number;
    models: number;
  };
  byProvider?: Bucket[];
  byModel?: Bucket[];
  byTask?: Bucket[];
  byArticle?: Bucket[];
  byDay?: DayBucket[];
  recent?: RecentCall[];
  month?: MonthBlock;
  error?: string;
}
interface BudgetResp extends MonthBlock {
  ok: boolean;
}

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  "openai (legacy)": "OpenAI (legacy)",
  unknown: "Unknown",
};
const PROVIDER_COLOR: Record<string, string> = {
  gemini: "#4285f4",
  "openai (legacy)": "#94a3b8",
  unknown: "#94a3b8",
};

function fmtUsd(n: number): string {
  return `$${(n || 0).toFixed(n && n < 10 ? 4 : 2)}`;
}
function fmtNum(n: number): string {
  return (n || 0).toLocaleString("en-IN");
}
function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function urlLabel(url: string | null): string {
  if (!url) return "(system)";
  // Shorten to the article slug / last path segment for the table.
  try {
    const u = new URL(url, "https://www.inbharat.ai");
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return seg || url;
  } catch {
    return url.length > 48 ? url.slice(0, 45) + "…" : url;
  }
}

const Usage: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [usage, setUsage] = useState<UsageResp | null>(null);
  const [budget, setBudget] = useState<BudgetResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [capInput, setCapInput] = useState("");
  // Seed the cap input only once (first successful budget fetch). The budget
  // endpoint is independent of the usage window, but `load(days)` re-runs on
  // every window-selector change — without this guard it would overwrite the
  // founder's in-progress edit each time they switched 7/14/30/60/90d.
  const didSeedCap = useRef(false);
  const [saving, setSaving] = useState(false);
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const load = useCallback(
    async (windowDays: number) => {
      setLoading(true);
      const [u, b] = await Promise.all([
        fetchJson<UsageResp>(`/api/growth/usage?days=${windowDays}`),
        fetchJson<BudgetResp>("/api/growth/budget"),
      ]);
      if (u.error && !u.data) setError(u.error);
      else setError(null);
      setUsage(u.data);
      setBudget(b.data);
      // Surface a budget-fetch failure separately so the spend header can warn the
      // founder that the cap shown may be stale (it falls back to usage.month).
      setBudgetError(b.error && !b.data ? b.error : null);
      if (b.data?.capUsd != null && !didSeedCap.current) {
        setCapInput(String(b.data.capUsd));
        didSeedCap.current = true;
      }
      setLoading(false);
    },
    [fetchJson],
  );

  useEffect(() => {
    load(days);
  }, [load, days]);

  async function saveBudget() {
    const val = Number(capInput);
    if (!Number.isFinite(val) || val < 1 || val > 500) {
      setBudgetMsg("Enter a number between $1 and $500.");
      return;
    }
    setSaving(true);
    setBudgetMsg(null);
    const { data, error } = await fetchJson<BudgetResp>("/api/growth/budget", {
      method: "PATCH",
      body: JSON.stringify({ monthlyBudgetUsd: val }),
    });
    setSaving(false);
    if (error) {
      setBudgetMsg(`Save failed: ${error}`);
      return;
    }
    setBudget(data);
    setBudgetMsg(`Monthly cap set to ${fmtUsd(data?.capUsd ?? val)} — takes effect immediately.`);
  }

  const month = budget ?? usage?.month;
  const totals = usage?.totals;
  const byProvider = usage?.byProvider ?? [];
  const byModel = usage?.byModel ?? [];
  const byTask = usage?.byTask ?? [];
  const byArticle = usage?.byArticle ?? [];
  const byDay = usage?.byDay ?? [];
  const recent = usage?.recent ?? [];
  const maxDayCost = Math.max(0.0001, ...byDay.map((d) => d.costUsd));
  const overBudget = month ? month.projectedUsd > month.capUsd : false;

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading usage…</p>;
  if (error && !usage) return <p className="text-[13px] text-rose-300">Failed to load: {error}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">API usage</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            Which AI API the Growth Agent called, where, and what it cost. Spend is capped by the monthly budget below —
            the agent stops calling paid models once the cap is reached.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#9fb2c6]">
          Window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] text-white focus:border-[#f59f4f]/50 focus:outline-none"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {usage?.configured === false && (
        <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-200">
          Supabase is not configured, so there is no usage to show yet. Once <code className="text-amber-300">SUPABASE_SERVICE_ROLE_KEY</code> is
          set in the Vercel env, model calls are logged here automatically.
        </p>
      )}

      {/* Spend header + budget editor */}
      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7a9ab8]">This month</p>
            <p className="mt-1 text-3xl font-black text-white">
              {fmtUsd(month?.spentUsd ?? 0)} <span className="text-[15px] font-semibold text-[#7a9ab8]">/ {fmtUsd(month?.capUsd ?? 0)}</span>
            </p>
            <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${overBudget ? "bg-rose-500" : "bg-[#f59f4f]"}`}
                style={{ width: `${Math.min(100, ((month?.spentUsd ?? 0) / Math.max(0.01, month?.capUsd ?? 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-[#9fb2c6]">
              Projected month-end <b className={overBudget ? "text-rose-300" : "text-white"}>{fmtUsd(month?.projectedUsd ?? 0)}</b> ·
              remaining <b className="text-white">{fmtUsd(month?.remainingUsd ?? 0)}</b>
              {overBudget && <span className="ml-1 text-rose-300">— on pace to exceed the cap</span>}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7a9ab8]">Monthly cap</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[14px] text-[#9fb2c6]">$</span>
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                className="w-24 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[14px] text-white focus:border-[#f59f4f]/50 focus:outline-none"
              />
              <button
                onClick={saveBudget}
                disabled={saving}
                className="rounded-md bg-[#f59f4f] px-3 py-1.5 text-[12px] font-semibold text-[#0a0c10] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-[#5f7c98]">Source: {month?.source ?? "default"} · $1–$500</p>
          </div>
        </div>
        {budgetMsg && <p className="mt-3 text-[12px] text-[#9fb2c6]">{budgetMsg}</p>}
        {budgetError && (
          <p className="mt-3 text-[12px] text-amber-300">
            Could not load the live monthly cap ({budgetError}). The figures above fall back to the usage window
            month block and may be stale — try Refresh.
          </p>
        )}
      </section>

      {/* Totals + provider split */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Total spend" big={fmtUsd(totals?.costUsd ?? 0)}>
          <Stat label="Calls" value={fmtNum(totals?.calls ?? 0)} />
          <Stat label="Tokens" value={fmtNum(totals?.totalTokens ?? 0)} />
          <Stat label="Models" value={String(totals?.models ?? 0)} />
        </Card>
        {byProvider.map((b) => (
          <Card key={b.key} title={PROVIDER_LABEL[b.key] ?? b.key} accent={PROVIDER_COLOR[b.key] ?? PROVIDER_COLOR.unknown}>
            <Stat label="Spend" value={fmtUsd(b.costUsd ?? 0)} />
            <Stat label="Share" value={`${b.pctSpend?.toFixed(1) ?? "0"}%`} />
            <Stat label="Tokens" value={fmtNum(b.tokens ?? 0)} />
          </Card>
        ))}
      </div>

      {/* Per-model table */}
      <Section title="Per model">
        <Table
          head={["Model", "Provider", "Calls", "Tokens", "Cost", "% spend"]}
          rows={byModel.map((m) => (
            <tr key={m.key} className="border-b border-white/[0.04] text-[#c8d6e8]">
              <td className={TD}><span className="font-mono text-[12px] text-white">{m.key}</span></td>
              <td className={TD}><span style={{ color: PROVIDER_COLOR[m.provider ?? "unknown"] }}>{PROVIDER_LABEL[m.provider ?? "unknown"] ?? m.provider}</span></td>
              <td className={TD}>{fmtNum(m.calls)}</td>
              <td className={TD}>{fmtNum(m.tokens)}</td>
              <td className={TD}>{fmtUsd(m.costUsd)}</td>
              <td className={TD}><PctBar pct={m.pctSpend ?? 0} /></td>
            </tr>
          ))}
        />
      </Section>

      {/* Per-task + where used */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Per task">
          <Table
            head={["Task", "Calls", "Tokens", "Cost"]}
            rows={byTask.map((t) => (
              <tr key={t.key} className="border-b border-white/[0.04] text-[#c8d6e8]">
                <td className={TD}><span className="text-white">{t.key}</span></td>
                <td className={TD}>{fmtNum(t.calls)}</td>
                <td className={TD}>{fmtNum(t.tokens)}</td>
                <td className={TD}>{fmtUsd(t.costUsd)}</td>
              </tr>
            ))}
          />
        </Section>
        <Section title="Where used (per article)">
          <Table
            head={["Article", "Calls", "Tokens", "Cost"]}
            rows={byArticle.map((a) => (
              <tr key={a.key} className="border-b border-white/[0.04] text-[#c8d6e8]">
                <td className={TD}><span className="text-[#f6bf84]" title={a.key}>{urlLabel(a.key)}</span></td>
                <td className={TD}>{fmtNum(a.calls)}</td>
                <td className={TD}>{fmtNum(a.tokens)}</td>
                <td className={TD}>{fmtUsd(a.costUsd)}</td>
              </tr>
            ))}
          />
        </Section>
      </div>

      {/* Daily spend bar chart */}
      <Section title={`Daily spend (last ${days} days)`}>
        <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ height: 140 }}>
          {byDay.length === 0 && <p className="text-[12px] text-[#7a9ab8]">No spend recorded in this window.</p>}
          {byDay.map((d) => (
            <div key={d.day} className="flex flex-1 min-w-[6px] flex-col items-center justify-end" title={`${d.day} · ${fmtUsd(d.costUsd)} · ${d.calls} calls`}>
              <div
                className="w-full rounded-t bg-[#f59f4f]/70"
                style={{ height: `${Math.max(2, (d.costUsd / maxDayCost) * 110)}px` }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Recent calls */}
      <Section
        title="Recent calls"
        action={
          <button onClick={() => load(days)} className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30">
            Refresh
          </button>
        }
      >
        <Table
          head={["Model", "Provider", "Task", "Article", "Tokens", "Cost", "Status", "Time"]}
          rows={recent.map((r, i) => (
            <tr key={`${r.createdAt}-${i}`} className="border-b border-white/[0.04] text-[#c8d6e8]">
              <td className={TD}><span className="font-mono text-[11px] text-white">{r.model ?? "—"}</span></td>
              <td className={TD}><span style={{ color: PROVIDER_COLOR[r.provider ?? "unknown"] }}>{PROVIDER_LABEL[r.provider ?? "unknown"] ?? r.provider}</span></td>
              <td className={TD}>{r.task ?? "—"}</td>
              <td className={TD}><span className="text-[#f6bf84]" title={r.contextUrl ?? undefined}>{urlLabel(r.contextUrl)}</span></td>
              <td className={TD}>{fmtNum(r.totalTokens)}</td>
              <td className={TD}>{fmtUsd(r.costUsd)}</td>
              <td className={TD}><span className={r.status === "ok" ? "text-emerald-300" : "text-rose-300"}>{r.status ?? "—"}</span></td>
              <td className={TD}>{fmtTime(r.createdAt)}</td>
            </tr>
          ))}
        />
      </Section>
    </div>
  );
};

/* ── small presentational helpers (dependency-free) ────────────────────────── */

const Card: React.FC<{ title: string; big?: string; accent?: string; children: React.ReactNode }> = ({ title, big, accent, children }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#7a9ab8]">
      {accent && <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} />}
      {title}
    </p>
    {big && <p className="mt-1.5 text-2xl font-black text-white">{big}</p>}
    <div className="mt-2 space-y-1">{children}</div>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-[12px] text-[#9fb2c6]">{label}</span>
    <span className="text-[13px] font-semibold text-white">{value}</span>
  </div>
);

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="mt-6">
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[15px] font-bold text-white">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const PctBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full bg-[#f59f4f]" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
    <span className="text-[11px] text-[#7a9ab8]">{pct.toFixed(1)}%</span>
  </div>
);

const TD = "whitespace-nowrap px-3 py-2";

const Table: React.FC<{ head: string[]; rows: React.ReactNode[] }> = ({ head, rows }) => (
  <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
    <table className="w-full text-left text-[12.5px]">
      <thead>
        <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-[#7a9ab8]">
          {head.map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="px-3 py-4 text-center text-[#5f7c98]">No data.</td>
          </tr>
        ) : (
          rows
        )}
      </tbody>
    </table>
  </div>
);

export default Usage;