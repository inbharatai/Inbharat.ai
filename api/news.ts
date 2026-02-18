import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, log } from "./_lib/requestId";
import { checkRateLimit } from "./_lib/rateLimit";

const SERPER_NEWS_URL = "https://google.serper.dev/news";
const TIMEOUT_MS = 15000;

const querySchema = z.object({ q: z.string().max(200).optional().default("trending news India") });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", articles: [], requestId });
  }

  const limit = checkRateLimit(req);
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({
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
    log(requestId, "news: success", { articlesCount: articles.length });
    return res.status(200).json({ articles, requestId });
  } catch (err) {
    log(requestId, "news: error", { error: (err as Error).message });
    return res.status(200).json({
      articles: [],
      message: "News temporarily unavailable",
      requestId,
    });
  }
}
