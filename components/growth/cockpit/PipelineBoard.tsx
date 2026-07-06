import React, { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { stageChip, PIPELINE_STAGE_ORDER, type PipelineStageId } from "../../../lib/growth/cockpit/stageChip";
import type { PipelineCard, PipelineStage } from "../../../lib/growth/cockpit/pipelineBoard";

/**
 * Cockpit — native 9-stage pipeline kanban (Today / Pipeline / Published Memory
 * are the 3 native tabs; the others deep-link). Fetches GET /api/growth/pipeline-board,
 * which maps the 3 disjoint status vocabularies to 9 view-time stages — no new DB
 * writes. Status + platform filters only (the plan cut the other 5). Per stage:
 * count + up to 50 compact cards + overflow flag.
 *
 * Clicking a card opens the right inspector drawer (onSelectCard). The stages are
 * view-time labels; "Ready = approved" is a label here, NOT a lifecycle change.
 */
interface BoardResp {
  ok: boolean;
  configured?: boolean;
  stages: PipelineStage[];
  error?: string;
}

const STATUS_FILTERS = ["", "pending", "approved", "published", "rejected"] as const;
const PLATFORM_FILTERS = ["", "devto", "hashnode", "medium", "linkedin", "inbharat"] as const;

const PipelineBoard: React.FC<{ onSelectCard: (card: PipelineCard) => void; selectedId?: string | null }> = ({ onSelectCard, selectedId }) => {
  const { fetchJson } = useAdminApi();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [configured, setConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (platform) qs.set("platform", platform);
    const { data, error } = await fetchJson<BoardResp>(`/api/growth/pipeline-board${qs.toString() ? `?${qs}` : ""}`);
    setError(error);
    setStages(data?.stages ?? []);
    setConfigured(data?.configured ?? false);
    setLoading(false);
  }, [fetchJson, status, platform]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Pipeline · 9 stages</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-white/10 bg-[#0a0f18] px-2 py-1 text-[11px] text-[#c0cfe0] outline-none" aria-label="Filter by draft status">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-md border border-white/10 bg-[#0a0f18] px-2 py-1 text-[11px] text-[#c0cfe0] outline-none" aria-label="Filter by platform">
          {PLATFORM_FILTERS.map((p) => <option key={p} value={p}>{p || "all platforms"}</option>)}
        </select>
        <button onClick={load} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Refresh</button>
      </div>

      {!configured && <p className="mt-3 text-[11px] text-amber-300">Database not configured — stages show 0. Wire Supabase env (see Settings).</p>}
      {loading && <p className="mt-3 text-[12px] text-[#7a9ab8]">Loading board…</p>}
      {error && <p className="mt-3 text-[12px] text-rose-300">Failed to load: {error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {PIPELINE_STAGE_ORDER.map((id) => {
          const stage = stages.find((s) => s.stage === id);
          return <StageColumn key={id} stage={id} data={stage} onSelectCard={onSelectCard} selectedId={selectedId} />;
        })}
      </div>
    </div>
  );
};

const StageColumn: React.FC<{ stage: PipelineStageId; data?: PipelineStage; onSelectCard: (c: PipelineCard) => void; selectedId?: string | null }> = ({ stage, data, onSelectCard, selectedId }) => {
  const chip = stageChip(stage);
  const count = data?.count ?? 0;
  const items = data?.items ?? [];
  const overflow = data?.overflow ?? false;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${chip.cls}`}>{chip.label}</span>
        <span className="text-[11px] font-semibold text-[#7a9ab8]">{count}</span>
      </div>
      {data?.note && <p className="mt-1.5 text-[10px] leading-relaxed text-[#5f7c98]">{data.note}</p>}
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 && !data?.note && <li className="text-[11px] text-[#5f7c98]">—</li>}
        {items.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelectCard(c)}
              className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                selectedId === c.id ? "border-[#f59f4f]/50 bg-[#f59f4f]/10" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
              }`}
            >
              <p className="truncate font-semibold text-[#dde6f2]">{c.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-[#7a9ab8]">
                {c.platform && <span className="rounded bg-white/[0.06] px-1 py-0.5 uppercase">{c.platform}</span>}
                {c.status && <span className="rounded bg-white/[0.06] px-1 py-0.5 uppercase">{c.status}</span>}
                {c.product && <span className="truncate">· {c.product}</span>}
              </div>
            </button>
          </li>
        ))}
        {overflow && <li className="text-[10px] text-[#5f7c98]">+{count - items.length} more</li>}
      </ul>
    </div>
  );
};

export default PipelineBoard;