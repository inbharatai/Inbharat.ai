/**
 * Server-side LLM call — used by /api/orchestrate and server-side agents.
 * Wraps OpenAI with retry logic, matching /api/chat behaviour.
 *
 * Features:
 *  - Module-level singleton (no re-init per call)
 *  - Per-mode temperature & max_tokens tuning
 *  - Streaming retry (up to 2 attempts)
 */

import { runWithRetry } from "./openaiRetry.js";

// ── Singleton OpenAI client ──
let _openai: any = null;
async function getOpenAI() {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const OpenAI = (await import("openai")).default;
  _openai = new OpenAI({ apiKey });
  return _openai;
}

/** All modes use gpt-4.1-mini. */
function getModelForMode(_mode?: string): string {
  return "gpt-4.1-mini";
}

/** Mode-specific temperature + max_tokens for optimal output quality. */
function getModeParams(mode?: string): { temperature: number; max_tokens: number } {
  switch (mode) {
    case "CODER":     return { temperature: 0.15, max_tokens: 4096 };
    case "RESEARCH":  return { temperature: 0.5,  max_tokens: 4096 };
    case "EDUCATOR":  return { temperature: 0.6,  max_tokens: 3500 };
    case "BROWSER":   return { temperature: 0.3,  max_tokens: 3000 };
    case "SHOPPER":   return { temperature: 0.4,  max_tokens: 3000 };
    case "EXECUTIVE": return { temperature: 0.3,  max_tokens: 3000 };
    default:          return { temperature: 0.5,  max_tokens: 3500 };
  }
}

export interface LLMCallOptions {
  messages: Array<{ role: string; content: unknown }>;
  mode?: string;
  requestId?: string;
}

export async function serverLLMCall(options: LLMCallOptions): Promise<string> {
  const openai = await getOpenAI();
  const model = getModelForMode(options.mode);
  const { temperature, max_tokens } = getModeParams(options.mode);

  const completion: any = await runWithRetry(
    { requestId: options.requestId ?? "orchestrate", model },
    (signal) =>
      openai.chat.completions.create(
        { model, messages: options.messages as any, temperature, max_tokens },
        { signal },
      ),
  );

  return completion.choices?.[0]?.message?.content ?? "";
}

const STREAM_MAX_RETRIES = 2;

/**
 * Server-side streaming LLM call — yields chunks via SSE.
 * Retries up to STREAM_MAX_RETRIES on failure before the first chunk.
 */
export async function* serverLLMStream(options: LLMCallOptions): AsyncIterable<string> {
  const openai = await getOpenAI();
  const model = getModelForMode(options.mode);
  const { temperature, max_tokens } = getModeParams(options.mode);

  let lastError: unknown;
  let chunksYielded = false;
  for (let attempt = 0; attempt < STREAM_MAX_RETRIES; attempt++) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: options.messages as any,
        temperature,
        max_tokens,
        stream: true,
      });

      for await (const event of stream as any) {
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          chunksYielded = true;
          yield delta;
        }
      }
      return; // success — exit retry loop
    } catch (err: unknown) {
      lastError = err;
      // Only retry if no chunks were yielded yet — retrying after partial
      // yield would duplicate already-streamed text in the SSE output.
      if (chunksYielded) throw err;
      if (attempt < STREAM_MAX_RETRIES - 1) {
        const delay = 500 * (attempt + 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastError;
}
