/**
 * Pure "Today Command" logic — turns the raw /api/growth/insights + /api/growth/pipeline
 * responses into a prioritized Recommended Next Actions list + an Errors & alerts strip.
 *
 * React-free so scripts/test-growth.ts can drive it with fixtures (no DOM, no lucide).
 * The component (components/growth/cockpit/TodayCommand.tsx) imports these and attaches
 * lucide icons by `iconKey`. Nothing here fetches or publishes — it is pure derivation
 * over two existing read-only endpoints.
 */

export type Priority = "high" | "medium" | "low";

export interface InsightsShape {
  configured?: boolean;
  lastCronRun?: { domain: string; status: string; pages: number; startedAt: string; finishedAt: string | null; error: string | null } | null;
  counts?: { pages: number; openTasks: number; draftsByStatus: Record<string, number>; approvalsThisMonth: number };
  spend?: { capUsd?: number; spentUsd?: number; projectedUsd?: number; remainingUsd?: number };
  recentActivity?: { type: string; detail: string; createdAt: string }[];
  stuckRuns?: { id: string; domain: string; started_at: string }[];
  integrations?: { gemini: boolean; growthOpenai: boolean; supabase: boolean; cronSecret: boolean; ga4: boolean; gsc: boolean };
}
export interface PipelineShape {
  thread?: { id: string; title: string; updatedAt: string } | null;
  topic?: string | null;
  article?: { draftId: string; slug: string | null; title: string | null; status: string; url: string | null } | null;
  linkedin?: { draftId: string; status: string } | null;
  cover?: { draftId: string; filename: string | null; status: string } | null;
}

export interface TodayAction {
  id: string;
  label: string;
  hint?: string;
  to: string;
  iconKey: string;
  priority: Priority;
}
export interface TodayAlert {
  id: string;
  severity: "error" | "warn";
  label: string;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function fmtRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

/** Derive a ranked action list from the two endpoint responses. Pure + testable. */
export function computeActions(ins: InsightsShape | null, pip: PipelineShape | null): TodayAction[] {
  const out: TodayAction[] = [];
  const pending = ins?.counts?.draftsByStatus?.pending ?? 0;
  if (pending > 0) {
    out.push({ id: "review-drafts", label: `Review ${pending} pending draft${pending === 1 ? "" : "s"}`, hint: "Article / LinkedIn / cover drafts awaiting your approval. Human-gated.", to: "/admin/growth/issues", iconKey: "file", priority: "high" });
  }
  const article = pip?.article;
  if (article?.status === "pending") {
    out.push({ id: "today-article-review", label: "Today’s article draft awaits review", hint: article.title ?? article.slug ?? undefined, to: "/admin/growth/issues", iconKey: "file", priority: "high" });
  } else if (article?.status === "approved") {
    out.push({ id: "today-article-publish", label: "Today’s article is approved — publish it", hint: article.title ?? article.slug ?? undefined, to: "/admin/growth/issues", iconKey: "send", priority: "high" });
  }
  if (pip?.linkedin?.status === "pending") {
    out.push({ id: "today-linkedin-review", label: "LinkedIn caption awaits review", hint: "Promote the article on LinkedIn (human-gated).", to: "/admin/growth/issues", iconKey: "send", priority: "medium" });
  }
  if (pip?.cover?.status === "pending") {
    out.push({ id: "today-cover-review", label: "Cover draft awaits review", hint: "Approve + publish the article cover.", to: "/admin/growth/issues", iconKey: "image", priority: "medium" });
  }
  const stuck = ins?.stuckRuns?.length ?? 0;
  if (stuck > 0) {
    out.push({ id: "stuck-runs", label: `${stuck} stuck crawl run${stuck === 1 ? "" : "s"} — re-run audit`, hint: "Running >1h without completing (likely a timed-out cron).", to: "/admin/growth/sites", iconKey: "globe", priority: "high" });
  }
  const lastRun = ins?.lastCronRun;
  if (lastRun?.status === "failed" || lastRun?.error) {
    out.push({ id: "last-audit-failed", label: `Last audit failed for ${lastRun.domain}`, hint: lastRun.error ?? undefined, to: "/admin/growth/overview", iconKey: "alert", priority: "high" });
  }
  const integ = ins?.integrations;
  if (integ && (!integ.ga4 || !integ.gsc)) {
    out.push({ id: "analytics-config", label: "Analytics not fully configured", hint: "Add the service account as GA4 Viewer + GSC Restricted user.", to: "/admin/growth/performance", iconKey: "bar", priority: "medium" });
  }
  const spend = ins?.spend;
  if (spend && typeof spend.projectedUsd === "number" && typeof spend.capUsd === "number" && spend.projectedUsd > spend.capUsd) {
    out.push({ id: "spend-over-cap", label: "Spend projected over the monthly cap", hint: `Projected $${spend.projectedUsd.toFixed(2)} vs cap $${spend.capUsd.toFixed(2)}.`, to: "/admin/growth/usage", iconKey: "wallet", priority: "medium" });
  }
  const openTasks = ins?.counts?.openTasks ?? 0;
  if (openTasks > 0) {
    out.push({ id: "open-tasks", label: `${openTasks} open growth task${openTasks === 1 ? "" : "s"}`, hint: "Promotion / cover / inbox tasks the cron queued.", to: "/admin/growth/issues", iconKey: "trend", priority: "low" });
  }
  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** Derive an errors & alerts strip from the insights response. Pure + testable. */
export function computeAlerts(ins: InsightsShape | null): TodayAlert[] {
  const out: TodayAlert[] = [];
  for (const r of ins?.stuckRuns ?? []) {
    out.push({ id: `stuck:${r.id}`, severity: "error", label: `Stuck crawl run on ${r.domain} (started ${fmtRel(r.started_at)}) — re-run the audit.` });
  }
  const lastRun = ins?.lastCronRun;
  if (lastRun?.error) {
    out.push({ id: "lastcron-error", severity: "error", label: `Last audit error (${lastRun.domain}): ${lastRun.error}` });
  }
  const integ = ins?.integrations;
  if (integ && !integ.supabase) {
    out.push({ id: "no-supabase", severity: "warn", label: "Supabase not configured — the Growth Agent is running without persistence." });
  }
  if (integ && !integ.gemini) {
    out.push({ id: "no-gemini", severity: "warn", label: "GEMINI_API_KEY not set — the agent cannot draft." });
  }
  if (integ && (!integ.ga4 || !integ.gsc)) {
    out.push({ id: "analytics-partial", severity: "warn", label: "GA4/GSC not fully configured — analytics sync records partial snapshots." });
  }
  for (const a of ins?.recentActivity ?? []) {
    if (a.type === "error") {
      out.push({ id: `log:${a.createdAt}:${a.detail.slice(0, 24)}`, severity: "error", label: `${a.detail} (${fmtRel(a.createdAt)})` });
    }
  }
  return out;
}