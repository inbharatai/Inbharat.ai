/**
 * InBharat Growth Agent — shared scoring helpers.
 * Pure functions; hermetically testable.
 */
import type { AuditIssue, IssueSeverity } from "./types.js";

const SEVERITY_WEIGHT: Record<IssueSeverity, number> = {
  critical: 25,
  high: 12,
  normal: 5,
  low: 2,
};

/** Cap a number into [min, max]. */
export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Start from 100 and subtract per-issue penalties, bounded to [0,100].
 * A page with no issues scores 100.
 */
export function scoreFromIssues(issues: AuditIssue[]): number {
  let penalty = 0;
  for (const i of issues) penalty += SEVERITY_WEIGHT[i.severity] ?? 5;
  return clamp(100 - penalty);
}

/** Sort issues by severity (critical first) for display. */
export function sortBySeverity(issues: AuditIssue[]): AuditIssue[] {
  const order: Record<IssueSeverity, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  return [...issues].sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
}

export function issue(
  severity: IssueSeverity,
  field: string,
  message: string,
  recommendedFix: string
): AuditIssue {
  return { severity, field, message, recommendedFix };
}