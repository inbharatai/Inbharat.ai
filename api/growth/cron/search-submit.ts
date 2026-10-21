import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronAuthErr, authorizeCron } from "../../lib/requireAdmin.js";
import { logInfo, logError } from "../../../lib/growth/authorization.js";
import { SITE } from "../../../seo.config.js";
import {
  INDEXNOW_KEY,
  parseSitemap,
  submitIndexNow,
  submitSitemapToGsc,
  type SubmitOutcome,
} from "../../../lib/growth/search-submit.js";
import { googleClientEmail, googlePrivateKey, getServiceAccountToken } from "../../../lib/growth/performance.js";

export interface SearchSubmitRun {
  urls: number;
  outcomes: SubmitOutcome[];
}

/**
 * Daily search-engine submission cron — the autonomous "tell the engines"
 * half of the visibility loop (the site's own crawler/audit half runs in the
 * daily growth cron). Reads our own published sitemap.xml and pushes:
 *
 *   1. A sitemap re-submission to Google Search Console (service-account
 *      token; needs the `webmasters` scope granted to the service account —
 *      degrades to an honest failure detail when the grant is missing).
 *   2. The sitemap URL set to IndexNow (Bing/Yandex/Seznam aggregator).
 *      Validates the deployed public key file first (/<key>.txt from this
 *      repo's public/); fails honestly when it is not yet live.
 *
 * Both channels are idempotent for unchanged URLs. Invoked three ways, all
 * authenticated by authorizeCron:
 *   - Vercel's scheduled cron (GET, user-agent vercel-cron).
 *   - An external scheduler carrying CRON_SECRET.
 *   - An authenticated admin hitting "Submit now" (POST).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = await authorizeCron(req);
  if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);

  await logInfo("cron-search-submit-start", "global", `trigger=${cron.source}`);

  const outcomes: SubmitOutcome[] = [];
  try {
    // Our own canonical sitemap only — never any third-party URL.
    const sitemapUrl = `${SITE.url}/sitemap.xml`;
    const smRes = await fetch(sitemapUrl, { headers: { "User-Agent": "InBharatGrowthAgent/1.0 (search-submit)" } });
    if (!smRes.ok) {
      await logInfo("cron-search-submit-done", "global", `trigger=${cron.source} sitemap-fetch=${smRes.status}`);
      return res.status(200).json({
        ok: true, requestId, configured: false,
        detail: `could not fetch own sitemap (${smRes.status}) — nothing submitted`,
        outcomes,
      });
    }
    const entries = parseSitemap(await smRes.text());
    const urls = entries.map((e) => e.loc);
    if (urls.length) {
      // Google Search Console (scope may be ungranted; reports honestly).
      const email = googleClientEmail();
      const key = googlePrivateKey();
      if (email && key) {
        try {
          const token = await getServiceAccountToken(email, key, "https://www.googleapis.com/auth/webmasters");
          outcomes.push(await submitSitemapToGsc(fetch, SITE.url, `${SITE.url}/sitemap.xml`, token));
        } catch (e) {
          await logError("search-submit-gsc-token", "global", (e as Error).message);
          outcomes.push({ channel: "gsc-sitemap", status: "failed", detail: `token error: ${(e as Error).message?.slice(0, 100)}` });
        }
      } else {
        outcomes.push({ channel: "gsc-sitemap", status: "unconfigured", detail: "no Google service-account credentials configured" });
      }

      // IndexNow (key file must be live on the canonical host).
      try {
        const keyFile = await fetch(`${SITE.url}/${INDEXNOW_KEY}.txt`);
        if (keyFile.ok && (await keyFile.text()).trim() === INDEXNOW_KEY) {
          outcomes.push(await submitIndexNow(fetch, `${SITE.url.replace(/\/$/, "")}`, INDEXNOW_KEY, urls));
        } else {
          outcomes.push({ channel: "indexnow", status: "unconfigured", detail: `key file not live at /${INDEXNOW_KEY}.txt (deploy public/ key file)` });
        }
      } catch (e) {
        outcomes.push({ channel: "indexnow", status: "failed", detail: `key file check: ${(e as Error).message?.slice(0, 100)}` });
      }
    }

    await logInfo("cron-search-submit-done", "global",
      `trigger=${cron.source} urls=${urls.length} ` +
      outcomes.map((o) => `${o.channel}=${o.status}`).join(", "));
    return res.status(200).json({ ok: true, requestId, configured: true, urls: urls.length, outcomes });
  } catch (e) {
    await logError("cron-search-submit-error", "global", (e as Error).message);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Search submit failed", requestId, outcomes });
  }
}