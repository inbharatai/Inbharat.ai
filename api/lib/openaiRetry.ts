/**
 * Server-side OpenAI retry wrapper. Retries on 408, 429, 500, 502, 503, 504 and network/timeouts.
 * Exponential backoff with jitter; respects Retry-After (cap 10s); 25s timeout per attempt.
 * Logs: requestId, attempt, status, elapsedMs, model. Never logs prompts or keys.
 */

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const ATTEMPT_DELAYS_MS = [200, 500, 1500];
const MAX_ATTEMPTS = 3;
const PER_ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_AFTER_CAP_SEC = 5;

function jitter(ms: number): number {
  return Math.floor(ms * (0.5 + Math.random() * 0.5));
}

function getRetryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const parsed = parseInt(header.trim(), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.min(parsed, RETRY_AFTER_CAP_SEC);
}

function isRetriable(err: unknown): boolean {
  const any = err as { status?: number; code?: string; message?: string };
  if (typeof any?.status === "number" && RETRIABLE_STATUS.has(any.status)) return true;
  if (any?.code === "ETIMEDOUT" || any?.code === "ECONNRESET" || any?.code === "ECONNREFUSED") return true;
  if (typeof any?.message === "string" && /timeout|overloaded|capacity/i.test(any.message)) return true;
  return false;
}

function getStatus(err: unknown): number | undefined {
  const any = err as { status?: number };
  return typeof any?.status === "number" ? any.status : undefined;
}

export type OpenAIRetryOptions = {
  requestId: string;
  model: string;
};

/**
 * Run an async OpenAI operation with retries. Returns the result or throws the last error.
 */
export async function runWithRetry<T>(
  options: OpenAIRetryOptions,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const { requestId, model } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const result = await fn(controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;
      const elapsedMs = Date.now() - start;
      const status = getStatus(err);
      if (typeof console !== "undefined" && console.info) {
        console.info(
          JSON.stringify({
            requestId,
            attempt,
            status: status ?? null,
            elapsedMs,
            model,
          })
        );
      }
      if (attempt === MAX_ATTEMPTS || !isRetriable(err)) throw err;
      const headers = (err as { headers?: Headers | Record<string, string> })?.headers;
      const retryAfterRaw =
        headers instanceof Headers ? headers.get("retry-after") : headers?.["retry-after"] ?? headers?.["Retry-After"];
      const waitSec = getRetryAfterSeconds(typeof retryAfterRaw === "string" ? retryAfterRaw : null);
      const delayMs = waitSec != null ? waitSec * 1000 : jitter(ATTEMPT_DELAYS_MS[attempt - 1] ?? 3250);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
