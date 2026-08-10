import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { monthStartIso, spendBlock } from "../../lib/growth/spend.js";
import { googleClientEmail, googlePrivateKey } from "../../lib/growth/performance.js";

/**
 * GET /api/growth/insights — single ops snapshot for the admin dashboard
 * ("what's going on"). Admin-only. Aggregates across the growth tables:
 * last cron run, page/task/draft/approval counts, this-month spend vs cap,
 * a recent-activity feed, and integration health (configured booleans only,
 * never secret values).
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  // Spend (shared projection math — see lib/growth/spend.ts).
  const spend = await spendBlock();

  if (!supabaseAdmin) {
    return res.status(200).json({
      ok: true,
      requestId,
      configured: false,
      lastCronRun: null,
      counts: { pages: 0, openTasks: 0, draftsByStatus: {}, approvalsThisMonth: 0 },
      spend,
      recentActivity: [],
      stuckRuns: [],
      integrations: integrationFlags(),
    });
  }

  const startIso = monthStartIso();
  // A run is "stuck" if it's still 'running' more than 1 hour after it started
  // — the daily cron should finish in minutes, so this flags a timed-out /
  // crashed run that never got its 'completed' or 'failed' status (the audit
  // runner now sets 'failed' in a try/finally, but a hard Vercel timeout can
  // still kill the function before the finally runs).
  const stuckThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString();
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
    stuckRuns,
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
    supabaseAdmin.from("growth_crawl_runs").select("id,domain,started_at").eq("status", "running").lt("started_at", stuckThreshold).order("started_at", { ascending: false }).limit(10),
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
    stuckRuns: (stuckRuns.data ?? []) as { id: string; domain: string; started_at: string }[],
    integrations: integrationFlags(),
  });
}

/** Configured-boolean per integration. Booleans only — never secret values. */
function integrationFlags() {
  return {
    gemini: !!process.env.GEMINI_API_KEY,
    supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    // Match the real read path in performance.ts: the shared GOOGLE_* pair backs
    // BOTH panels (GA4_CLIENT_EMAIL → GSC_CLIENT_EMAIL → GOOGLE_CLIENT_EMAIL, same
    // for the key). Without this, the panel reports "not configured" while data
    // flows when the operator sets only GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY.
    ga4: !!(process.env.GA4_PROPERTY_ID && googleClientEmail() && googlePrivateKey()),
    gsc: !!(process.env.GSC_SITE_URL && googleClientEmail() && googlePrivateKey()),
    instagram: !!(process.env.IG_USER_ID && process.env.META_ACCESS_TOKEN),
    linkedinApi: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_AUTHOR_URN),
  };
}