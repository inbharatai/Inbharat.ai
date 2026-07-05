import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronAuthErr, authorizeCron } from "../../lib/requireAdmin.js";
import { logInfo, logError } from "../../../lib/growth/authorization.js";
import { discoverAllProducts, type DiscoverResult } from "../../../lib/growth/topicDiscovery.js";

/**
 * Weekly topic-discovery cron (Phase 3). Runs discoverAllProducts — Serper-backed
 * high-intent topic search across every InBharat product, scored 0-100 across 12
 * dimensions, deduped against the KB + published articles, and saved as
 * discovered/needs_review topic rows in growth_knowledge. The founder approves/
 * rejects in the Knowledge UI; approved topics become the calendar fallback.
 *
 * Invoked three ways, all authenticated by authorizeCron:
 *   - Vercel's scheduled cron (GET, user-agent vercel-cron) — the weekly run.
 *   - An external scheduler carrying CRON_SECRET.
 *   - An authenticated admin hitting "Run now" (POST).
 * Degrades honestly to notConfigured when SERPER_API_KEY is unset.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = await authorizeCron(req);
  if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);

  await logInfo("cron-topic-discovery-start", "global", `trigger=${cron.source}`);

  try {
    const results: DiscoverResult[] = await discoverAllProducts();
    const totalDiscovered = results.reduce((n, r) => n + r.discovered, 0);
    const totalSaved = results.reduce((n, r) => n + r.saved, 0);
    const totalDupes = results.reduce((n, r) => n + r.duplicates, 0);
    const notConfigured = results.filter((r) => r.notConfigured).map((r) => r.product);

    await logInfo(
      "cron-topic-discovery-done",
      "global",
      `trigger=${cron.source} discovered=${totalDiscovered} saved=${totalSaved} duplicates=${totalDupes} notConfigured=${notConfigured.join(",") || "none"}`,
    );

    return res.status(200).json({
      ok: true,
      requestId: cron.requestId,
      trigger: cron.source,
      discovered: totalDiscovered,
      saved: totalSaved,
      duplicates: totalDupes,
      notConfigured,
      products: results.map((r) => ({ product: r.product, discovered: r.discovered, saved: r.saved, duplicates: r.duplicates, notConfigured: r.notConfigured })),
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logError("cron-topic-discovery-fail", "global", msg).catch(() => undefined);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: msg, requestId });
  }
}