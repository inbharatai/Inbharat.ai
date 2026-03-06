import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { runWithRetry } from "./lib/openaiRetry.js";
import { isVerifyErr, verifySupabaseUserOptional } from "./lib/verifySupabaseUser.js";

const bodySchema = z.object({
  // We accept messages from the client; do not log them.
  messages: z.array(z.any()).min(1),
  // Client may send a model preference; server enforces a safe default.
  model: z.string().optional(),
  // Mode-based model selection: heavy reasoning → gpt-4.1-mini; lightweight → gpt-4.1-nano
  mode: z.string().optional(),
  // Whether to stream the response (Server-Sent Events)
  stream: z.boolean().optional(),
});

/**
 * Heavy reasoning modes → gpt-4.1-mini (best quality).
 * Lightweight / JSON-extraction modes → gpt-4.1-nano (fastest, cheapest).
 */
function getModelForMode(mode?: string): string {
  const heavyModes = ['RESEARCH', 'CODER', 'EDUCATOR', 'BROWSER'];
  if (heavyModes.includes(mode || '')) return 'gpt-4.1-mini';
  return 'gpt-4.1-nano';
}

function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getRetryAfterSecondsFromError(err: unknown): number | undefined {
  const headers = (err as { headers?: Headers | Record<string, string> })?.headers;
  const raw =
    headers instanceof Headers ? headers.get("retry-after") : headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (typeof raw !== "string") return undefined;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : Math.min(parsed, 10);
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

  const verified = await verifySupabaseUserOptional(req);
  if (isVerifyErr(verified)) {
    return res.status(verified.status).json({ ...verified.body, requestId });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, code: "CONFIG_ERROR" });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse(raw);
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR" });
  }

  const model = getModelForMode(parsed.mode);
  const shouldStream = parsed.stream === true;

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    if (shouldStream) {
      // Streaming response via Server-Sent Events
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      try {
        const stream = await openai.chat.completions.create({
          model,
          messages: parsed.messages as any,
          stream: true,
        } as any);

        // Send initial token
        res.write(`data: ${JSON.stringify({ ok: true, model, requestId })}\n\n`);

        for await (const event of stream as any) {
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
          }
        }

        // Send completion marker
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamErr: unknown) {
        const status = getStatusFromError(streamErr);
        const retryAfter = getRetryAfterSecondsFromError(streamErr) ?? 10;

        if (status === 429) {
          res.write(`data: ${JSON.stringify({ ok: false, code: "RATE_LIMIT", retryAfter })}\n\n`);
        } else if (status === 408 || status === 500 || status === 502 || status === 503 || status === 504) {
          res.write(`data: ${JSON.stringify({ ok: false, code: "UPSTREAM_OVERLOADED", retryAfterSeconds: retryAfter })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ ok: false, code: "SERVER_ERROR" })}\n\n`);
        }
        res.end();
      }
    } else {
      // Non-streaming response (standard JSON)
      const completion = await runWithRetry(
        { requestId, model },
        (signal) =>
          openai.chat.completions.create(
            {
              model,
              messages: parsed.messages as any,
              response_format: { type: "text" },
            },
            { signal }
          )
      );

      const text = completion.choices?.[0]?.message?.content ?? "";
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, text, model, requestId });
    }
  } catch (err: unknown) {
    const status = getStatusFromError(err);
    const retryAfter = getRetryAfterSecondsFromError(err) ?? 10;

    // Never return upstream error text.
    if (status === 429) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ ok: false, code: "RATE_LIMIT", retryAfter });
    }

    if (status === 408 || status === 500 || status === 502 || status === 503 || status === 504) {
      return res.status(503).json({ ok: false, code: "UPSTREAM_OVERLOADED", retryAfterSeconds: retryAfter });
    }

    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
}

