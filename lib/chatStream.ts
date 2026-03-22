/**
 * Client-side chat streaming — calls /api/chat with SSE streaming.
 *
 * Provides Perplexity-style UX: sources first, then streaming text, then follow-ups.
 */

import { AgentMode, Source } from "../types";
import { supabase } from "./supabaseClient";

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface StreamCallbacks {
  /** Sources arrived (shown before text starts). */
  onSources?: (sources: Source[]) => void;
  /** Status message (e.g. "Searching...", "Writing response..."). */
  onStatus?: (status: string) => void;
  /** Routing info arrived (intent, mode). */
  onRouting?: (routing: { intent: string; mode: string }) => void;
  /** A text chunk arrived (streaming). */
  onChunk?: (chunk: string) => void;
  /** Follow-up questions arrived (after text). */
  onFollowUps?: (followUps: string[]) => void;
  /** Stream completed. */
  onDone?: (fullText: string) => void;
  /** Error occurred. */
  onError?: (error: string) => void;
}

/**
 * Call /api/chat with SSE streaming.
 * Returns an AbortController to cancel the stream.
 */
export function streamChat(
  query: string,
  mode: AgentMode,
  language: string,
  callbacks: StreamCallbacks,
  options?: {
    imageData?: string;
    sessionId?: string;
    previousMessages?: Array<{ role: "user" | "assistant"; content: string }>;
    signal?: AbortSignal;
  },
): AbortController {
  const controller = new AbortController();
  const { signal } = controller;

  if (options?.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  (async () => {
    try {
      console.error("[chatStream] 1. Getting access token...");
      const token = await getAccessToken();
      console.error("[chatStream] 2. Token:", token ? "present" : "none", "- Starting fetch...");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query,
          mode,
          language,
          stream: true,
          imageData: options?.imageData,
          sessionId: options?.sessionId,
          previousMessages: options?.previousMessages,
        }),
        signal,
      });

      console.error("[chatStream] 3. Response:", res.status, res.ok, "Content-Type:", res.headers.get("content-type"));

      if (!res.ok) {
        let code = "SERVER_ERROR";
        try {
          const errBody = await res.json();
          if (errBody?.code) code = errBody.code;
        } catch { /* ignore parse failures */ }
        console.error("[chatStream] 4. NOT OK — error code:", code);
        callbacks.onError?.(code);
        return;
      }

      if (!res.body) {
        console.error("[chatStream] 4. No response body!");
        callbacks.onError?.("SERVER_ERROR");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let doneReceived = false;
      let eventCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            eventCount++;
            console.error(`[chatStream] 5. Event #${eventCount}:`, data.event, data.event === "chunk" ? `(${data.chunk?.length ?? 0} chars)` : "");
            switch (data.event) {
              case "routing":
                callbacks.onRouting?.(data.routing);
                break;
              case "sources":
                callbacks.onSources?.(data.sources);
                break;
              case "status":
                callbacks.onStatus?.(data.status);
                break;
              case "chunk":
                fullText += data.chunk;
                callbacks.onChunk?.(data.chunk);
                break;
              case "followUps":
                callbacks.onFollowUps?.(data.followUps);
                break;
              case "done":
                doneReceived = true;
                console.error("[chatStream] 6. DONE received, fullText length:", (data.text ?? fullText).length);
                callbacks.onDone?.(data.text ?? fullText);
                break;
              case "error":
                console.error("[chatStream] 6. ERROR event:", data.code);
                callbacks.onError?.(data.code ?? "SERVER_ERROR");
                break;
            }
          } catch {
            // ignore parse errors in SSE
          }
        }
      }

      console.error("[chatStream] 7. Stream ended. doneReceived:", doneReceived, "fullText length:", fullText.length, "eventCount:", eventCount);

      // Safety fallback: if stream ended without a "done" event
      if (!doneReceived && !signal.aborted) {
        if (fullText) {
          callbacks.onDone?.(fullText);
        } else {
          callbacks.onError?.("UPSTREAM_OVERLOADED");
        }
      }
    } catch (err: unknown) {
      console.error("[chatStream] CATCH error:", (err as Error)?.name, (err as Error)?.message);
      if ((err as { name?: string })?.name === "AbortError") return;
      const msg = (err as Error)?.message ?? "";
      callbacks.onError?.(msg || "CONNECTION_FAILED");
    }
  })();

  return controller;
}
