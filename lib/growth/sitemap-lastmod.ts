/** Truthful sitemap dates: never substitute build time for missing history. */
import { validArticleDate } from '../../content/article-lifecycle.js';
import type { SeoRoute } from "../../seo.config.js";

/**
 * Route path → source files whose content backs the crawlable shell. The max
 * git commit date across these files is that route's lastmod. Keep this in
 * sync with ROUTES in seo.config.ts — scripts/test-growth.ts asserts every
 * indexable non-article route is listed here (so missing source coverage is explicit).
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
  // Private-AI/UnoOne suite: claim content and crawlable shells are authored in
  // content/privateAI.ts; the page views and the device composition live in
  // pages/unoone/ and components/landing/.
  "/private-ai": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
  "/unoone": [
    "content/privateAI.ts",
    "pages/unoone/UnoOnePages.tsx",
    "components/landing/UnoOneDevices.tsx",
    "seo.config.ts",
  ],
  "/unoone/power": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
  "/unoone/mobile": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
  "/unoone/sync": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
  "/enterprise-ai": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
  "/technology": ["content/privateAI.ts", "pages/unoone/UnoOnePages.tsx", "seo.config.ts"],
};

/** Article date must be selected with articleLastmod (modification then publication).
 * `today` is a validation ceiling, NOT a fallback. Unknown lastmod is omitted.
 */
export function computeRouteLastmod(
  route: SeoRoute,
  articleDate: string | null,
  gitDateForFile: (file: string) => string | null,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  if (route.articleSlug) return validArticleDate(articleDate, today) ? articleDate : null;
  const files = ROUTE_LASTMOD_SOURCE[route.path] ?? [];
  const dates = files.map(gitDateForFile).filter((d): d is string => validArticleDate(d, today)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
