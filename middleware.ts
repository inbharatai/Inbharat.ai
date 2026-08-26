/**
 * Vercel Edge Middleware — host-based rewrite for the SILT subdomain.
 *
 * vercel.json rewrites run AFTER static-file matching, so the root `/` and
 * root-level static files (sitemap.xml, robots.txt, favicon.svg, manifest.json)
 * on `silt.inbharat.ai` were being served from the InBharat app instead of the
 * SILT files copied to `public/silt/`. This middleware intercepts requests
 * before static matching and rewrites them to `/silt/...` when the host is
 * `silt.inbharat.ai`.
 */

import { rewrite, next } from "@vercel/edge";

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};

export default function middleware(request: Request) {
  const host = request.headers.get("host") || "";
  if (host !== "silt.inbharat.ai") {
    return next();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // If the request is already rewritten to /silt/*, let Vercel serve it directly
  // to avoid an infinite rewrite loop.
  if (path.startsWith("/silt/")) {
    return next();
  }

  // Paths that look like static assets (have a filename extension) are
  // rewritten to the matching file under /silt/. All other paths fall back to
  // SILT's SPA shell so client-side routing works.
  const isAsset = path !== "/" && /\/[^/]+\.[^/]+$/.test(path);
  const target = isAsset ? `/silt${path}` : "/silt/index.html";

  return rewrite(target);
}
