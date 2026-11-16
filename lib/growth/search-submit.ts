/**
 * InBharat Growth Agent — Search-engine submission lane.
 *
 * Purpose: make the loop autonomous end-to-end — when content changes, the
 * site tells search engines directly, without waiting for organic re-crawl
 * and without human clicks. This PUSHES only URLs of our own canonical host,
 * taken from our own generated sitemap. It never crawls or submits third-
 * party pages. Two channels:
 *
 *   1. Google Search Console sitemap submission (GSC API
 *      `PUT /webmasters/v3/sites/{site}/sitemaps/{feedpath}`) through the same
 *      service-account token helper used elsewhere in lib/growth. Note: the
 *      sitemap-submit call needs the `webmasters` scope — performance.ts uses
 *      `webmasters.readonly`, so this lane requests `webmasters` and honestly
 *      reports `failed` (forbidden) when that grant is absent in GSC.
 *   2. IndexNow (Bing/Yandex/Seznam via api.indexnow.org, the multi-engine
 *      aggregator). The public key is intentionally a commit constant: the
 *      key file public/<key>.txt must be publicly fetchable for engines to
 *      validate, so there is no secret to protect — a deploy that ships the
 *      file enables the channel with zero human registration steps.
 *
 * Both channels are idempotent for unchanged URLs, so the daily cron submits
 * the current sitemap set without diff-state bookkeeping. Every channel
 * degrades to an honest status: unconfigured / failed — never a fake success.
 *
 * Pure helpers are hermetically testable (fetch is injected). Server-only.
 */

/** IndexNow key — public identifier, must match public/<key>.txt exactly. */
export const INDEXNOW_KEY = "8700c344722a9031eeb0a28c40b2283f40da16368a3a121b18985ee3a3dbf4a6";

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export type SubmitChannel = "gsc-sitemap" | "indexnow";
export type SubmitStatus = "submitted" | "failed" | "unconfigured";
export interface SubmitOutcome {
  channel: SubmitChannel;
  status: SubmitStatus;
  detail: string;
  urls?: number;
  httpStatus?: number;
}

/** Pure: parse a `<urlset>` sitemap into entries. Anything unparseable → []. */
export function parseSitemap(xml: string): SitemapEntry[] {
  if (typeof xml !== "string" || !/<urlset/i.test(xml)) return [];
  const entries: SitemapEntry[] = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(xml))) {
    const block = m[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/i.exec(block)?.[1];
    if (!loc) continue;
    const lm = /<lastmod>\s*([\d-]+)\s*<\/lastmod>/i.exec(block)?.[1];
    entries.push(lm ? { loc, lastmod: lm } : { loc });
  }
  return entries;
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** Input is our canonical origin; the protocol's `host` is a bare hostname. */
export function buildIndexNowPayload(origin: string, key: string, urls: string[]): IndexNowPayload | { error: string } {
  let base: URL;
  try { base = new URL(origin); } catch { return { error: "bad origin" }; }
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.port ||
      base.pathname !== "/" || base.search || base.hash || !/^[a-f0-9]{8,128}$/.test(key)) {
    return { error: "bad input" };
  }
  const clean = [...new Set(urls.filter((value) => {
    try {
      const url = new URL(value);
      return url.origin === base.origin && !url.username && !url.password && !url.hash;
    } catch { return false; }
  }))];
  if (!clean.length) return { error: "no same-origin urls" };
  if (clean.length > 10000) return { error: "batch exceeds IndexNow 10000 URL limit" };
  return { host: base.hostname, key, keyLocation: `${base.origin}/${key}.txt`, urlList: clean };
}

/** Require the explicitly configured GSC property, never guess a different one. */
export function gscPropertyCoversSite(property: string, origin: string): boolean {
  try {
    const site = new URL(origin);
    if (property.startsWith("sc-domain:")) {
      const domain = property.slice("sc-domain:".length);
      return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain) &&
        (site.hostname === domain.toLowerCase() || site.hostname.endsWith(`.${domain.toLowerCase()}`));
    }
    const scope = new URL(property);
    return scope.origin === site.origin && scope.pathname === "/" && !scope.search &&
      !scope.hash && !scope.username && !scope.password;
  } catch { return false; }
}

/** Pure: GSC "resubmit sitemap" endpoint for the sitemap PUT. */
export function gscSitemapUrl(siteUrl: string, feedpath: string): string {
  // URL-prefix properties include their registered trailing slash; domain
  // properties use sc-domain:. Preserve the exact configured identifier.
  const encodedSite = encodeURIComponent(siteUrl);
  return `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodeURIComponent(feedpath)}`;
}

/**
 * Pure-ish: GSC sitemap PUT. `fetchLike` is injected (hermetic tests).
 * Needs the `webmasters` scope (not readonly) — a missing grant surfaces as
 * a 403, which the caller reports honestly.
 */
export async function submitSitemapToGsc(
  fetchLike: typeof fetch,
  siteUrl: string,
  feedpath: string,
  token: string,
): Promise<SubmitOutcome> {
  try {
    const res = await fetchLike(gscSitemapUrl(siteUrl, feedpath), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 200 && res.status < 300) {
      return { channel: "gsc-sitemap", status: "submitted", detail: `sitemap PUT accepted (${feedpath})`, httpStatus: res.status };
    }
    return { channel: "gsc-sitemap", status: "failed", detail: `GSC responded ${res.status}${res.status === 403 ? " (site must be added + delegate the service account in Search Console)" : ""}`, httpStatus: res.status };
  } catch (e) {
    return { channel: "gsc-sitemap", status: "failed", detail: `network error: ${(e as Error).message?.slice(0, 120)}` };
  }
}

/**
 * Pure-ish: IndexNow submission through the api.indexnow.org aggregator.
 * Engines validate the key at keyLocation, so the key file must be deployed
 * before submissions start working — the cron checks `verifyKeyFile` first.
 */
export async function submitIndexNow(
  fetchLike: typeof fetch,
  host: string,
  key: string,
  urls: string[],
): Promise<SubmitOutcome> {
  const payload = buildIndexNowPayload(host, key, urls);
  if ("error" in payload) {
    return { channel: "indexnow", status: "failed", detail: `payload: ${payload.error}` };
  }
  try {
    const res = await fetchLike("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    // IndexNow returns 200/202 accepted; 4xx are client problems (bad key,
    // wrong key file) and 5xx means retry-later — reported as failed, not swallowed.
    if (res.status >= 200 && res.status < 300) {
      return { channel: "indexnow", status: "submitted", detail: res.status === 202
        ? "URL batch received; key validation pending. Indexing is not confirmed."
        : "URL batch received. Indexing is not confirmed.", urls: payload.urlList.length, httpStatus: res.status };
    }
    return { channel: "indexnow", status: "failed", detail: `IndexNow responded ${res.status}${res.status === 400 || res.status === 403 ? " (check key/keyLocation)" : ""}`, urls: urls.length, httpStatus: res.status };
  } catch (e) {
    return { channel: "indexnow", status: "failed", detail: `network error: ${(e as Error).message?.slice(0, 120)}` };
  }
}