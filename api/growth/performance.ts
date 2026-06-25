import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getGa4Metrics, getGscMetrics } from "../../lib/growth/performance.js";
import { getAuthorizedAssets } from "../../lib/growth/authorization.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

/** GET /api/growth/performance — GA4 + GSC metrics for authorized domains (graceful when not configured). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const [ga4, gsc] = await Promise.all([getGa4Metrics(), getGscMetrics()]);

  // Persist snapshots when DB present (best-effort).
  if (supabaseAdmin) {
    const now = new Date().toISOString();
    try {
      const rows = [];
      if (ga4.configured && ga4.data) rows.push({ domain: "all", source: "ga4", metrics: ga4.data, captured_at: now });
      if (gsc.configured && gsc.data) rows.push({ domain: "all", source: "gsc", metrics: gsc.data, captured_at: now });
      if (rows.length) await supabaseAdmin.from("growth_performance_snapshots").insert(rows);
    } catch {
      // best-effort
    }
  }

  return res.status(200).json({
    ok: true,
    requestId: admin.requestId,
    assets: getAuthorizedAssets().map((a) => ({ domain: a.domain, name: a.name, status: a.status })),
    ga4,
    gsc,
  });
}