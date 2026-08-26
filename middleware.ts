/**
 * Vercel Edge Middleware — host-based rewrite for the SILT subdomain.
 *
 * vercel.json rewrites run AFTER static-file matching, so the root `/` and
 * root-level static files (sitemap.xml, robots.txt, favicon.svg, manifest.json)
 * on `silt.inbharat.ai` were being served from the InBharat app instead of the
 * SILT files copied to `public/silt/`. This middleware intercepts requests
 * before static matching and rewrites them to `/silt/...` when the host is
 * `silt.inbharat.ai`.
 *
 * The matcher excludes `/api/*`, `/_next/*`, and `/favicon.ico` to leave the
 * main InBharat app untouched on the primary domain.
 */

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};

export default function middleware(request: Request) {
  const host = request.headers.get("host") || "";
  if (host !== "silt.inbharat.ai") {
    return fetch(request);
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Paths that look like static assets (have a filename extension) are
  // rewritten to the matching file under /silt/. All other paths fall back to
  // SILT's SPA shell so client-side routing works.
  const isAsset = path !== "/" && /\/[^/]+\.[^/]+$/.test(path);
  const target = isAsset ? `/silt${path}` : "/silt/index.html";

  const rewriteUrl = new URL(target, request.url);
  return fetch(new Request(rewriteUrl, request));
}
