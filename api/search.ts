import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

const SERPER_URL = "https://google.serper.dev/search";
const TIMEOUT_MS = 15000;
const RETRIES = 2;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

const bodySchema = z.object({ q: z.string().min(1).max(500) });

function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).split(",")[0].trim();
  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string") return realIp;
  return "unknown";
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

function checkRateLimit(req: VercelRequest): RateLimitResult {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
    return { ok: true };
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", organic: [], requestId });
  }

  const limit = checkRateLimit(req);
  if (limit.ok === false) {
    const retryAfter = limit.retryAfter;
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      ok: false,
      retryAfter,
      error: "Too many requests. Please try again later.",
      organic: [],
      requestId,
    });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.log(JSON.stringify({ requestId, message: "search: SERPER_API_KEY not configured" }));
    return res.status(503).json({
      error: "Search service not configured",
      organic: [],
      requestId,
    });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse({ q: typeof raw?.q === "string" ? raw.q.trim() : "" });
  } catch {
    return res.status(400).json({
      error: "Invalid request: body must be JSON with a non-empty string 'q'",
      organic: [],
      requestId,
    });
  }

  const { q } = parsed;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(SERPER_URL, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 8 }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = (await response.json()) as { organic?: unknown[]; [k: string]: unknown };
      const organic = Array.isArray(data.organic) ? data.organic : [];
      return res.status(200).json({ organic, ...data, requestId });
    } catch (err) {
      lastErr = err;
    }
  }

  return res.status(502).json({
    error: "Search service temporarily unavailable. Please try again.",
    organic: [],
    requestId,
  });
}
