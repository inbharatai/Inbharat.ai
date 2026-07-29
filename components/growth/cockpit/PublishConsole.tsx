import React, { useMemo } from "react";
import { CheckCircle2, Circle, AlertCircle, ArrowRight } from "lucide-react";
import { deriveStopPoint, type StopPointInput } from "../../../lib/growth/cockpit/publishConsole";

/**
 * "Publish Console" stop-point stepper — renders, for a focused draft (the one a
 * ?draft=<id> deep link points at), where it's parked in the last-mile flow and
 * what's needed to advance. Pure derivation lives in publishConsole.ts (hermetically
 * tested); this component only renders.
 *
 * Read-only. Nothing here publishes or mutates — it visualizes the stop-point so
 * the founder knows the next human-gated action. Honest about no-publish-target
 * kinds (inbox-outline / media-candidate feed the agent, not a platform).
 */
const PublishConsole: React.FC<{ input: StopPointInput; title?: string | null }> = ({ input, title }) => {
  const stop = useMemo(() => deriveStopPoint(input), [input]);

  return (
    <div className="rounded-xl border border-[#f59f4f]/20 bg-[#f59f4f]/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#f6bf84]">Publish console · stop-point</h3>
        {title && <span className="truncate text-[12px] text-[#c8d6e8]">{title}</span>}
      </div>

      {stop.noPublishTarget ? (
        <div className="mt-3 flex items-start gap-2 text-[12px] text-[#9fb2c6]">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-sky-300" />
          <span>
            This draft (<code className="text-[#c8d6e8]">{input.kind}</code>) feeds the agent — it has no publish target.
            No last-mile publish step applies.
          </span>
        </div>
      ) : (
        <>
          <ol className="mt-3 flex flex-wrap items-center gap-1.5">
            {stop.stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                    s.stoppedHere
                      ? "bg-[#f59f4f]/20 text-[#f6bf84] ring-1 ring-[#f59f4f]/40"
                      : s.reached
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-white/[0.03] text-[#5f7c98]"
                  }`}
                >
                  {s.reached ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  {s.label}
                </span>
                {i < stop.stages.length - 1 && <ArrowRight size={11} className="text-[#5f7c98]" />}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-[#c8d6e8]">
            {stop.nextAction ? (
              <>Stopped at <span className="font-semibold text-[#f6bf84]">{stop.stages.find((s) => s.stoppedHere)?.label}</span>. Next: {stop.nextAction}</>
            ) : (
              <span className="text-emerald-300">Reached the end of the flow — measure outcomes on the Published tab.</span>
            )}
          </p>
        </>
      )}
    </div>
  );
};

export default PublishConsole;