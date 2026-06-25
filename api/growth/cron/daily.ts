import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronErr, requireCron } from "../../lib/requireAdmin.js";
import { auditDomain } from "../../../lib/growth/audit-runner.js";
import { getAuthorizedAssets, logInfo } from "../../../lib/growth/authorization.js";
import { promoteArticle } from "../../../lib/growth/promoter.js";

const ARTICLE_PATH_PREFIX = "/learn-ai-with-reeturaj/";

/** POST /api/growth/cron/daily — daily audit of all authorized domains + enqueue human-gated promotion drafts for "Build AI with Reeturaj" articles. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = requireCron(req);
  if (isCronErr(cron)) return res.status(cron.status).json(cron.body);

  const assets = getAuthorizedAssets().filter((a) => a.canAudit && a.canCrawl && a.status !== "planned");
  const results: { domain: string; status: string; pages?: number; error?: string; promoted?: number }[] = [];

  for (const asset of assets) {
    try {
      const run = await auditDomain(asset.domain);
      const promoted = asset.canDraft ? await enqueueArticlePromotions(run.pages || []) : 0;
      results.push({ domain: asset.domain, status: run.status, pages: run.pagesCount, promoted });
    } catch (e) {
      const msg = (e as Error).message;
      results.push({ domain: asset.domain, status: "failed", error: msg });
      await logInfo("cron-daily-fail", asset.domain, msg);
    }
  }

  return res.status(200).json({ ok: true, requestId: cron.requestId, results });
}

/**
 * For every audited page that is a "Build AI with Reeturaj" article, enqueue a
 * human-gated LinkedIn promotion draft. promoteArticle is idempotent (skips
 * URLs that already have a 'linkedin' draft), so re-running the cron daily
 * only drafts newly-published articles. Each call is wrapped so one failure
 * doesn't abort the rest. Returns the count of newly drafted (non-skipped) URLs.
 */
async function enqueueArticlePromotions(
  pages: { url: string; title?: string; metaDescription?: string }[],
): Promise<number> {
  let drafted = 0;
  for (const page of pages) {
    if (!page.url.includes(ARTICLE_PATH_PREFIX)) continue;
    try {
      const draft = await promoteArticle(page.url, { title: page.title, description: page.metaDescription });
      if (draft.status === "pending") drafted++;
    } catch (e) {
      // authorization failure / model error for one article → log + continue
      await logInfo("cron-promote-fail", page.url, (e as Error).message).catch(() => undefined);
    }
  }
  return drafted;
}