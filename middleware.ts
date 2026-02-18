/**
 * Vercel Edge Middleware: static assets must never be gated by auth.
 * Matcher runs ONLY for SPA routes (/ and /app). All static assets are excluded,
 * so middleware never runs for:
 *   - /favicon.ico, /favicon.png, /robots.txt, /sitemap.xml, /manifest.webmanifest
 *   - /assets/*
 *   - any path ending in .png .jpg .jpeg .gif .svg .webp .ico .css .js .map .txt .xml .json .woff .woff2 .ttf
 * Behavior is identical on Production and Preview.
 */
export const config = {
  // Only run for exact SPA routes. Static assets (favicon, robots, extensions) never match.
  matcher: ["/", "/app"],
};

export default function middleware(request: Request): Promise<Response> {
  // Pass through to origin; no auth. Static paths never reach here (matcher excludes them).
  return fetch(request);
}
