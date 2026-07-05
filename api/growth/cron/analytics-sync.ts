import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronAuthErr, authorizeCron } from "../../lib/requireAdmin.js";
import { logInfo, logError } from "../../../lib/growth/authorization.js";
import { syncAnalyticsToKB } from "../../../lib/growth/performance.js";

/**
 * Daily analytics-sync cron. Pulls the GA4 + Search Console snapshot for the
 * last 28 days, generates actionable insights (low-CTR pages, rising/falling
 * pages, top queries, follow-up article opportunities, product/country/device
 * angles), and stores them in growth_knowledge (source_type 'analytics' /
 * 'search_console'). The founder reviews them in the Knowledge UI + Performance
 * page; the agent retrieves them before drafting so the next article is
 * data-driven.
 *
 * Invoked three ways, all authenticated by authorizeCron:
 *   - Vercel's scheduled cron (GET, user-agent vercel-cron) — the daily run.
 *   - An external scheduler carrying CRON_SECRET.
 *   - An authenticated admin hitting "Sync now" (POST).
 * Degrades honestly to configured:false when the Google service-account
 * credentials are absent (the panel shows the "connect credentials" state).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = await authorizeCron(req);
  if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);

  await logInfo("cron-analytics-sync-start", "global", `trigger=${cron.source}`);

  try {
    const result = await syncAnalyticsToKB(28);
    await logInfo(
      "cron-analytics-sync-done",
      "global",
      `trigger=${cron.source} configured=${result.configured} insights=${result.insights} synced=${result.synced} errors=${result.errors}`,
    );
    return res.status(200).json({
      ok: true,
      requestId: cron.requestId,
      trigger: cron.source,
      configured: result.configured,
      insights: result.insights,
      synced: result.synced,
      errors: result.errors,
      summary: result.summary,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logError("cron-analytics-sync-fail", "global", msg).catch(() => undefined);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: msg, requestId });
  }
}