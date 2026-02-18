/**
 * Simple in-memory IP rate limit (per serverless instance). Resets on cold start.
 * Max 60 requests per IP per minute for API routes.
 */
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;

const store = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).split(",")[0].trim();
  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string") return realIp;
  return "unknown";
}

export function checkRateLimit(req: { headers?: Record<string, string | string[] | undefined> }): { ok: true } | { ok: false; retryAfter: number } {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = store.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
    return { ok: true };
  }
  entry.count++;
  if (entry.count > MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}
