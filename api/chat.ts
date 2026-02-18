import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { runWithRetry } from "./lib/openaiRetry";

const bodySchema = z.object({
  // We accept messages from the client; do not log them.
  messages: z.array(z.any()).min(1),
  // Client may send a model preference; server enforces a safe default.
  model: z.string().optional(),
});

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No secrets in responses.
    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse(raw);
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR" });
  }

  const model = "gpt-4o-mini"; // enforced

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

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

