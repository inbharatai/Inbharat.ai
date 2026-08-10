import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, ExternalLink } from "lucide-react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import GateResults from "./GateResults";
import SoftGateDialog from "./SoftGateDialog";
import { majorGateFailures, type MajorGateFailure } from "../../../lib/growth/cockpit/gatePolicy";
import type { GateRun } from "../../../lib/growth/gates";
import type { PipelineCard } from "../../../lib/growth/cockpit/pipelineBoard";
import type { PublishedMemoryItem } from "../../../lib/growth/publishedMemory";

/**
 * Cockpit right inspector — a slide-in drawer (mirrors components/Sidebar.tsx's
 * transform transition + Sites.tsx:324's scrim). No right-drawer exists elsewhere
 * in the admin; this is the cockpit's item-detail surface.
 *
 * Two item kinds:
 *  • draft card (PipelineCard with status pending|approved) → "Run accuracy gates"
 *    (POST /api/growth/gates, advisory) + Approve/Reject (POST /api/growth/approvals,
 *    pending only — approval stays a human click) + deep-links to Issues/Knowledge.
 *  • published-memory row → cross-platform state + canonical URL + deep-links.
 *
 * HONEST: gates are advisory (never block). Approve/Reject only flips the draft
 * status — nothing auto-publishes. No fabricated URLs; LinkedIn shows "posted
 * manually" because the share-template flow never persists the post URL.
 */
export type InspectorSelection =
  | { type: "card"; card: PipelineCard }
  | { type: "memory"; item: PublishedMemoryItem }
  | null;

const isDraftCard = (card: PipelineCard): boolean => card.status === "pending" || card.status === "approved";

const InspectorDrawer: React.FC<{ selection: InspectorSelection; onClose: () => void; onApprove?: () => void }> = ({ selection, onClose, onApprove }) => {
  const { fetchJson } = useAdminApi();
  const [run, setRun] = useState<GateRun | null>(null);
  const [gatesLoading, setGatesLoading] = useState(false);
  const [gatesError, setGatesError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Soft-gate override dialog: when set, an Approve was attempted on a draft with
  // major gate failures; the founder must type a reason (never hard-blocked).
  const [overrideFailures, setOverrideFailures] = useState<MajorGateFailure[] | null>(null);

  // Reset state whenever the selection changes.
  useEffect(() => {
    setRun(null);
    setGatesError(null);
    setGatesLoading(false);
    setDecision(null);
    setDecisionMsg(null);
    setOverrideFailures(null);
  }, [selection]);

  const draftId = (() => {
    if (selection?.type === "card" && isDraftCard(selection.card)) return selection.card.id;
    return null;
  })();

  async function runGates() {
    if (!draftId) return;
    setGatesLoading(true);
    setGatesError(null);
    const { data, error } = await fetchJson<{ ok: boolean; gates: GateRun["gates"]; overall: GateRun["overall"]; summary: string; costUsd: number; error?: string }>(
      "/api/growth/gates",
      { method: "POST", body: JSON.stringify({ draftId }) },
    );
    setGatesLoading(false);
    if (error || !data || !data.ok) {
      setGatesError(error || data?.error || "unknown");
      return;
    }
    setRun({ gates: data.gates, overall: data.overall, summary: data.summary, costUsd: data.costUsd });
  }

  // The actual POST to /api/growth/approvals. overrideReason + gateFailures are
  // sent only when the soft-gate override was used; they're folded into the audit
  // note server-side. Never blocks — approval proceeds regardless.
  async function postDecision(
    d: "approved" | "rejected",
    overrideReason?: string,
    gateFailures?: MajorGateFailure[],
  ) {
    if (!draftId) return;
    setBusy(true);
    setDecisionMsg(null);
    const payload: Record<string, unknown> = { draftId, decision: d };
    if (overrideReason) {
      payload.overrideReason = overrideReason;
      payload.gateFailures = gateFailures ?? [];
    }
    const { data, error } = await fetchJson<{ ok: boolean; decision?: string; error?: string }>(
      "/api/growth/approvals",
      { method: "POST", body: JSON.stringify(payload) },
    );
    setBusy(false);
    if (error || !data?.ok) {
      setDecision(d);
      setDecisionMsg(`Failed: ${error || data?.error || "unknown"}`);
      return;
    }
    setDecision(d);
    setDecisionMsg(`Marked ${d}. Nothing auto-publishes — post manually.`);
    onApprove?.();
  }

  function decide(d: "approved" | "rejected") {
    if (!draftId) return;
    if (d === "approved") {
      // Soft-gate: if gates were run and major failures exist, surface the override
      // dialog instead of approving immediately. No gates run / no major failures →
      // approve directly (unchanged behavior). Never hard-blocked.
      const failures = majorGateFailures(run?.gates);
      if (failures.length > 0) {
        setOverrideFailures(failures);
        return;
      }
    }
    void postDecision(d);
  }

  function confirmOverride(reason: string) {
    const failures = overrideFailures ?? [];
    setOverrideFailures(null);
    void postDecision("approved", reason, failures);
  }

  const open = selection !== null;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[460px] transform border-l border-white/10 bg-[#070b12] shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        } flex flex-col`}
        aria-label="Item inspector"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Inspector</h2>
          <button onClick={onClose} className="rounded-md p-1 text-[#9fb2c6] hover:bg-white/[0.06] hover:text-white" aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!selection && <p className="text-[12px] text-[#7a9ab8]">Select an item to inspect.</p>}

          {selection?.type === "card" && (
            <CardInspector card={selection.card} draftId={draftId} run={run} gatesLoading={gatesLoading} gatesError={gatesError} onRunGates={runGates}
              decision={decision} decisionMsg={decisionMsg} busy={busy} onDecide={decide} />
          )}

          {selection?.type === "memory" && <MemoryInspector item={selection.item} />}
        </div>
      </aside>

      <SoftGateDialog
        open={overrideFailures !== null}
        failures={overrideFailures ?? []}
        busy={busy}
        onConfirm={confirmOverride}
        onCancel={() => setOverrideFailures(null)}
      />
    </>
  );
};

const CardInspector: React.FC<{
  card: PipelineCard;
  draftId: string | null;
  run: GateRun | null;
  gatesLoading: boolean;
  gatesError: string | null;
  onRunGates: () => void;
  decision: "approved" | "rejected" | null;
  decisionMsg: string | null;
  busy: boolean;
  onDecide: (d: "approved" | "rejected") => void;
}> = ({ card, draftId, run, gatesLoading, gatesError, onRunGates, decision, decisionMsg, busy, onDecide }) => (
  <div className="space-y-4">
    <div>
      <p className="text-[15px] font-bold text-white">{card.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        {card.platform && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 uppercase text-[#c0cfe0]">{card.platform}</span>}
        {card.status && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 uppercase text-[#c0cfe0]">{card.status}</span>}
        {card.slug && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[#7a9ab8]">{card.slug}</span>}
      </div>
      {card.url && (
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#7ab9e6] hover:underline">
          Open source <ExternalLink size={10} />
        </a>
      )}
    </div>

    <div className="flex flex-wrap gap-2">
      <Link to="/admin/growth/issues" className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Open in Issues ↗</Link>
      <Link to="/admin/growth/knowledge" className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Open in Knowledge ↗</Link>
    </div>

    {draftId ? (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Accuracy gates</h3>
          <button onClick={onRunGates} disabled={gatesLoading} className="rounded-md border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-2.5 py-1 text-[11px] font-semibold text-[#f6bf84] disabled:opacity-40 hover:bg-[#f59f4f]/20">
            {gatesLoading ? "Running…" : run ? "Re-run gates" : "Run gates"}
          </button>
        </div>
        <div className="mt-2">
          <GateResults run={run} loading={gatesLoading} error={gatesError} />
        </div>
      </div>
    ) : (
      <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-[#7a9ab8]">
        Accuracy gates apply to draft cards only (Draft / Review / Ready stages). This item is a {card.status ?? "non-draft"} record — manage it on the linked page.
      </p>
    )}

    {draftId && card.status === "pending" && (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Approval</h3>
        <p className="mt-1 text-[11px] text-[#7a9ab8]">Human gate — nothing auto-publishes. Approve/Reject only flips the draft status.</p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => onDecide("approved")} disabled={busy} className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-bold text-emerald-200 disabled:opacity-40 hover:bg-emerald-500/30">Approve</button>
          <button onClick={() => onDecide("rejected")} disabled={busy} className="rounded-md bg-rose-500/20 px-3 py-1.5 text-[12px] font-bold text-rose-200 disabled:opacity-40 hover:bg-rose-500/30">Reject</button>
        </div>
        {decisionMsg && <p className={`mt-2 text-[11px] ${decision === "approved" ? "text-emerald-300" : decision === "rejected" ? "text-rose-300" : "text-[#9fb2c6]"}`}>{decisionMsg}</p>}
      </div>
    )}
  </div>
);

const MemoryInspector: React.FC<{ item: PublishedMemoryItem }> = ({ item }) => {
  const cells: { label: string; url: string | null; status: string | null | undefined; manual?: boolean }[] = [
    { label: "InBharat", url: item.canonicalUrl, status: "live" },
    { label: "LinkedIn", url: null, status: item.linkedin.status, manual: true },
    { label: "Instagram", url: item.instagram?.url ?? null, status: item.instagram?.status ?? null },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-bold text-white">{item.title}</p>
        <p className="mt-1 text-[11px] text-[#7a9ab8]">{item.slug}</p>
        {item.canonicalUrl && (
          <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#7ab9e6] hover:underline">
            View article <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Cross-platform state</h3>
        <ul className="mt-2 space-y-1.5">
          {cells.map((c) => (
            <li key={c.label} className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#c0cfe0]">{c.label}</span>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#7ab9e6] hover:underline">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">{c.manual ? "posted manually" : (c.status ?? "live")}</span>
                  <ExternalLink size={10} />
                </a>
              ) : c.manual && c.status ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">posted manually</span>
              ) : c.status ? (
                <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-300">{c.status}</span>
              ) : (
                <span className="text-[10px] text-[#5f7c98]">—</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-[#5f7c98]">
          LinkedIn shows &quot;posted manually&quot; honestly — the share-template flow never persists the post URL. Instagram shows the permalink when available.
          {item.measuredAt ? ` measured_at ${new Date(item.measuredAt).toLocaleDateString()} (LinkedIn outcomes only).` : " No LinkedIn outcomes measured yet."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/admin/growth/issues" className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">Open in Issues ↗</Link>
        <Link to="/admin/growth/performance" className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06]">SEO performance ↗</Link>
      </div>
    </div>
  );
};

export default InspectorDrawer;