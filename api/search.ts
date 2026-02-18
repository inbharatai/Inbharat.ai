import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, log } from "./_lib/requestId";
import { checkRateLimit } from "./_lib/rateLimit";

const SERPER_URL = "https://google.serper.dev/search";
const TIMEOUT_MS = 15000;
const RETRIES = 2;

const bodySchema = z.object({ q: z.string().min(1).max(500) });

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
    log(requestId, "search: SERPER_API_KEY not configured");
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
      log(requestId, "search: success", { qLength: q.length, organicCount: organic.length });
      return res.status(200).json({ organic, ...data, requestId });
    } catch (err) {
      lastErr = err;
      log(requestId, "search: attempt failed", { attempt: attempt + 1, error: (err as Error).message });
    }
  }

  log(requestId, "search: all retries failed", { error: (lastErr as Error).message });
  return res.status(502).json({
    error: "Search service temporarily unavailable. Please try again.",
    organic: [],
    requestId,
  });
}
