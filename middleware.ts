/**
 * Vercel Edge Middleware.
 *
 * 1. Static-asset guard: the matcher runs ONLY for SPA routes. All static
 *    assets are excluded so middleware never runs for /favicon.ico, /robots.txt,
 *    /sitemap.xml, /assets/*, or any path ending in a static extension.
 *    Behavior is identical on Production and Preview.
 * 2. Unknown-article 404: for /learn-ai-with-reeturaj/:slug, if the slug is not
 *    a published article, return a TRUE HTTP 404 instead of letting the
 *    catch-all rewrite (vercel.json:/(.*)→/index.html) serve the SPA with 200
 *    (a soft-404 Googlebot would index as a blank 200 page). The known-slug set
 *    is imported from the article manifest at build time (no runtime DB/FS
 *    read at the edge). Known slugs, "/", and "/app" pass through unchanged so
 *    Vercel serves their prebuilt static shells.
 */
import { ARTICLES } from "./content/articles.meta.js";

const KNOWN_ARTICLE_SLUGS = new Set(ARTICLES.map((a) => a.slug));

const ARTICLE_PREFIX = "/learn-ai-with-reeturaj/";

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Not found — InBharat AI</title>
<meta name="robots" content="noindex" />
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:3rem 1.5rem;text-align:center;line-height:1.6}
  h1{font-size:1.6rem;margin:1.5rem 0 .5rem}
  p{color:#9aafc6;margin:.5rem 0}
  a{color:#58a6ff;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
  <h1>404 — Article not found</h1>
  <p>The article you’re looking for doesn’t exist or may have moved.</p>
  <p><a href="https://www.inbharat.ai/learn-ai-with-reeturaj">Browse all articles</a> &nbsp;·&nbsp; <a href="https://www.inbharat.ai/">InBharat home</a></p>
</body>
</html>`;

export const config = {
  // Only run for SPA routes. Static assets (favicon, robots, extensions) never match.
  matcher: ["/", "/app", "/learn-ai-with-reeturaj/:slug"],
};

export default async function middleware(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  // Unknown article slug → true 404 (not the soft-200 the catch-all rewrite
  // would serve). Single-segment slug only; the matcher's :slug excludes
  // multi-segment paths, and the hub (no slug) is never matched.
  if (pathname.startsWith(ARTICLE_PREFIX)) {
    const slug = pathname.slice(ARTICLE_PREFIX.length).split("/")[0];
    if (slug && !KNOWN_ARTICLE_SLUGS.has(slug)) {
      return new Response(NOT_FOUND_HTML, {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          // 404s must not be cached by the CDN/edge — a future article may claim this slug.
          "cache-control": "no-store",
        },
      });
    }
  }

  // Known slug, "/", "/app" → pass through. fetch(request) re-enters Vercel
  // routing, which serves the prebuilt static shell before the SPA rewrite.
  return fetch(request);
}