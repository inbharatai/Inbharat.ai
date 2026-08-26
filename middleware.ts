/**
 * Vercel Edge Middleware — host-based rewrite for the SILT subdomain.
 *
 * vercel.json rewrites run AFTER static-file matching, so the root `/` and
 * root-level static files (sitemap.xml, robots.txt, favicon.svg, manifest.json)
 * on `silt.inbharat.ai` were being served from the InBharat app instead of the
 * SILT files copied to `public/silt/`. This middleware intercepts requests
 * before static matching and serves SILT content directly.
 *
 * We use `@vercel/edge` `rewrite()` (not an internal fetch) and target
 * extension-less SILT entry files (`/silt/index` and `/silt/studio/index`) so
 * Vercel's `cleanUrls` / trailing-slash logic does not redirect them away.
 */

import { next, rewrite } from "@vercel/edge";

export const config = {
  matcher: ["/:path*"],
};

export default function middleware(request: Request) {
  const host = request.headers.get("host") || "";
  if (host !== "silt.inbharat.ai") {
    return next();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // If the request is already targeting /silt/*, let Vercel serve it directly.
  if (path.startsWith("/silt/")) {
    return next();
  }

  // SPA route: /studio (with or without trailing slash).
  if (path === "/studio" || path === "/studio/") {
    return rewrite(new URL("/silt/studio/index", request.url));
  }

  // Determine the SILT file to serve: explicit assets get their file, all
  // other paths fall back to SILT's shell. Assets include /web/studio-bridge.js,
  // /favicon.svg, /README.md, /PATENT.md, /sitemap.xml, /robots.txt, etc.
  const isAsset = path !== "/" && /\/[^/]+\.[^/]+$/.test(path);
  const targetPath = isAsset ? `/silt${path}` : "/silt/index";
  return rewrite(new URL(targetPath, request.url));
}
