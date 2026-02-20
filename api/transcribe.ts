import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { runWithRetry } from "./lib/openaiRetry";
import { isVerifyErr, verifySupabaseUser } from "./lib/verifySupabaseUser";

const bodySchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(100).optional(),
  language: z.string().max(16).optional(),
});

function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStatusFromError(err: unknown): number | undefined {
  const e = err as { status?: number; cause?: { status?: number } };
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.cause?.status === "number") return e.cause.status;
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR" });
  }

  const verified = await verifySupabaseUser(req);
  if (isVerifyErr(verified)) {
    return res.status(verified.status).json({ ...verified.body, requestId });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, code: "SERVER_ERROR" });

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse(raw);
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR" });
  }

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });
    const bytes = Buffer.from(parsed.audioBase64, "base64");
    const file = new File([bytes], "audio.webm", { type: parsed.mimeType || "audio/webm" });

    const transcription = await runWithRetry(
      { requestId, model: "whisper-1" },
      (signal) =>
        openai.audio.transcriptions.create(
          {
            file,
            model: "whisper-1",
            ...(parsed.language ? { language: parsed.language } : {}),
          },
          { signal }
        )
    );

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, text: transcription.text?.trim() || "", requestId });
  } catch (err: unknown) {
    const status = getStatusFromError(err);
    if (status === 429) return res.status(429).json({ ok: false, code: "RATE_LIMIT", retryAfter: 10 });
    if (status && status >= 500) return res.status(503).json({ ok: false, code: "UPSTREAM_OVERLOADED", retryAfterSeconds: 10 });
    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
}

