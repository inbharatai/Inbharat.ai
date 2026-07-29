import React from "react";

/**
 * Cockpit inspector — renders the 8 advisory accuracy gates from
 * POST /api/growth/gates (lib/growth/gates.ts:runAccuracyGates).
 *
 * ADVISORY — never blocks approval. The founder clicks Approve regardless; this
 * view just surfaces per-gate verdicts so the decision is informed. No gate calls
 * a model (gate 4 reuses the stored critique; gates 2/3 reuse grounding snippets),
 * so costUsd is always 0 and there is no "re-run cost" warning to show.
 *
 * Honest limits (shown inline as gate notes, not hidden):
 *  • source_quality / fact_check skip-with-note when re-run without persisted snippets.
 *  • seo_geo is a static markdown pre-check; the full crawl audit runs post-publish.
 *  • claim_risk is regex, not legal review.
 */
import type { GateRun, GateResult } from "../../../lib/growth/gates";

const STATUS_CHIP: Record<GateResult["status"], string> = {
  pass: "bg-emerald-500/15 text-emerald-300",
  warn: "bg-amber-500/15 text-amber-300",
  fail: "bg-rose-500/15 text-rose-300",
};
const STATUS_LABEL: Record<GateResult["status"], string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };
const SEV_DOT: Record<string, string> = {
  critical: "bg-rose-400",
  major: "bg-amber-400",
  minor: "bg-sky-400",
};

const GateResults: React.FC<{ run: GateRun | null; loading?: boolean; error?: string | null }> = ({ run, loading, error }) => {
  if (loading) return <p className="text-[12px] text-[#7a9ab8]">Running accuracy gates…</p>;
  if (error) return <p className="text-[12px] text-rose-300">Gates failed: {error}</p>;
  if (!run) return <p className="text-[12px] text-[#7a9ab8]">No gate run yet.</p>;

  const overallChip = STATUS_CHIP[run.overall];
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${overallChip}`}>{STATUS_LABEL[run.overall]}</span>
        <span className="text-[11px] text-[#9fb2c6]">{run.summary}</span>
      </div>
      <p className="mt-1 text-[10px] text-[#5f7c98]">
        8 surface checks — advisory only, approval stays a human click. No gate calls a model (cost $0). Fact-check &amp; claim-risk are regex flaggers;
        source/fact gates skip-with-note on re-run (grounding isn&apos;t persisted); SEO/GEO is a static markdown pre-check (the full crawl audit runs post-publish). Deep review is the critique model.
      </p>
      <ul className="mt-3 space-y-2">
        {run.gates.map((g) => (
          <li key={g.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-white">{g.name}</span>
              <div className="flex items-center gap-1.5">
                {typeof g.score === "number" && <span className="text-[10px] text-[#7a9ab8]">{g.score}/100</span>}
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_CHIP[g.status]}`}>{STATUS_LABEL[g.status]}</span>
              </div>
            </div>
            {g.findings.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {g.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#c0cfe0]">
                    <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[f.severity] ?? "bg-slate-400"}`} />
                    <span>
                      {f.message}
                      {f.fix && <span className="block text-[10px] text-[#7a9ab8]">Fix: {f.fix}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] text-[#5f7c98]">No findings.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GateResults;