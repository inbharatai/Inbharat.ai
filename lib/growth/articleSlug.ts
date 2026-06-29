/**
 * InBharat Growth Agent — pure helper: extract an article slug from its URL.
 *
 * Article URLs follow the shape `https://inbharat.ai/learn-ai-with-reeturaj/<slug>`
 * (see `articlePath` in `content/articles.meta.ts`). Two Issues-page call sites
 * need this: (1) the LinkedIn draft card looks the source article up in the local
 * ARTICLES registry to show its real description (works for OLD drafts too — no
 * DB migration); (2) on-demand cover generation derives the slug from a page URL.
 *
 * Behaviour: take only the FIRST path segment after the prefix (cut at the first
 * `/`, `?`, or `#`), trim, then validate against `^[a-z0-9-]+$` so a malformed or
 * non-article URL returns null rather than a garbage slug that would miss the
 * registry. Pure + side-effect-free so it can be unit-tested hermetically (no
 * React, no DB, no Gemini) — kept OUT of the .tsx page component for that reason.
 */

/** The URL prefix that identifies an article page (mirrors `articlePath`). */
export const ARTICLE_PATH_PREFIX = "/learn-ai-with-reeturaj/";

/** Pull the slug out of an article URL, or null when it isn't an article URL.
 *
 *  Accepts absolute (`https://inbharat.ai/...`, `https://www.inbharat.ai/...`)
 *  and root-relative (`/learn-ai-with-reeturaj/<slug>`) forms, with optional
 *  trailing slash, query, or fragment. Returns only the first path segment, so
 *  `.../<slug>/extra` yields `<slug>`, and validates it is a lowercase-hyphen
 *  slug before returning — anything else (uppercase, dots, extra segments) is
 *  treated as not-an-article and returns null. */
export function slugFromArticleUrl(u?: string | null): string | null {
  if (!u) return null;
  const i = u.indexOf(ARTICLE_PATH_PREFIX);
  if (i < 0) return null;
  const tail = u
    .slice(i + ARTICLE_PATH_PREFIX.length)
    .replace(/[/?#].*$/, "")
    .trim();
  return /^[a-z0-9-]+$/.test(tail) ? tail : null;
}