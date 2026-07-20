/**
 * Truthful sitemap <lastmod> computation.
 *
 * `scripts/build-seo.ts buildSitemap` previously used the build date as lastmod
 * for every non-article route — so a no-op rebuild made every URL look freshly
 * modified, which dilutes crawl prioritization. This module computes a real
 * content-modification date per route and is pure (the git lookup is injected)
 * so it can be exercised hermetically by scripts/test-growth.ts.
 *
 * - Article route  → the article's `datePublished` (truthful publish date).
 * - Hub route      → max git date across its backing sources (the grid changes
 *                    when `content/articles.meta.ts` changes, i.e. when an
 *                    article is added).
 * - Other routes   → max git date of the page + `seo.config.ts` (the crawlable
 *                    seoBody lives in seo.config.ts, so an edit there IS a
 *                    content change).
 * - No git date    → the caller's fallback (today), preserving old behavior.
 */
import type { SeoRoute } from "../../seo.config.js";

/**
 * Route path → source files whose content backs the crawlable shell. The max
 * git commit date across these files is that route's lastmod. Keep this in
 * sync with ROUTES in seo.config.ts — scripts/test-growth.ts asserts every
 * indexable non-article route is listed here (so no route silently falls back
 * to the build date).
 */
export const ROUTE_LASTMOD_SOURCE: Record<string, string[]> = {
  "/": ["pages/Landing.tsx", "seo.config.ts"],
  // No pages/App.tsx — the console UI lives in components/, but the crawlable
  // shell content (seoBody) is authored in seo.config.ts, so that is the
  // truthful lastmod source for /app.
  "/app": ["seo.config.ts"],
  "/about": ["pages/About.tsx", "seo.config.ts"],
  // articles.meta.ts is a source for the hub so adding an article bumps the
  // hub lastmod (the baked article grid changes).
  "/learn-ai-with-reeturaj": [
    "pages/LearnAIWithReeturaj.tsx",
    "seo.config.ts",
    "content/articles.meta.ts",
  ],
  "/contact": ["pages/Contact.tsx", "seo.config.ts"],
  "/privacy": ["pages/Privacy.tsx", "seo.config.ts"],
  "/terms": ["pages/Terms.tsx", "seo.config.ts"],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure lastmod computation. `gitDateForFile` returns a `YYYY-MM-DD` string or
 * null (tests stub it; build-seo.ts wires it to `git log -1 --format=%cI`).
 * `fallback` is used only when no git date is available for the route.
 */
export function computeRouteLastmod(
  route: SeoRoute,
  articleDate: string | null,
  gitDateForFile: (file: string) => string | null,
  fallback: string,
): string {
  // Article routes use the manifest's truthful publish date.
  if (route.articleSlug && articleDate && DATE_RE.test(articleDate)) {
    return articleDate;
  }
  const files = ROUTE_LASTMOD_SOURCE[route.path] ?? [];
  const dates = files
    .map(gitDateForFile)
    .filter((d): d is string => !!d && DATE_RE.test(d))
    .sort();
  return dates.length ? dates[dates.length - 1] : fallback;
}