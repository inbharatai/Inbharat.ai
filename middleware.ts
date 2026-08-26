/**
 * Vercel Edge Middleware — host-based rewrite for the SILT subdomain.
 *
 * vercel.json rewrites run AFTER static-file matching, so the root `/` and
 * root-level static files (sitemap.xml, robots.txt, favicon.svg, manifest.json)
 * on `silt.inbharat.ai` were being served from the InBharat app instead of the
 * SILT files copied to `public/silt/`. This middleware intercepts requests
 * before static matching and serves SILT content directly.
 *
 * Strategy:
 *   - Use an internal fetch to the underlying SILT file so we fully control
 *     the response that the visitor receives (important for Content-Type).
 *   - Target extension-less, non-"index" files (`/silt/__root` and
 *     `/silt/studio/__root`) so Vercel's `cleanUrls` / trailing-slash logic
 *     does not redirect them away.
 *   - The `/silt/*` guard prevents an infinite loop when the internal fetch
 *     re-enters the edge.
 */

import { next } from "@vercel/edge";

export const config = {
  matcher: ["/:path*"],
};

const HTML_TYPE = "text/html; charset=utf-8";

export default async function middleware(request: Request) {
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
  const isStudio = path === "/studio" || path === "/studio/";

  // Determine the SILT file to serve: explicit assets get their file, all
  // other paths fall back to SILT's shell. Assets include /web/studio-bridge.js,
  // /favicon.svg, /README.md, /PATENT.md, /sitemap.xml, /robots.txt, etc.
  const isAsset = !isStudio && path !== "/" && /\/[^/]+\.[^/]+$/.test(path);
  const targetPath = isAsset ? `/silt${path}` : isStudio ? "/silt/studio/__root" : "/silt/__root";
  const targetUrl = new URL(targetPath, request.url);

  const response = await fetch(new Request(targetUrl, request));

  // Extension-less static targets are served as application/octet-stream by
  // Vercel, so force the correct Content-Type for the HTML shells.
  const headers = new Headers(response.headers);
  if (!isAsset) {
    headers.set("Content-Type", HTML_TYPE);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
