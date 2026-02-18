/**
 * Vercel Edge Middleware: never protect static assets or return 401 for them.
 * Matcher is empty so this middleware does not run on any request. Static files (favicon,
 * robots.txt, .png, .css, etc.) and /api/* are served normally. To add auth later, use a
 * matcher that only includes routes that require protection (e.g. /app) and never match
 * /api/, favicon, or paths with file extensions.
 */
export const config = {
  // Match only a non-existent path so middleware never runs on real requests.
  // Prevents any 401 on static/assets. To protect routes later, use e.g. matcher: ["/app"].
  matcher: ["/__vercel_static_skip__"],
};

export default function middleware(_request: Request): Response {
  return new Response(null, { status: 200 });
}
