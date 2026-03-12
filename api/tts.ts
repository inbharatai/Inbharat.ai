import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { isVerifyErr, verifySupabaseUserOptional } from "./lib/verifySupabaseUser.js";

const bodySchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.string().optional(),
  model: z.enum(["tts-1", "tts-1-hd"]).optional(),
});

function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR" });
  }

  const verified = await verifySupabaseUserOptional(req);
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

  const voice = parsed.voice || "nova";
  const ttsModel = parsed.model || "tts-1";

  try {
    // Direct OpenAI fetch — streams response body for fastest playback
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ttsModel,
        voice,
        input: parsed.text,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return res.status(429).json({ ok: false, code: "RATE_LIMIT", retryAfter: 10 });
      if (status >= 500) return res.status(503).json({ ok: false, code: "UPSTREAM_OVERLOADED", retryAfterSeconds: 10 });
      return res.status(502).json({ ok: false, code: "SERVER_ERROR" });
    }

    // Stream audio directly to client
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(200).send(buffer);
  } catch {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
}

