import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getGa4Metrics, getGscMetrics } from "../../lib/growth/performance.js";

/** GET /api/growth/performance — GA4 + GSC metrics (graceful when not configured).
 *
 * Read-only. (Previously this endpoint wrote a row to growth_performance_snapshots
 * on every GET — unbounded write-on-read storage that nothing ever read back.
 * Removed: the table is dead, and a metrics dashboard should not mutate storage.) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const [ga4, gsc] = await Promise.all([getGa4Metrics(), getGscMetrics()]);

  return res.status(200).json({ ok: true, requestId: admin.requestId, ga4, gsc });
}