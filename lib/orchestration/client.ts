/**
 * Client-side orchestration — calls /api/orchestrate with SSE streaming.
 *
 * This replaces direct NexusAgent.executeQuery() calls for the main chat flow.
 * Provides Perplexity-style UX: sources first, then streaming text, then follow-ups.
 */

import { AgentMode, Source } from "../../types";
import type { QueryResult } from "../../services/openaiService";
import { supabase } from "../supabaseClient";

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
 * Call /api/orchestrate with SSE streaming.
 * Returns a function to abort the stream.
 */
export function orchestrateStream(
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

  // Merge external signal
  if (options?.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  (async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/orchestrate", {
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

      if (!res.ok) {
        callbacks.onError?.("Request failed");
        return;
      }

      if (!res.body) {
        callbacks.onError?.("No response body");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
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
                callbacks.onDone?.(data.text ?? fullText);
                break;
              case "error":
                callbacks.onError?.(data.code ?? "SERVER_ERROR");
                break;
            }
          } catch {
            // ignore parse errors in SSE
          }
        }
      }

      // Safety fallback: if stream ended without a "done" event (server crash/timeout),
      // still finalize so the UI doesn't get stuck with isStreaming: true
      if (!doneReceived && !signal.aborted && fullText) {
        callbacks.onDone?.(fullText);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") return;
      callbacks.onError?.("Connection failed");
    }
  })();

  return controller;
}

/**
 * Non-streaming orchestrate call.
 * Falls back to NexusAgent-style response format (QueryResult).
 */
export async function orchestrateQuery(
  query: string,
  mode: AgentMode,
  language: string,
  imageData?: string,
  signal?: AbortSignal,
  previousMessages?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<QueryResult> {
  const token = await getAccessToken();
  const res = await fetch("/api/orchestrate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query, mode, language, imageData, previousMessages, stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Orchestrate failed: ${res.status}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.code ?? "SERVER_ERROR");
  }

  return {
    text: json.text,
    sources: json.sources ?? [],
    followUps: json.followUps ?? [],
    imageUrl: undefined,
    videoUrl: undefined,
    widget: json.widget,
  };
}
