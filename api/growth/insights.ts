import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { monthlyBudgetUsd, monthSpentUsd } from "../../lib/growth/model-router.js";

/**
 * GET /api/growth/insights — single ops snapshot for the admin dashboard
 * ("what's going on"). Admin-only. Aggregates across the growth tables:
 * last cron run, page/task/draft/approval counts, this-month spend vs cap,
 * a recent-activity feed, and integration health (configured booleans only,
 * never secret values).
 */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  // Spend (reuses the model-router's cached month math).
  const { cap, source } = await monthlyBudgetUsd();
  const spentUsd = await monthSpentUsd();
  const now = new Date();
  const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const projectedUsd = dayOfMonth > 0 ? round6((spentUsd / dayOfMonth) * dim) : round6(spentUsd);
  const spend = { spentUsd: round6(spentUsd), capUsd: cap, projectedUsd, remainingUsd: round6(Math.max(0, cap - spentUsd)), source };

  if (!supabaseAdmin) {
    return res.status(200).json({
      ok: true,
      requestId,
      configured: false,
      lastCronRun: null,
      counts: { pages: 0, openTasks: 0, draftsByStatus: {}, approvalsThisMonth: 0 },
      spend,
      recentActivity: [],
      integrations: integrationFlags(),
    });
  }

  const startIso = monthStartIso();
  const [
    lastRun,
    pagesCount,
    openTasksCount,
    approvalsCount,
    recentDrafts,
    recentRuns,
    recentLogs,
    recentApprovals,
    draftStatuses,
  ] = await Promise.all([
    supabaseAdmin.from("growth_crawl_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("growth_pages").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("growth_tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabaseAdmin.from("growth_approvals").select("*", { count: "exact", head: true }).gte("created_at", startIso),
    supabaseAdmin.from("growth_drafts").select("id,kind,url,title,status,created_at").order("created_at", { ascending: false }).limit(3),
    supabaseAdmin.from("growth_crawl_runs").select("id,domain,status,pages_count,started_at").order("started_at", { ascending: false }).limit(3),
    supabaseAdmin.from("growth_agent_logs").select("level,action,scope,detail,created_at").in("level", ["warn", "error", "deny"]).order("created_at", { ascending: false }).limit(3),
    supabaseAdmin.from("growth_approvals").select("decision,reviewer,created_at").order("created_at", { ascending: false }).limit(3),
    supabaseAdmin.from("growth_drafts").select("status").order("created_at", { ascending: false }).limit(1000),
  ]);

  const draftsByStatus: Record<string, number> = {};
  for (const d of (draftStatuses.data ?? []) as { status: string }[]) {
    const s = d.status || "unknown";
    draftsByStatus[s] = (draftsByStatus[s] ?? 0) + 1;
  }

  const activity = [
    ...(recentRuns.data ?? []).map((r: Record<string, unknown>) => ({ type: "cron" as const, detail: `${r.domain}: ${r.status}${r.pages_count ? ` (${r.pages_count} pages)` : ""}`, createdAt: r.started_at })),
    ...(recentDrafts.data ?? []).map((d: Record<string, unknown>) => ({ type: "draft" as const, detail: `${d.kind} · ${d.title || d.url || d.id} → ${d.status}`, createdAt: d.created_at })),
    ...(recentApprovals.data ?? []).map((a: Record<string, unknown>) => ({ type: "approval" as const, detail: `approval ${a.decision}${a.reviewer ? ` by ${a.reviewer}` : ""}`, createdAt: a.created_at })),
    ...(recentLogs.data ?? []).map((l: Record<string, unknown>) => ({ type: "error" as const, detail: `${l.level}: ${l.action}${l.detail ? ` — ${l.detail}` : ""}`, createdAt: l.created_at })),
  ]
    .filter((a) => !!a.createdAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const run = (lastRun.data ?? null) as {
    domain: string;
    status: string;
    pages_count: number | null;
    started_at: string;
    finished_at: string | null;
    error: string | null;
  } | null;

  return res.status(200).json({
    ok: true,
    requestId,
    configured: true,
    lastCronRun: run
      ? { domain: run.domain, status: run.status, pages: run.pages_count ?? 0, startedAt: run.started_at, finishedAt: run.finished_at, error: run.error }
      : null,
    counts: {
      pages: pagesCount.count ?? 0,
      openTasks: openTasksCount.count ?? 0,
      draftsByStatus,
      approvalsThisMonth: approvalsCount.count ?? 0,
    },
    spend,
    recentActivity: activity,
    integrations: integrationFlags(),
  });
}

/** Configured-boolean per integration. Booleans only — never secret values. */
function integrationFlags() {
  return {
    gemini: !!process.env.GEMINI_API_KEY,
    growthOpenai: !!process.env.GROWTH_OPENAI_API_KEY,
    supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    ga4: !!(process.env.GA4_PROPERTY_ID && process.env.GA4_CLIENT_EMAIL && process.env.GA4_PRIVATE_KEY),
    gsc: !!(process.env.GSC_SITE_URL && process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY),
  };
}