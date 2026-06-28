/**
 * InBharat Growth Agent — Shared Gemini call helper.
 *
 * One place for every Gemini request the Growth Agent makes (text JSON tasks:
 * draft/review/summary/audit/metadata; image task: cover). Replaces the four
 * copy-pasted callModel/callReviewModel/callDistillModel/callDraftModel
 * functions and removes the OpenAI branches — the Growth Agent is Gemini-only.
 *
 * Robustness the old call sites lacked:
 *   - Surfaces the response BODY on !res.ok (old code threw `gemini HTTP 400`
 *     with no detail, so "does not support image" / quota / safety messages
 *     were invisible). Now: `gemini HTTP 400: {"error":…}`.
 *   - Inspects candidates[0].finishReason + promptFeedback.blockReason and
 *     throws a descriptive error for SAFETY/RECITATION/PROHIBITED_CONTENT/
 *     OTHER/IMAGE_SAFETY — so a blocked/empty/NO_IMAGE response is no longer
 *     misreported as a generic "gemini empty response".
 *   - Parses text by scanning ALL parts for the first .text part (image
 *     responses put inlineData in parts[0]; text may be in a later part).
 *   - Retries 429/500/502/503 + network/abort errors (2×, exp backoff+jitter).
 *
 * Growth Agent's own GEMINI_API_KEY — never the chat backend. Server-only.
 */
import type { ModelChoice } from "./model-router.js";

/** Retry config — 2 retries, ~600ms then ~1800ms, +jitter. */
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 600;

interface TextOpts {
  temperature: number;
  maxOutputTokens: number;
  /** Default "application/json" (all current text tasks want JSON). */
  responseMimeType?: string;
}

interface ImageOpts {
  /** Cap the wait for image gen (it is slower than text). Default 60s. */
  timeoutMs?: number;
  /** Optional style-reference image (inlineData part) so the model keeps all
   *  covers visually consistent with a founder-supplied sample. Gemini 2.5
   *  Flash Image is multimodal and accepts image+text input. */
  referenceImage?: { base64: string; mimeType: string };
}

export interface GeminiImageResult {
  pngBase64: string;
  mimeType: string;
}

/** Sleep helper that respects a passed-in AbortSignal (for cancellation). */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retryable status codes + network failures. */
function isRetryable(status: number | undefined, err: unknown): boolean {
  if (err) return true; // fetch threw (network / abort / DNS) → retry
  return status === 429 || status === 500 || status === 502 || status === 503;
}

/** Build the endpoint URL for a model. */
function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** Throw with the response body attached so the cause is visible in logs/UI. */
async function throwHttpError(res: Response, prefix: string): Promise<never> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "<unreadable body>";
  }
  throw new Error(`${prefix} HTTP ${res.status}: ${body.slice(0, 500)}`);
}

/** finishReason values that mean "no usable output" → descriptive throw. */
const BAD_FINISH = new Set([
  "SAFETY",
  "RECITATION",
  "PROHIBITED_CONTENT",
  "OTHER",
  "IMAGE_SAFETY",
  "SPII",
  "MAX_TOKENS", // truncated; for JSON this usually means a broken parse — surface it
]);

/** Inspect finishReason/blockReason; throw a descriptive error if blocked. */
function assertUsable(data: unknown, prefix: string, expectImage = false): void {
  const d = data as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string }[];
  };
  const block = d?.promptFeedback?.blockReason;
  if (block && block !== "BLOCK_REASON_UNSPECIFIED" && block !== "STOP") {
    throw new Error(`${prefix} blocked by promptFeedback: ${block}`);
  }
  const finish = d?.candidates?.[0]?.finishReason;
  if (expectImage) {
    if (finish === "NO_IMAGE" || finish === "IMAGE_SAFETY") {
      throw new Error(`${prefix}: model returned no image (finishReason=${finish}) — text models cannot generate images; use gemini-2.5-flash-image for the 'cover' task`);
    }
  }
  if (finish && BAD_FINISH.has(finish)) {
    throw new Error(`${prefix}: no usable output (finishReason=${finish})`);
  }
}

/**
 * Call a Gemini text model with a system+user prompt and return the text.
 * Used by draft/review/summary/audit/metadata tasks (all JSON-mode).
 */
export async function callGemini(
  choice: ModelChoice,
  system: string,
  user: string,
  opts: TextOpts,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const responseMimeType = opts.responseMimeType ?? "application/json";
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
    generationConfig: {
      responseMimeType,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${endpoint(choice.model)}?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        // 4xx (except 429) are not retryable, but surface the body either way.
        if (isRetryable(res.status, undefined)) {
          lastErr = new Error(`gemini HTTP ${res.status}`);
          await backoff(attempt);
          continue;
        }
        await throwHttpError(res, "gemini");
      }
      const data = await res.json();
      assertUsable(data, "gemini");
      const text = firstText(data);
      if (typeof text !== "string" || !text.trim()) {
        throw new Error(`gemini empty response (finishReason=${(data as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason ?? "unknown"})`);
      }
      return text;
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      const netRetry = isRetryable(undefined, e) || aborted;
      if (!netRetry || attempt === MAX_RETRIES) throw e;
      await backoff(attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("gemini call failed");
}

/**
 * Call gemini-2.5-flash-image (or any image-capable model) and return the PNG
 * bytes as base64. `responseModalities: ["TEXT","IMAGE"]`; parses the first
 * part carrying `inlineData`. Throws `gemini-image: no image returned` when the
 * model can't produce an image (e.g. a text model was misconfigured for cover).
 */
export async function callGeminiImage(
  choice: ModelChoice,
  prompt: string,
  opts: ImageOpts = {},
): Promise<GeminiImageResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const timeoutMs = opts.timeoutMs ?? 60000;
  const parts: unknown[] = [{ text: prompt }];
  if (opts.referenceImage) {
    parts.push({ inlineData: { mimeType: opts.referenceImage.mimeType, data: opts.referenceImage.base64 } });
  }
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      // Consistency with the thinking-model rule (callGemini/Agent/Vision all
      // set this): if the cover model is ever swapped to a thinking-capable image
      // model via GROWTH_COVER_MODEL, thinking tokens would otherwise starve the
      // image output budget. No-op on the current gemini-2.5-flash-image.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${endpoint(choice.model)}?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        if (isRetryable(res.status, undefined)) {
          lastErr = new Error(`gemini-image HTTP ${res.status}`);
          await backoff(attempt);
          continue;
        }
        await throwHttpError(res, "gemini-image");
      }
      const data = await res.json();
      assertUsable(data, "gemini-image", true);
      const inline = firstInlineData(data);
      if (!inline) {
        throw new Error(`gemini-image: no image returned (finishReason=${(data as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason ?? "unknown"}) — ensure GROWTH_COVER_MODEL is an image-capable model (gemini-2.5-flash-image)`);
      }
      return { pngBase64: inline.data, mimeType: inline.mimeType || "image/png" };
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      const netRetry = isRetryable(undefined, e) || aborted;
      if (!netRetry || attempt === MAX_RETRIES) throw e;
      await backoff(attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("gemini-image call failed");
}

/** First `.text` part across all candidate parts (image responses may order parts differently). */
function firstText(data: unknown): string | undefined {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  for (const p of parts) {
    if (typeof p?.text === "string" && p.text.length > 0) return p.text;
  }
  return undefined;
}

// ─── Phase C: function-calling (agent) + multimodal (vision) ─────────────────

/** One function declaration the agent can call. `parameters` is a JSON-Schema
 *  object (Gemini accepts OpenAPI-style schemas). Optional when a tool takes
 *  no args. Keep descriptions precise — they steer the model's tool choice. */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiAgentResult {
  /** Concatenated text parts the model emitted (null when it only called tools). */
  text: string | null;
  /** Function calls the model requested, in order. Empty when it answered in text. */
  toolCalls: GeminiToolCall[];
  finishReason: string | null;
}

/**
 * Call a Gemini text model in function-calling mode (Phase C agent). `contents`
 * is the full multi-turn history (user/model turns with text, functionCall, or
 * functionResponse parts) — the caller appends each tool result as a `model`-then-
 * `user` functionResponse turn. `system` is passed as systemInstruction (NOT a
 * contents part), so it doesn't pollute the history. Returns the candidate's text
 * + any function calls so the caller can dispatch tools and loop. Retries like
 * callGemini. Never parses JSON — the agent turn loop owns persistence.
 */
export async function callGeminiAgent(
  choice: ModelChoice,
  system: string,
  contents: unknown[],
  tools: GeminiFunctionDeclaration[],
  opts: { temperature: number; maxOutputTokens: number },
): Promise<GeminiAgentResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [{ functionDeclarations: tools }],
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${endpoint(choice.model)}?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        if (isRetryable(res.status, undefined)) {
          lastErr = new Error(`gemini-agent HTTP ${res.status}`);
          await backoff(attempt);
          continue;
        }
        await throwHttpError(res, "gemini-agent");
      }
      const data = await res.json();
      // Function-calling responses can finish with STOP (text) or carry
      // functionCall parts; both are usable. Only throw on hard blocks.
      assertUsable(data, "gemini-agent");
      const parts = (data as { candidates?: { finishReason?: string; content?: { parts?: unknown[] } }[] })?.candidates?.[0]?.content?.parts;
      const finishReason = (data as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason ?? null;
      const textParts: string[] = [];
      const toolCalls: GeminiToolCall[] = [];
      if (Array.isArray(parts)) {
        for (const p of parts as Array<Record<string, unknown>>) {
          if (typeof p?.text === "string" && p.text.length > 0) textParts.push(p.text);
          const fc = p?.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
          if (fc && typeof fc.name === "string") {
            toolCalls.push({ name: fc.name, args: fc.args ?? {} });
          }
        }
      }
      const text = textParts.length > 0 ? textParts.join("\n") : null;
      if (text === null && toolCalls.length === 0) {
        // MALFORMED_FUNCTION_CALL means the model tried a tool call but the args
        // were truncated/invalid JSON (most often because maxOutputTokens was too
        // low for a tool whose args carry long pasted text). Don't throw — surface
        // the finishReason so the agent loop can feed back a recovery turn and
        // retry with a higher output cap. Other empty-response causes still throw.
        if (finishReason === "MALFORMED_FUNCTION_CALL") {
          return { text: null, toolCalls: [], finishReason };
        }
        throw new Error(`gemini-agent empty response (finishReason=${finishReason ?? "unknown"})`);
      }
      return { text, toolCalls, finishReason };
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      const netRetry = isRetryable(undefined, e) || aborted;
      if (!netRetry || attempt === MAX_RETRIES) throw e;
      await backoff(attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("gemini-agent call failed");
}

/**
 * Call gemini-2.5-flash (multimodal) with an inline image + an instruction
 * (Phase C4 vision). `imageBase64` is raw base64 (no data: prefix); `mimeType`
 * must be a type Gemini accepts (image/png, image/jpeg, image/webp, image/gif).
 * Returns the model's text answer. Used ONLY by the Growth Agent's
 * analyzeAttachment tool — the image bytes never touch the chat backend.
 */
export async function callGeminiVision(
  choice: ModelChoice,
  instruction: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: instruction },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 800,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${endpoint(choice.model)}?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        if (isRetryable(res.status, undefined)) {
          lastErr = new Error(`gemini-vision HTTP ${res.status}`);
          await backoff(attempt);
          continue;
        }
        await throwHttpError(res, "gemini-vision");
      }
      const data = await res.json();
      assertUsable(data, "gemini-vision");
      const text = firstText(data);
      if (typeof text !== "string" || !text.trim()) {
        throw new Error(`gemini-vision empty response (finishReason=${(data as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason ?? "unknown"})`);
      }
      return text;
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      const netRetry = isRetryable(undefined, e) || aborted;
      if (!netRetry || attempt === MAX_RETRIES) throw e;
      await backoff(attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("gemini-vision call failed");
}

/** First part carrying `inlineData` (the generated image). */
function firstInlineData(data: unknown): { data: string; mimeType?: string } | undefined {
  const parts = (data as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  for (const p of parts) {
    if (p?.inlineData?.data) return { data: p.inlineData.data, mimeType: p.inlineData.mimeType };
  }
  return undefined;
}

/** Exponential backoff with jitter: ~base*2^attempt + 0-200ms. */
async function backoff(attempt: number): Promise<void> {
  const wait = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 200);
  await sleep(wait);
}