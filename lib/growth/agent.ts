/**
 * InBharat Growth Agent — Phase C: conversational agent turn loop.
 *
 * The founder chats with an expert-CMO agent that can EXECUTE on command
 * ("draft a punchier caption for X", "make a cover for desh-ka-ai", "analyze
 * this image"). This module runs a bounded Gemini function-calling loop: the
 * model picks a tool (agentTools.ts), we execute it server-side, feed the result
 * back, and repeat until the model answers in text. Every tool produces a
 * HUMAN-GATED draft in growth_drafts — the agent NEVER publishes. The founder
 * still approves + publishes in the Issues tab.
 *
 * History replay: prior turns are replayed as plain text turns (tool calls
 * narrated as "[called X → result]") so we don't have to reconstruct Gemini's
 * strict alternating-role multi-tool-call parts from DB rows. Only the CURRENT
 * turn uses real function declarations. Robust + simple; fidelity is enough for
 * a CMO chat.
 *
 * Gemini-only (Growth Agent's own key + model-router 'chat'/'vision'). Redacts
 * before every model call; withinBudget fail-closed at turn start (budget out →
 * text-only "budget exhausted" turn, no paid tool calls); logUsage on every model
 * call. Never touches the chat backend. Server-only.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGeminiAgent, type GeminiFunctionDeclaration } from "./gemini.js";
import { AGENT_TOOLS, dispatchTool, type ToolResult } from "./agentTools.js";
import { loadStrategy, formatStrategyBlock } from "./strategy.js";
import { loadGlobalRules, formatRulesBlock } from "./rules.js";
import { loadInboxContext, formatInboxBlock } from "./inbox.js";

/** Bound the tool-calling loop so a chatty model can't run forever. */
const MAX_ITERATIONS = 6;

export interface AgentMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: ToolResult | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string | null;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: ToolResult | null;
  created_at: string;
}

export interface AgentTurnResult {
  ok: boolean;
  threadId: string;
  /** The assistant's final text answer (may be null if the turn ended on a tool
   *  call with no closing narration — the UI shows the tool trail either way). */
  reply: string | null;
  /** New messages persisted this turn (user msg + assistant turns + tool results). */
  messages: AgentMessage[];
  note?: string;
}

/**
 * Run one conversational turn. `message` is the founder's new message;
 * `attachmentItemIds` are inbox items attached to THIS turn (their metadata is
 * surfaced to the model so it can call analyze_attachment). `threadId` creates
 * a new thread when null/empty. Never throws — failures become a text reply.
 */
export async function runAgentTurn(
  message: string,
  threadId: string | null,
  attachmentItemIds: string[] = [],
): Promise<AgentTurnResult> {
  const tid = await ensureThread(threadId, message);
  if (!supabaseAdmin) {
    // No DB: still produce a best-effort text reply so the UI doesn't hang. We
    // can't call tools (no persistence) but we can't call the model either
    // without the chat task — so return an honest note + the user message echo.
    const userMsg: AgentMessage = {
      id: "", threadId: tid, role: "user", content: message, toolName: null, toolArgs: null, toolResult: null, createdAt: new Date().toISOString(),
    };
    return { ok: false, threadId: tid, reply: "The Growth Agent database isn't configured, so I can't run tools or persist this conversation. Set Supabase to enable the agent.", messages: [userMsg], note: "no db" };
  }

  // Load history BEFORE persisting the new user message, so replay doesn't
  // duplicate the current message (we push it separately below with the
  // attachment block).
  const history = await loadHistory(tid);

  // Redact-gate the user's message BEFORE persisting or sending it. The prior
  // code only scanned the first 2000 chars of the JSON contents (the current
  // message is pushed at the END, after up to 50 history rows, so a secret in
  // a new message landed beyond the window and was never detected) AND sent
  // the original, un-redacted contents to the model. If the message carries a
  // secret, persist a REDACTED placeholder (never the raw secret) + abort the
  // turn — the model never sees it. Same rule as the other draft paths.
  const userRedact = redact(message);
  if (userRedact.containedSecret) {
    await persistMessage(tid, "user", userRedact.redacted, null, null, null);
    const reply2 = "I caught what looks like a secret in your message and did NOT send it to the model — I've saved a redacted copy here. Remove the secret and send it again.";
    await persistMessage(tid, "assistant", reply2, null, null, null);
    return { ok: false, threadId: tid, reply: reply2, messages: await loadHistory(tid), note: "redacted" };
  }
  // Persist the user message (now known secret-free) so it's saved even if the
  // model call later fails.
  await persistMessage(tid, "user", message, null, null, null);
  const attachmentBlock = await buildAttachmentBlock(attachmentItemIds);

  // Budget gate at turn start: if over cap, answer directly WITHOUT a paid
  // model call. The prior code still invoked the model with tools=[] to "say"
  // budget exhausted — that spent tokens AFTER the budget was already out (the
  // opposite of fail-closed). Tools themselves also re-check withinBudget.
  const budgetOk = await withinBudget();
  if (!budgetOk) {
    const reply = "The monthly budget is exhausted — raise the cap in Settings and I'll pick this up. I've saved your message; send it again after you raise the cap.";
    await persistMessage(tid, "assistant", reply, null, null, null);
    return { ok: true, threadId: tid, reply, messages: await loadHistory(tid), note: "budget exhausted" };
  }
  const tools: GeminiFunctionDeclaration[] = AGENT_TOOLS;

  // Build contents: replay history as text turns (secrets in old history are
  // masked by redact during replay so they never reach the model) + the
  // current user message.
  const contents: unknown[] = replayHistory(history);
  const userText = attachmentBlock ? `${message}\n\n${attachmentBlock}` : message;
  contents.push({ role: "user", parts: [{ text: userText }] });

  const system = await buildSystemPrompt();

  const choice = pickModel("chat" as GrowthTask);
  if (!isModelConfigured(choice)) {
    const reply = "The Growth Agent's Gemini key isn't configured (GEMINI_API_KEY), so I can't run right now. Set it in the project env to enable me.";
    await persistMessage(tid, "assistant", reply, null, null, null);
    return { ok: false, threadId: tid, reply, messages: await loadHistory(tid), note: "model not configured" };
  }

  // ─── Function-calling loop ─────────────────────────────────────────────────
  let iteration = 0;
  let reply: string | null = null;
  for (; iteration < MAX_ITERATIONS; iteration++) {
    // Re-check the budget each iteration (not only at turn start). A turn that
    // starts just under the cap can otherwise run MAX_ITERATIONS model calls +
    // several tool-internal model calls, pushing spend past the cap before any
    // re-check. logUsage (awaited below) busts the spend cache so this re-check
    // observes the spend from the previous iteration.
    if (iteration > 0 && !(await withinBudget())) {
      reply = "I hit the monthly budget mid-turn — the work I queued is in Issues for you to review. Raise the cap in Settings to continue.";
      await persistMessage(tid, "assistant", reply, null, null, null);
      break;
    }

    // Backstop secret scan over the FULL contents+system (no truncation). The
    // user message + history are already redacted before they enter contents;
    // this catches anything that slipped through (e.g. a secret in an
    // attachment block built from inbox data). Abort instead of leaking.
    const scan = redact(`${system}\n${JSON.stringify(contents)}`);
    if (scan.containedSecret) {
      const reply2 = "I caught what looks like a secret in the conversation context and aborted the model call. Please remove it and try again.";
      await persistMessage(tid, "assistant", reply2, null, null, null);
      return { ok: false, threadId: tid, reply: reply2, messages: await loadHistory(tid), note: "redacted" };
    }

    let result;
    try {
      result = await callGeminiAgent(choice, system, contents, tools, { temperature: 0.5, maxOutputTokens: 900 });
    } catch (e) {
      void logUsage({ model: choice.model, task: "chat", promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider });
      const errMsg = `I hit an error talking to the model: ${(e as Error).message}`;
      await persistMessage(tid, "assistant", errMsg, null, null, null);
      return { ok: false, threadId: tid, reply: errMsg, messages: await loadHistory(tid), note: "model error" };
    }

    // Log usage (rough token estimate from the last contents size + reply
    // length). Awaited (not fire-and-forget) so the spend cache busts before the
    // next iteration's withinBudget re-check above.
    const lastText = result.text ?? "";
    const totalTokens = Math.ceil((system.length + lastText.length) / 4) + 200;
    await logUsage({
      model: choice.model, task: "chat",
      promptTokens: Math.ceil(system.length / 4),
      completionTokens: Math.ceil(lastText.length / 4),
      totalTokens, costUsd: estimateCost(choice, totalTokens),
      status: "ok", contextUrl: null, provider: choice.provider,
    });

    if (result.toolCalls.length === 0) {
      // Text answer (no tool calls) ends the turn.
      reply = result.text ?? null;
      if (reply) await persistMessage(tid, "assistant", reply, null, null, null);
      break;
    }

    // The model wants tools. Persist its narration (if any) + each tool call,
    // then execute + feed results back. Gemini wants functionCall in a "model"
    // turn and functionResponse in a "user" turn.
    if (result.text) await persistMessage(tid, "assistant", result.text, null, null, null);
    const modelParts: unknown[] = [];
    const responseParts: unknown[] = [];
    for (const tc of result.toolCalls) {
      modelParts.push({ functionCall: { name: tc.name, args: tc.args } });
      await persistMessage(tid, "assistant", null, tc.name, tc.args, null);
      let toolResult: ToolResult;
      try {
        toolResult = await dispatchTool(tc.name, tc.args);
      } catch (e) {
        toolResult = { ok: false, message: `tool ${tc.name} threw: ${(e as Error).message}` };
      }
      await persistMessage(tid, "tool", null, tc.name, tc.args, toolResult);
      responseParts.push({ functionResponse: { name: tc.name, response: toolResult as Record<string, unknown> } });
    }
    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: responseParts });
    // If the model gave text AND tool calls, keep looping so it can close after
    // seeing results. If it gave ONLY tool calls, loop to get the closing text.
  }

  if (iteration >= MAX_ITERATIONS && reply === null) {
    reply = "I hit my tool-call limit for this turn — the work is queued in Issues for you to review. Tell me to continue if you need more.";
    await persistMessage(tid, "assistant", reply, null, null, null);
  }

  return { ok: true, threadId: tid, reply, messages: await loadHistory(tid) };
}

// ─── System prompt + history + persistence ─────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const rulesBlock = formatRulesBlock(await loadGlobalRules());
  const inboxBlock = formatInboxBlock(await loadInboxContext());
  return [
    "You are the InBharat Growth Agent — an expert fractional CMO for InBharat AI, an Indian AI product studio founded by Reeturaj Goswami.",
    "You converse with the founder and EXECUTE content/growth work on command by calling tools. Every tool produces a HUMAN-GATED draft the founder reviews in the Issues tab — you NEVER publish on your own. Always tell the founder where to review/approve.",
    "Be concise, concrete, hype-free, in the founder's voice. Prefer one tool call per intent; narrate what you did and where to find it. If a tool returns ok:false, relay the reason and suggest a fix instead of retrying blindly.",
    "You can analyze images the founder attaches (analyze_attachment), list/review drafts and inbox folders, redraft captions, and generate covers. For anything outside these tools, advise — don't fabricate results.",
    strategyBlock ? `\n${strategyBlock}` : "",
    rulesBlock ? `\n${rulesBlock}` : "",
    inboxBlock ? `\n${inboxBlock}` : "",
  ].join("");
}

async function buildAttachmentBlock(itemIds: string[]): Promise<string> {
  if (!supabaseAdmin || itemIds.length === 0) return "";
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id,kind,original_name,status")
      .in("id", itemIds)
      .limit(10);
    if (error || !Array.isArray(data) || data.length === 0) return "";
    const lines = (data as Array<{ id: string; kind: string; original_name: string | null; status: string }>).map((r) => {
      const label = r.kind === "image" || r.kind === "video" ? "media" : "text";
      return `- [${label}/${r.kind}] id=${r.id} name=${r.original_name ?? "untitled"} (status: ${r.status})`;
    });
    return `ATTACHMENTS (the founder attached these for this turn — call analyze_attachment on any image to inspect it; use them as context):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

/** Replay persisted history as alternating user/model text turns. Tool calls
 *  are narrated as a model text turn so the model has context without us having
 *  to reconstruct Gemini's strict multi-part tool turns. */
function replayHistory(rows: MessageRow[]): unknown[] {
  const out: unknown[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      if (r.content) out.push({ role: "user", parts: [{ text: redact(r.content).redacted }] });
    } else if (r.role === "assistant") {
      if (r.tool_name) {
        // Narrate a prior tool call as a model text turn.
        const narr = `Called tool ${r.tool_name}(${JSON.stringify(r.tool_args ?? {}).slice(0, 120)}).`;
        const body = r.content ? `${redact(r.content).redacted}\n${narr}` : narr;
        out.push({ role: "model", parts: [{ text: body }] });
      } else if (r.content) {
        out.push({ role: "model", parts: [{ text: redact(r.content).redacted }] });
      }
    } else if (r.role === "tool" && r.tool_name) {
      // Narrate the prior tool result as a user text turn (so the model sees it).
      const res = r.toolResult ? JSON.stringify(r.toolResult).slice(0, 240) : "(no result)";
      out.push({ role: "user", parts: [{ text: redact(`[result of ${r.tool_name}]: ${res}`).redacted }] });
    }
  }
  return out;
}

async function loadHistory(threadId: string): Promise<MessageRow[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_agent_messages")
      .select("id,thread_id,role,content,tool_name,tool_args,tool_result,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error || !Array.isArray(data)) return [];
    return data as MessageRow[];
  } catch {
    return [];
  }
}

async function ensureThread(threadId: string | null, firstMessage: string): Promise<string> {
  if (!supabaseAdmin) return threadId || "scratch";
  if (threadId) {
    // Bump updated_at so the thread floats to the top of the list.
    await supabaseAdmin.from("growth_agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).then(() => undefined, () => undefined);
    return threadId;
  }
  const title = firstMessage.slice(0, 60).trim() || "New conversation";
  const { data, error } = await supabaseAdmin
    .from("growth_agent_threads")
    .insert({ title })
    .select("id")
    .single();
  if (error || !data) return "scratch";
  return data.id as string;
}

async function persistMessage(
  threadId: string,
  role: "user" | "assistant" | "tool",
  content: string | null,
  toolName: string | null,
  toolArgs: Record<string, unknown> | null,
  toolResult: ToolResult | null,
): Promise<void> {
  if (!supabaseAdmin || threadId === "scratch") return;
  await supabaseAdmin
    .from("growth_agent_messages")
    .insert({ thread_id: threadId, role, content, tool_name: toolName, tool_args: toolArgs, tool_result: toolResult })
    .then(() => undefined, () => undefined);
  // Bump thread updated_at on every message (best-effort).
  await supabaseAdmin.from("growth_agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).then(() => undefined, () => undefined);
}

/** List the founder's recent threads (newest first) with a message count. */
export async function listThreads(limit = 20): Promise<{ id: string; title: string; updatedAt: string }[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_agent_threads")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ id: string; title: string; updated_at: string }>).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
  } catch {
    return [];
  }
}

/** Load one thread's messages (oldest first). */
export async function loadThreadMessages(threadId: string): Promise<AgentMessage[]> {
  const rows = await loadHistory(threadId);
  return rows.map((r) => ({
    id: r.id, threadId: r.thread_id, role: r.role as AgentMessage["role"], content: r.content,
    toolName: r.tool_name, toolArgs: r.tool_args, toolResult: r.tool_result, createdAt: r.created_at,
  }));
}