import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getAnalyticsSnapshot, syncAnalyticsToKB } from "../../lib/growth/performance.js";
import { summarizeSnapshot } from "../../lib/growth/analyticsInsights.js";
import { listAnalyticsInsights, lastAnalyticsSyncAt } from "../../lib/growth/knowledge.js";

/** GET /api/growth/performance — GA4 + GSC snapshot + stored analytics insights
 *  (graceful when not configured). Read-only: a metrics dashboard should not
 *  mutate storage. The snapshot pulls live Google data; `insights` are the
 *  recommendations saved by the last sync (so the founder sees them without a
 *  re-sync). `lastSyncAt` is the timestamp of the most recent stored insight.
 *
 *  POST /api/growth/performance {days?} — manual "Sync Analytics": pull the
 *  snapshot, generate insights, store them to the knowledge base. Admin-only. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "POST") {
    const days = clampDays(req.body?.days ?? 28);
    const result = await syncAnalyticsToKB(days);
    return res.status(200).json({ ok: true, requestId: admin.requestId, sync: result });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const days = clampDays(typeof req.query?.days === "string" ? Number(req.query.days) : 28);
  const [snapshot, insights, lastSyncAt] = await Promise.all([
    getAnalyticsSnapshot(days),
    listAnalyticsInsights(30),
    lastAnalyticsSyncAt(),
  ]);

  return res.status(200).json({
    ok: true,
    requestId: admin.requestId,
    snapshot,
    summary: summarizeSnapshot(snapshot),
    insights,
    lastSyncAt,
  });
}

function clampDays(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 28;
  return Math.min(Math.max(Math.round(n), 1), 90);
}