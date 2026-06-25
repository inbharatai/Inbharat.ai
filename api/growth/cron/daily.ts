import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronErr, requireCron } from "../../lib/requireAdmin.js";
import { auditDomain } from "../../../lib/growth/audit-runner.js";
import { getAuthorizedAssets, logInfo } from "../../../lib/growth/authorization.js";

/** POST /api/growth/cron/daily — daily audit of all authorized domains (Phase 1: audit-only). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = requireCron(req);
  if (isCronErr(cron)) return res.status(cron.status).json(cron.body);

  const assets = getAuthorizedAssets().filter((a) => a.canAudit && a.canCrawl && a.status !== "planned");
  const results: { domain: string; status: string; pages?: number; error?: string }[] = [];

  for (const asset of assets) {
    try {
      const run = await auditDomain(asset.domain);
      results.push({ domain: asset.domain, status: run.status, pages: run.pagesCount });
    } catch (e) {
      const msg = (e as Error).message;
      results.push({ domain: asset.domain, status: "failed", error: msg });
      await logInfo("cron-daily-fail", asset.domain, msg);
    }
  }

  return res.status(200).json({ ok: true, requestId: cron.requestId, results });
}