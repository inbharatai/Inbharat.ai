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
 *   - The `/silt/*` guard prevents an infinite loop when the internal fetch
 *     re-enters the edge.
 */

import { next } from "@vercel/edge";

export const config = {
  matcher: ["/:path*"],
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
  const targetPath = isAsset
    ? `/silt${path}`
    : isStudio
      ? "/silt/studio/__root"
      : "/silt/__root";

  const targetUrl = new URL(targetPath, request.url);
  const response = await fetch(new Request(targetUrl, request));

  // Vercel strips Content-Type from middleware responses when the underlying
  // static file has none. For the HTML shells, decode the body as text and
  // return a fresh text Response. Assets stay binary.
  if (isStudio || !isAsset) {
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": HTML_TYPE },
    });
  }

  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": contentTypeForPath(path) },
  });
}
