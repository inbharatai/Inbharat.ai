/**
 * Shared month-spend math for the Growth admin API.
 *
 * Previously the `round6` / `monthStartIso` / spend-vs-cap + linear projection
 * block was copy-pasted across api/growth/{insights,usage,budget}.ts — three
 * copies of the same projection formula, which is exactly where drift bugs
 * breed (one handler's "projectedUsd" silently diverging from another's).
 * This is the single source of truth; the handlers import what they need.
 */
import { monthlyBudgetUsd, monthSpentUsd } from "./model-router.js";

export interface SpendBlock {
  spentUsd: number;
  capUsd: number;
  projectedUsd: number;
  remainingUsd: number;
  source: string;
}

/** Round to 6 decimal places (micro-dollar precision — matches the cost rows). */
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** ISO timestamp of the first instant of the current UTC month. */
export function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** ISO timestamp of the first instant of the current IST calendar day.
 *  IST = UTC+5:30. The morning content cron fires at 02:30 UTC (= 08:00 IST),
 *  so "today's pipeline" must be bounded by the IST day, not the UTC day — a
 *  run at 02:30 UTC belongs to the same IST day the founder is reviewing. */
export function istStartOfDayIso(now: Date = new Date()): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(istMidnightUtc - IST_OFFSET_MS).toISOString();
}

/** This-month spend vs cap, with a linear projection to month-end from the
 *  spend so far this month. Reuses the model-router's cached budget + month
 *  spend so all three handlers share one read path. */
export async function spendBlock(): Promise<SpendBlock> {
  const { cap, source } = await monthlyBudgetUsd();
  const spentUsd = await monthSpentUsd();
  const now = new Date();
  const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const projectedUsd = dayOfMonth > 0 ? round6((spentUsd / dayOfMonth) * dim) : round6(spentUsd);
  return {
    spentUsd: round6(spentUsd),
    capUsd: cap,
    projectedUsd,
    remainingUsd: round6(Math.max(0, cap - spentUsd)),
    source,
  };
}