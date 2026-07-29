/**
 * Pure "soft gate policy" — classifies which accuracy-gate failures are MAJOR
 * enough to surface on approve, validates a human override reason, and composes
 * the audit note. React-free so scripts/test-growth.ts can drive it with fixtures.
 *
 * SOFT-GATE CONTRACT (never hard-blocks): when a draft has major gate failures,
 * the approve UI surfaces them and asks for a typed override reason; the founder
 * can always override and approve. The reason + failure summary is recorded to
 * the growth_approvals audit row (via the approvals endpoint's `note`). Nothing
 * here blocks publishing — approval still only flips the draft status, and a
 * human still clicks Publish.
 *
 * MAJOR gates (status 'fail' on these is real risk): duplicate, source_quality,
 * fact_check, claim_risk. The other four (brand_voice, product_naming, seo_geo,
 * platform_format) are surfaced as warnings by the gate UI but do not trigger the
 * override prompt — they're style/format, not integrity.
 */

import type { GateResult } from "../gates.js";

export type MajorGateId = "duplicate" | "source_quality" | "fact_check" | "claim_risk";

export const MAJOR_GATE_IDS: MajorGateId[] = ["duplicate", "source_quality", "fact_check", "claim_risk"];

const MAJOR_SET: Set<string> = new Set(MAJOR_GATE_IDS);

export interface MajorGateFailure {
  id: string;
  name: string;
  /** First finding message — the human-readable reason this gate failed. */
  summary: string;
}

/** Extract the major failures (status 'fail' on a MAJOR gate) from a gate run.
 *  Pure + testable. Returns [] when there are none (no override required). */
export function majorGateFailures(gates: GateResult[] | null | undefined): MajorGateFailure[] {
  if (!Array.isArray(gates)) return [];
  const out: MajorGateFailure[] = [];
  for (const g of gates) {
    if (g.status !== "fail") continue;
    if (!MAJOR_SET.has(g.id)) continue;
    const firstMsg = g.findings?.[0]?.message ?? `${g.name} failed`;
    out.push({ id: g.id, name: g.name, summary: firstMsg });
  }
  return out;
}

/** True when an override reason is required (major failures present). */
export function requireOverride(failures: MajorGateFailure[]): boolean {
  return failures.length > 0;
}

export interface OverrideValidation { ok: boolean; error?: string; }

/** Validate a typed override reason. Must be non-empty and at least 8 chars so a
 *  real justification is recorded (not "ok" / "yes"). Pure + testable. */
export function validateOverrideReason(reason: string | null | undefined): OverrideValidation {
  const r = (reason ?? "").trim();
  if (r.length < 8) return { ok: false, error: "Override requires a reason (≥ 8 characters) — record why you're approving despite the gate failure." };
  return { ok: true };
}

/** Compose the audit note from the override reason + major failures. Kept under
 *  the approvals endpoint's 1000-char note cap. Pure + testable. */
export function overrideNote(reason: string, failures: MajorGateFailure[]): string {
  const r = (reason ?? "").trim();
  const failSummary = failures
    .map((f) => `${f.name}: ${f.summary}`)
    .join(" | ");
  const base = `Override approve — reason: ${r}`;
  const full = failSummary ? `${base} | major gate failures: ${failSummary}` : base;
  return full.slice(0, 1000);
}