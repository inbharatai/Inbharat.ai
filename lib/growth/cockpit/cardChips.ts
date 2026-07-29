/**
 * Pure chip-derivation for pipeline cards — maps a card's numeric priority
 * (intent_score 0..100) and risk level to a compact label + tailwind color class.
 * React-free so scripts/test-growth.ts can drive it with fixtures. The board
 * component attaches these to the card render.
 *
 * HONESTY CONTRACT: priority is only meaningful where a score exists (knowledge
 * rows carry intent_score; drafts generally don't). A null score → no chip, never
 * a fabricated "P3".
 */

export type PriorityBand = "high" | "medium" | "low";

export interface PriorityChip { label: string; band: PriorityBand; cls: string; }

const HIGH_CLS = "bg-rose-500/15 text-rose-300";
const MED_CLS = "bg-amber-500/15 text-amber-300";
const LOW_CLS = "bg-sky-500/15 text-sky-300";

/** Map an intent_score (0..100) to a priority chip. null/undefined → null. */
export function priorityChip(score: number | null | undefined): PriorityChip | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 70) return { label: `P1·${score}`, band: "high", cls: HIGH_CLS };
  if (score >= 40) return { label: `P2·${score}`, band: "medium", cls: MED_CLS };
  return { label: `P3·${score}`, band: "low", cls: LOW_CLS };
}

export type RiskBand = "low" | "medium" | "high";

export interface RiskChip { label: string; cls: string; }

const RISK_CLS: Record<RiskBand, string> = {
  low: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-300",
  high: "bg-rose-500/10 text-rose-300",
};

/** Map a risk_level string to a chip. Unknown/null → null (no fabricated chip). */
export function riskChip(risk: string | null | undefined): RiskChip | null {
  if (!risk) return null;
  const band = (risk.toLowerCase() as RiskBand);
  if (band !== "low" && band !== "medium" && band !== "high") return null;
  return { label: `risk·${band}`, cls: RISK_CLS[band] };
}