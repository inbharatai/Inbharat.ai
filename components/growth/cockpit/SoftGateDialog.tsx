import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { validateOverrideReason, type MajorGateFailure } from "../../../lib/growth/cockpit/gatePolicy";

/**
 * Soft-gate override dialog — surfaced when an Approve is attempted on a draft
 * with MAJOR accuracy-gate failures (duplicate / source_quality / fact_check /
 * claim_risk). NEVER hard-blocks: the founder can type a reason and approve
 * anyway, or cancel. The reason + failures flow to the approvals audit `note`.
 *
 * Shared by the InspectorDrawer and the Issues review queue so both approve paths
 * enforce the same soft-gate. Pure validation lives in gatePolicy.ts (tested).
 */
const SoftGateDialog: React.FC<{
  open: boolean;
  failures: MajorGateFailure[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}> = ({ open, failures, busy, onConfirm, onCancel }) => {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset the textarea whenever the dialog opens.
  useEffect(() => {
    if (open) { setReason(""); setTouched(false); }
  }, [open]);

  if (!open) return null;
  const validation = validateOverrideReason(reason);
  const showError = touched && !validation.ok;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-[14vh]" onClick={onCancel}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-rose-500/30 bg-[#0a0f18] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-400" />
          <div>
            <p className="text-[13px] font-bold text-white">Major gate failures — confirm override</p>
            <p className="mt-0.5 text-[11px] text-[#9fb2c6]">
              These gates failed. You can still approve — record why. Approval only flips the draft status; a human still clicks Publish.
            </p>
          </div>
        </div>

        <ul className="max-h-[30vh] overflow-y-auto px-4 py-3">
          {failures.map((f) => (
            <li key={f.id} className="rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2 text-[12px] text-[#e6c8c8]">
              <span className="font-semibold text-rose-300">{f.name}</span> — {f.summary}
            </li>
          ))}
        </ul>

        <div className="px-4 pb-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7a9ab8]">Override reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            rows={3}
            placeholder="Why are you approving despite these failures? (recorded to the audit log)"
            className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-[#070b12] px-3 py-2 text-[12px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
          />
          {showError && <p className="mt-1 text-[11px] text-rose-300">{validation.error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-[#c8d6e8] disabled:opacity-40 hover:border-white/30">
            Cancel
          </button>
          <button
            onClick={() => { setTouched(true); if (validation.ok) onConfirm(reason.trim()); }}
            disabled={busy || !validation.ok}
            className="rounded-md bg-amber-500/20 px-3 py-1.5 text-[12px] font-bold text-amber-200 disabled:opacity-40 hover:bg-amber-500/30"
          >
            {busy ? "Approving…" : "Approve with override"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SoftGateDialog;