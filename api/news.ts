import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

const SERPER_NEWS_URL = "https://google.serper.dev/news";
const TIMEOUT_MS = 15000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

const querySchema = z.object({ q: z.string().max(200).optional().default("trending news India") });

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

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", articles: [], requestId });
  }

  const limit = checkRateLimit(req);
  if (limit.ok === false) {
    const retryAfter = limit.retryAfter;
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      ok: false,
      retryAfter,
      error: "Too many requests. Please try again later.",
      articles: [],
      requestId,
    });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return res.status(200).json({
      articles: [],
      message: "SERPER_API_KEY not configured",
      requestId,
    });
  }

  const parsed = querySchema.safeParse({
    q: typeof req.query?.q === "string" ? req.query.q.trim() : undefined,
  });
  const q = parsed.success ? parsed.data.q : "trending news India";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(SERPER_NEWS_URL, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 6 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = (await response.json()) as { news?: Array<{ title?: string; snippet?: string; description?: string; link?: string; source?: string }> };
    const news = Array.isArray(data.news) ? data.news : [];
    const articles = news.slice(0, 6).map((n) => ({
      title: n.title ?? "",
      summary: n.snippet ?? n.description ?? "",
      url: n.link ?? "#",
      category: n.source ?? "General",
    }));
    return res.status(200).json({ articles, requestId });
  } catch {
    return res.status(200).json({
      articles: [],
      message: "News temporarily unavailable",
      requestId,
    });
  }
}
