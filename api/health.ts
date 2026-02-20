import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runWithRetry } from "./lib/openaiRetry.js";

/**
 * GET /api/health — observability. Never leaks secrets.
 * Returns ok: true/false; optional openaiReachable from a minimal OpenAI call with retries.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, where: "method", message: "Method not allowed" });
  }

  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasSupabaseAdmin = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  const meta: Record<string, unknown> = {
    version: version ? version.slice(0, 7) : "dev",
    VERCEL_GIT_COMMIT_SHA: version,
    env: {
      SERPER: hasSerper,
      OPENAI: hasOpenAI,
      SUPABASE_ADMIN: hasSupabaseAdmin,
    },
  };

  if (hasOpenAI) {
    const requestId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `health-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      await runWithRetry(
        { requestId, model: "openai-list" },
        (signal) => openai.models.list({ signal })
      );
      (meta as Record<string, unknown>).openaiReachable = true;
    } catch {
      (meta as Record<string, unknown>).openaiReachable = false;
    }
  }

  const healthy = hasSupabaseAdmin && (hasSerper || hasOpenAI);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: healthy,
    ...(healthy
      ? {}
      : {
          where: "env",
          status: 503,
          message:
            "Missing required env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and at least one of SERPER_API_KEY or OPENAI_API_KEY)",
        }),
    ...meta,
  });
}
