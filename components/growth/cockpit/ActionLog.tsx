import React, { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * Cockpit "Today" tab — the recent-activity feed, reusing GET /api/growth/insights
 * (recentActivity). This is the same data the Overview page renders; surfaced here
 * as a panel so the cockpit's Today tab is a real launchpad, not a stub. No new API,
 * no fabricated events — empty state is honest.
 */
interface InsightsResp {
  ok: boolean;
  recentActivity?: { type: string; detail: string; createdAt: string }[];
  error?: string;
}

const ACTIVITY_COLOR: Record<string, string> = {
  cron: "text-[#f59f4f]",
  draft: "text-sky-300",
  approval: "text-emerald-300",
  error: "text-rose-300",
};

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

const ActionLog: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [rows, setRows] = useState<{ type: string; detail: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchJson<InsightsResp>("/api/growth/insights");
    setError(error);
    setRows(data?.recentActivity ?? []);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Action log</h2>
        <button onClick={load} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Refresh</button>
      </div>
      {loading && <p className="mt-3 text-[12px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-3 text-[12px] text-rose-300">Failed to load: {error}</p>}
      {!loading && !error && rows.length === 0 && <p className="mt-3 text-[12px] text-[#7a9ab8]">No recent activity.</p>}
      <ul className="mt-3 space-y-2">
        {rows.map((a, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className={`text-[12px] ${ACTIVITY_COLOR[a.type] ?? "text-[#c8d6e8]"}`}>{a.detail}</span>
            <span className="text-[10px] text-[#5f7c98]">{fmtRel(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActionLog;