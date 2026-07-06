/**
 * InBharat Growth Cockpit — 9-stage pipeline chip map.
 *
 * Pure (no React, no DB) so the stage → label/color mapping is hermetically
 * unit-testable. The 9 stages are VIEW-TIME labels over the existing 3 disjoint
 * status vocabularies (KnowledgeStatus / draft status / SyndicationStatus) —
 * NOT a new DB status. The mapping logic lives in pipelineBoard.ts; this file
 * only renders the chip for a stage id.
 *
 * Do NOT reuse pipelineStatus.ts:statusChip — that maps the 5 draft statuses
 * only; the 9-stage board needs its own map.
 */
export type PipelineStageId =
  | "idea"
  | "research"
  | "brief"
  | "draft"
  | "review"
  | "ready"
  | "deposited"
  | "published"
  | "measured";

export interface StageChip {
  label: string;
  /** Tailwind classes (bg + text) matching the existing chip idiom. */
  cls: string;
}

export const PIPELINE_STAGE_ORDER: PipelineStageId[] = [
  "idea", "research", "brief", "draft", "review", "ready", "deposited", "published", "measured",
];

const CHIPS: Record<PipelineStageId, StageChip> = {
  idea: { label: "Idea", cls: "bg-violet-500/15 text-violet-300" },
  research: { label: "Research", cls: "bg-indigo-500/15 text-indigo-300" },
  brief: { label: "Brief", cls: "bg-sky-500/15 text-sky-300" },
  draft: { label: "Draft", cls: "bg-amber-500/15 text-amber-300" },
  review: { label: "Review", cls: "bg-orange-500/15 text-orange-300" },
  ready: { label: "Ready", cls: "bg-teal-500/15 text-teal-300" },
  deposited: { label: "Deposited", cls: "bg-cyan-500/15 text-cyan-300" },
  published: { label: "Published", cls: "bg-emerald-500/15 text-emerald-300" },
  measured: { label: "Measured", cls: "bg-rose-500/15 text-rose-300" },
};

export function stageChip(stage: PipelineStageId): StageChip {
  return CHIPS[stage] ?? { label: stage, cls: "bg-white/5 text-[#7a9ab8]" };
}