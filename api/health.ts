import type { VercelRequest, VercelResponse } from "@vercel/node";

const HEALTH_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

/**
 * GET /api/health — observability. Never leaks secrets.
 * Checks: required envs exist, OpenAI reachable (minimal models list call with gpt-4o-mini).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, where: "method", message: "Method not allowed" });
  }

  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  const meta: Record<string, unknown> = {
    version: HEALTH_VERSION,
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

  const ok = hasSerper || hasOpenAI;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok,
    ...(ok ? {} : { where: "env", status: 503, message: "Missing required env (SERPER_API_KEY or OPENAI_API_KEY)" }),
    ...meta,
  });
}
