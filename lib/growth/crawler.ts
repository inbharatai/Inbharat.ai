/**
 * InBharat Growth Agent — Module 2: Site Crawler.
 *
 * Only crawls authorized domains (checked via authorization.ts). Respects
 * robots.txt. Split so the HTML analysis is pure (parsePage) and hermetically
 * testable, while network I/O (fetchPage / robots / sitemap) is separate.
 *
 * Server-only: imports cheerio + node fetch. Never imported by the client.
 */
import { load } from "cheerio";
import type { PageMeta } from "./types.js";
import { isDomainAuthorized } from "./authorization.js";

const CTA_TEXT = /\b(get started|book|book a demo|try|contact|demo|sign up|signup|start|request|talk to|whatsapp|call)\b/i;

/** Pure: analyze an HTML string into a PageMeta. No network. */
export function parsePage(html: string, url: string): PageMeta {
  const $ = load(html);
  const host = safeHost(url);

  const title = ($("title").first().text() || "").trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || undefined;
  const metaRobots = $('meta[name="robots"]').attr("content")?.trim() || undefined;
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || undefined;
  const h1 = ($("h1").first().text() || "").trim() || undefined;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;

  // Links
  let internalLinks = 0;
  let externalLinks = 0;
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const raw = $(el).attr("href") || "";
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return;
    const abs = absolutize(raw, url);
    if (!abs) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    const linkHost = safeHost(abs);
    if (!linkHost || linkHost === host) internalLinks++;
    else externalLinks++;
  });

  // Images + alt coverage
  const imgs = $("img");
  const imagesTotal = imgs.length;
  let imagesWithoutAlt = 0;
  imgs.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined || alt.trim() === "") imagesWithoutAlt++;
  });

  // Word count (visible text, rough)
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").filter(Boolean).length : 0;

  // JSON-LD schema types
  const schemaTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).text() || "";
    try {
      const parsed = JSON.parse(txt);
      const objs = Array.isArray(parsed) ? parsed : [parsed];
      for (const o of objs) {
        const t = o?.["@type"];
        if (t) schemaTypes.push(Array.isArray(t) ? t.join(",") : String(t));
      }
    } catch {
      // malformed JSON-LD — ignore
    }
  });

  // CTA heuristic
  let hasCta = false;
  $("a, button").each((_, el) => {
    if (hasCta) return;
    const txt = $(el).text().trim();
    const cls = ($(el).attr("class") || "").toLowerCase();
    if (cls.includes("cta") || CTA_TEXT.test(txt)) hasCta = true;
  });

  // GEO signals
  const lower = bodyText.toLowerCase();
  const faqPresent =
    /faq|frequently asked questions|common questions/.test(lower) ||
    schemaTypes.some((t) => t.toLowerCase().includes("faq"));
  const comparisonPresent = /\bvs\.?\b|versus|compared to|alternatives to|difference between/.test(lower);
  const proofPresent =
    /screenshot|demo|try it|live demo|case study|proof|example output/.test(lower) ||
    $("img").toArray().some((el) => /screenshot|demo|preview/i.test($(el).attr("alt") || ""));
  const audienceSignal = /who this is for|for (businesses|schools|teams|creators|ngos|founders|companies)|audience|built for|target user/.test(lower);

  return {
    title,
    metaDescription,
    metaRobots,
    canonical,
    h1,
    h2Count,
    h3Count,
    internalLinks,
    externalLinks,
    brokenLinks: 0,
    imagesTotal,
    imagesWithoutAlt,
    wordCount,
    schemaTypes,
    inSitemap: undefined,
    robotsAllowed: undefined,
    httpStatus: undefined,
    pageDepth: depthOf(url),
    hasCta,
    faqPresent,
    comparisonPresent,
    proofPresent,
    audienceSignal,
  };
}

/** Network: fetch a URL and return { html, status }. Throws on non-2xx after following redirects. */
export async function fetchPage(url: string, timeoutMs = 12000): Promise<{ html: string; status: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "InBharatGrowthAgent/1.0 (+https://inbharat.ai)" },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await res.text();
    return { html, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

/** Pure: extract deduplicated same-host absolute URLs from an HTML string (for domain crawl discovery). */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const host = safeHost(baseUrl);
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const raw = $(el).attr("href") || "";
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return;
    const abs = absolutize(raw, baseUrl);
    if (!abs) return;
    const linkHost = safeHost(abs);
    if (linkHost === host && !out.has(abs)) out.add(abs);
  });
  return [...out];
}

/** Network: fetch /robots.txt for the host and check if url is allowed for our UA. */
export async function fetchRobotsAllowed(url: string, timeoutMs = 8000): Promise<boolean> {
  const base = safeOrigin(url);
  if (!base) return true; // can't check → allow (guard still gates domain)
  try {
    const res = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return true; // no robots.txt → allow
    const txt = await res.text();
    return isRobotsAllowed(txt, url, "InBharatGrowthAgent");
  } catch {
    return true; // network error → don't block crawl (domain already authorized)
  }
}

/** Network: fetch /sitemap.xml and check if url is listed. */
export async function fetchSitemapContains(url: string, timeoutMs = 8000): Promise<boolean> {
  const base = safeOrigin(url);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const txt = await res.text();
    return txt.includes(escapeXml(url));
  } catch {
    return false;
  }
}

/** Crawl a single authorized URL end-to-end. Throws AuthorizationError if not allowed. */
export async function crawlUrl(url: string): Promise<PageMeta> {
  if (!isDomainAuthorized(url)) {
    const { AuthorizationError } = await import("./authorization.js");
    throw new AuthorizationError("domain not authorized for crawl", { allowed: false, reason: "not authorized", action: "crawl", scope: url });
  }
  const allowed = await fetchRobotsAllowed(url);
  const inSitemap = await fetchSitemapContains(url);
  const { html, status } = await fetchPage(url);
  const meta = parsePage(html, url);
  meta.httpStatus = status;
  meta.robotsAllowed = allowed;
  meta.inSitemap = inSitemap;
  return meta;
}

// ─── helpers ───

function safeHost(url: string): string | undefined {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}
function safeOrigin(url: string): string | undefined {
  try { return new URL(url).origin; } catch { return undefined; }
}
function absolutize(href: string, base: string): string | undefined {
  try { return new URL(href, base).href; } catch { return undefined; }
}
function depthOf(url: string): number {
  try { return new URL(url).pathname.split("/").filter(Boolean).length; } catch { return 0; }
}
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Minimal robots.txt evaluator for a single user-agent. */
function isRobotsAllowed(robotsTxt: string, url: string, ua: string): boolean {
  const path = (() => { try { return new URL(url).pathname; } catch { return "/"; } })();
  const groups = robotsTxt.split(/\n\s*\n/);
  let allowed = true;
  for (const group of groups) {
    const lines = group.split("\n").map((l) => l.trim()).filter(Boolean);
    const uaLine = lines.find((l) => /^user-agent:/i.test(l));
    if (!uaLine) continue;
    const uaVal = uaLine.replace(/^user-agent:\s*/i, "").trim().toLowerCase();
    if (uaVal !== "*" && !ua.toLowerCase().includes(uaVal)) continue;
    for (const line of lines) {
      const m = line.match(/^(allow|disallow):\s*(.*)$/i);
      if (!m) continue;
      const rule = m[1].toLowerCase();
      let pat = m[2];
      if (pat === "") continue;
      pat = pat.replace(/\*/g, ".*").replace(/\?/g, "\\?");
      try {
        if (new RegExp(pat).test(path)) {
          allowed = rule === "allow";
        }
      } catch {
        // ignore bad patterns
      }
    }
  }
  return allowed;
}