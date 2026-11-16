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
 *   - Use an internal fetch to the underlying SILT file.
 *   - Target extension-less, non-"index" files (`/silt/__root` and
 *     `/silt/studio/__root`) so Vercel's `cleanUrls` / trailing-slash logic
 *     does not redirect them away.
 *   - Return the body as text with an explicit Content-Type for the HTML shells.
 *     Binary assets are returned as ArrayBuffer with Content-Type derived from
 *     the original request path.
 *   - The exact internal-file guard prevents an infinite loop when the internal fetch
 *     re-enters the edge.
 */

import { next } from "@vercel/edge";
import { resolveSiltRenderingRoute, siltNotFoundResponse } from "./lib/silt-rendering-routes";

export const config = {
  // Include the trailing-slash alias so it redirects consistently to /studio.
  // The host check leaves main-site /app, admin and asset behavior untouched.
  matcher: ["/(.*)"],
};

const HTML_TYPE = "text/html; charset=utf-8";

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "js":
      return "application/javascript; charset=utf-8";
    case "md":
      return "text/markdown; charset=utf-8";
    case "xml":
      return "application/xml; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    default:
      return HTML_TYPE;
  }
}

export default async function middleware(request: Request) {
  const host = request.headers.get("host") || "";
  if (host !== "silt.inbharat.ai") {
    return next();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  const route = resolveSiltRenderingRoute(path);
  if (route.kind === "missing") return siltNotFoundResponse();
  if (route.kind === "redirect") {
    const canonical = new URL(route.path, request.url);
    canonical.search = url.search;
    return Response.redirect(canonical, 308);
  }
  if (route.kind === "internal") {
    // Direct storage-file URLs are not public canonical pages. These headers
    // are not forwarded to the root research page's fresh response below.
    return next({ headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  const targetPath = route.path;

  const targetUrl = new URL(targetPath, request.url);
  const response = await fetch(new Request(targetUrl, request));

  if (response.status === 404) return siltNotFoundResponse();

  // Vercel strips Content-Type from middleware responses when the underlying
  // static file has none. For the HTML shells, decode the body as text and
  // return a fresh text Response. Assets stay binary.
  if (route.html) {
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": HTML_TYPE, ...(route.noIndex ? { "X-Robots-Tag": "noindex, nofollow" } : {}) },
    });
  }

  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": contentTypeForPath(path) },
  });
}
