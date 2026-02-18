import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/health — observability. Never leaks secrets.
 * Returns ok: true, VERCEL_GIT_COMMIT_SHA, and confirms OPENAI_API_KEY exists (boolean only).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, where: "method", message: "Method not allowed" });
  }

  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  const meta: Record<string, unknown> = {
    version: version ? version.slice(0, 7) : "dev",
    VERCEL_GIT_COMMIT_SHA: version,
    env: {
      SERPER: hasSerper,
      OPENAI: hasOpenAI,
    },
  };

  // Optional: verify OpenAI is reachable (server-side key only; do not use client key)
  if (hasOpenAI) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      await Promise.race([
        openai.models.list(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      (meta as Record<string, unknown>).openaiReachable = true;
    } catch (err) {
      (meta as Record<string, unknown>).openaiReachable = false;
      (meta as Record<string, unknown>).openaiError = String((err as Error).message ?? err).replace(/sk-[^\s]+/gi, "[REDACTED]");
    }
  }

  const healthy = hasSerper || hasOpenAI;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: healthy,
    ...(healthy ? {} : { where: "env", status: 503, message: "Missing required env (SERPER_API_KEY or OPENAI_API_KEY)" }),
    ...meta,
  });
}
