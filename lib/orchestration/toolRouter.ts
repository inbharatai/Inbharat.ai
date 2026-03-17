/**
 * ToolRouter — unified server-side tool dispatch.
 *
 * Single dispatch point for ALL tool calls:
 *  - web_search → Serper via serverSearch
 *  - llm_call → OpenAI via serverLLM (non-streaming)
 *  - llm_stream → (use streamLLMTool directly; not routed through dispatch)
 *  - app_connector → UniAssist / TestPrep connectors
 *  - tts → OpenAI TTS metadata (audio fetched client-side)
 *
 * All calls are tracked in an in-memory audit ring buffer for cost/perf analysis.
 */

import { serverSearch, type ServerSearchOutput } from "../../api/lib/serverSearch.js";
import { serverLLMCall, serverLLMStream } from "../../api/lib/serverLLM.js";
import type { ToolCall, ToolResult } from "./types.js";

// ── Lazy-loaded connectors (avoid cold-start cost if unused) ──

let _uniAssist: any = null;
let _testPrep: any = null;

async function getUniAssist() {
  if (!_uniAssist) {
    const { UniAssistConnector } = await import("../../api/connectors/uniassist.js");
    _uniAssist = new UniAssistConnector();
  }
  return _uniAssist;
}

async function getTestPrep() {
  if (!_testPrep) {
    const { TestPrepConnector } = await import("../../api/connectors/testprep.js");
    _testPrep = new TestPrepConnector();
  }
  return _testPrep;
}

export interface ToolContext {
  requestId: string;
  mode?: string;
  language?: string;
}

// ── Audit log (in-memory ring buffer) ──

interface AuditEntry {
  tool: string;
  ok: boolean;
  durationMs: number;
  requestId: string;
  timestamp: string;
  error?: string;
}

const AUDIT_MAX = 200;
const auditLog: AuditEntry[] = [];

function recordAudit(entry: AuditEntry) {
  auditLog.push(entry);
  if (auditLog.length > AUDIT_MAX) auditLog.shift();
}

/** Recent tool call audit entries (for debugging / health endpoints). */
export function getToolAuditLog(limit = 50): AuditEntry[] {
  return auditLog.slice(-limit);
}

/** Aggregate stats per tool from the audit log. */
export function getToolStats(): Record<string, { calls: number; failures: number; avgMs: number }> {
  const stats: Record<string, { calls: number; failures: number; totalMs: number }> = {};
  for (const e of auditLog) {
    if (!stats[e.tool]) stats[e.tool] = { calls: 0, failures: 0, totalMs: 0 };
    stats[e.tool].calls++;
    if (!e.ok) stats[e.tool].failures++;
    stats[e.tool].totalMs += e.durationMs;
  }
  const result: Record<string, { calls: number; failures: number; avgMs: number }> = {};
  for (const [tool, s] of Object.entries(stats)) {
    result[tool] = { calls: s.calls, failures: s.failures, avgMs: s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0 };
  }
  return result;
}

export async function dispatchTool(
  call: ToolCall,
  ctx: ToolContext,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    let result: ToolResult;

    switch (call.tool) {
      case "web_search": {
        const query = typeof call.args === "string"
          ? call.args
          : (call.args as { query: string }).query;
        const data: ServerSearchOutput = await serverSearch(query);
        result = { tool: call.tool, ok: true, data, durationMs: Date.now() - start };
        break;
      }

      case "llm_call": {
        const a = call.args as { messages: Array<{ role: string; content: unknown }>; mode?: string };
        const text = await serverLLMCall({
          messages: a.messages,
          mode: a.mode ?? ctx.mode,
          requestId: ctx.requestId,
        });
        result = { tool: call.tool, ok: true, data: { text }, durationMs: Date.now() - start };
        break;
      }

      case "app_connector": {
        const a = call.args as {
          connector: string;
          functionName: string;
          fnArgs?: Record<string, unknown>;
          authToken?: string;
        };
        const connector = a.connector === "uniassist"
          ? await getUniAssist()
          : a.connector === "testprep"
            ? await getTestPrep()
            : null;
        if (!connector) {
          result = { tool: call.tool, ok: false, error: `Unknown connector: ${a.connector}`, durationMs: Date.now() - start };
        } else {
          const cr = await connector.call(a.functionName, a.fnArgs ?? {}, a.authToken);
          result = {
            tool: call.tool, ok: cr.ok, data: cr.data,
            error: cr.ok ? undefined : cr.error,
            durationMs: Date.now() - start,
          };
        }
        break;
      }

      case "tts": {
        const a = call.args as { text: string; voice?: string; model?: string };
        // TTS audio is fetched client-side via /api/tts. Server-side dispatch
        // returns resolved parameters so the client can make the call.
        result = {
          tool: call.tool, ok: true,
          data: { text: a.text, voice: a.voice ?? "nova", model: a.model ?? "tts-1", endpoint: "/api/tts" },
          durationMs: Date.now() - start,
        };
        break;
      }

      default:
        result = { tool: call.tool, ok: false, error: `Unknown tool: ${call.tool}`, durationMs: Date.now() - start };
    }

    recordAudit({
      tool: call.tool, ok: result.ok, durationMs: result.durationMs ?? 0,
      requestId: ctx.requestId, timestamp: new Date().toISOString(), error: result.error,
    });
    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : "Tool dispatch failed";
    recordAudit({
      tool: call.tool, ok: false, durationMs,
      requestId: ctx.requestId, timestamp: new Date().toISOString(), error,
    });
    return { tool: call.tool, ok: false, error, durationMs };
  }
}

/**
 * Execute multiple tool calls in parallel.
 */
export async function dispatchToolsBatch(
  calls: ToolCall[],
  ctx: ToolContext,
): Promise<ToolResult[]> {
  return Promise.all(calls.map(c => dispatchTool(c, ctx)));
}

/**
 * Stream an LLM call — returns an async iterable of text chunks.
 * Not tracked in audit (too many entries for streaming); caller tracks overall.
 */
export function streamLLMTool(
  messages: Array<{ role: string; content: unknown }>,
  ctx: ToolContext,
): AsyncIterable<string> {
  return serverLLMStream({ messages, mode: ctx.mode, requestId: ctx.requestId });
}
