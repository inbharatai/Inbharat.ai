/**
 * Vercel Edge Middleware — host-based rewrite for the SILT subdomain.
 *
 * vercel.json rewrites run AFTER static-file matching, so the root `/` and
 * root-level static files (sitemap.xml, robots.txt, favicon.svg, manifest.json)
 * on `silt.inbharat.ai` were being served from the InBharat app instead of the
 * SILT files copied to `public/silt/`. This middleware intercepts requests
 * before static matching and serves SILT content directly.
 */

import { next } from "@vercel/edge";

export const config = {
  matcher: ["/:path*"],
};

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

  // Determine the SILT file to serve: explicit assets get their file, all other
  // paths fall back to SILT's SPA shell.
  const isAsset = path !== "/" && /\/[^/]+\.[^/]+$/.test(path);
  const targetPath = isAsset ? `/silt${path}` : "/silt/index.html";

  // Fetch the SILT content internally. The rewritten URL keeps the same host so
  // the request re-enters the edge; the /silt/* guard above prevents a loop and
  // lets Vercel serve the static file.
  const targetUrl = new URL(targetPath, request.url);
  const response = await fetch(new Request(targetUrl, request));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
