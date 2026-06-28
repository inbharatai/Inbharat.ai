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
  let malformedCount = 0;
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
      // maxOutputTokens is a CAP, not a target — the model only generates what it
      // needs, so a high cap costs nothing on short replies. But a LOW cap
      // truncates tool calls whose arguments carry long pasted text (e.g.
      // review_text with a full article in the `text` arg) → Gemini flags the
      // truncated JSON MALFORMED_FUNCTION_CALL. 8192 fits a ~12k-char paste's
      // args + narration with room to spare; was 900 (too low — caused the live
      // "gemini-agent empty response (finishReason=MALFORMED_FUNCTION_CALL)").
      result = await callGeminiAgent(choice, system, contents, tools, { temperature: 0.5, maxOutputTokens: 8192 });
    } catch (e) {
      void logUsage({ model: choice.model, task: "chat", promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider });
      const errMsg = `I hit an error talking to the model: ${(e as Error).message}`;
      await persistMessage(tid, "assistant", errMsg, null, null, null);
      return { ok: false, threadId: tid, reply: errMsg, messages: await loadHistory(tid), note: "model error" };
    }

    // Log usage (rough token estimate from system + the model's emitted text +
    // tool-call args). Awaited (not fire-and-forget) so the spend cache busts
    // before the next iteration's withinBudget re-check above. The prior estimate
    // only counted `lastText` — for a tool-call turn that's just the narration, so
    // a 6k-char review_text call logged ~0 completion tokens. Now counts args too.
    const lastText = result.text ?? "";
    const toolArgsChars = result.toolCalls.reduce((n, tc) => n + JSON.stringify(tc.args ?? {}).length, 0);
    const totalTokens = Math.ceil((system.length + lastText.length + toolArgsChars) / 4) + 200;
    await logUsage({
      model: choice.model, task: "chat",
      promptTokens: Math.ceil(system.length / 4),
      completionTokens: Math.ceil((lastText.length + toolArgsChars) / 4),
      totalTokens, costUsd: estimateCost(choice, totalTokens),
      status: "ok", contextUrl: null, provider: choice.provider,
    });

    // Recover from a malformed function call (truncated/invalid JSON args) by
    // feeding back a guidance turn and retrying — bounded so it can't spin. With
    // the 8192 cap this is rare, but it's defense-in-depth for very long pastes.
    if (result.finishReason === "MALFORMED_FUNCTION_CALL" && result.toolCalls.length === 0) {
      malformedCount++;
      if (malformedCount > 2) {
        reply = "I kept getting a malformed tool call — that usually means the pasted text is too long for one shot. Try pasting a shorter excerpt, or ask me to review it in two halves.";
        await persistMessage(tid, "assistant", reply, null, null, null);
        break;
      }
      contents.push({
        role: "user",
        parts: [{ text: "Your last function call was malformed — the arguments were truncated or not valid JSON. Try the same call again. If you are passing long pasted text in the `text` argument, emit the FULL text as valid JSON; you have enough output budget to fit it. Do not abbreviate or truncate the text." }],
      });
      continue;
    }

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
    "You converse with the founder and EXECUTE content + growth work on command by calling tools. You are resourceful: you can search the web, read the founder's inbox assets, draft articles and LinkedIn posts, generate cover images, and review/revise anything the founder pastes. Every tool produces a HUMAN-GATED draft the founder reviews in the Issues tab — you NEVER publish on your own. Always tell the founder exactly where to review, edit, and approve.",
    "",
    "HOW TO WORK (pick the right tool):",
    "- Pasted text to review/improve/upgrade → call review_text (NOT redraft_caption, which needs an existing draft id and will fail with 'draft not found'). Long text becomes an article draft (publishes to inbharat.ai/learn-ai-with-reeturaj); short text becomes a LinkedIn caption draft.",
    "- Full article from a topic or inbox material → call write_article. Use this for long-form inbharat.ai pieces; use review_text when the founder pastes existing text to improve.",
    "- LinkedIn caption for an article you just drafted or that's published → call promote_article with the article's URL (https://inbharat.ai/learn-ai-with-reeturaj/<slug>). It auto-loads the article's title/description so the caption is on-brand; it's idempotent (skips if a caption already exists for that URL). This is the right tool whenever the founder wants 'a post AND an article' — write_article then promote_article for the same slug.",
    "- LinkedIn caption from a standalone topic/angle (no article) → call review_text with the short angle as the text + an instruction like 'write a 60–90 word LinkedIn caption in the founder's voice from this'.",
    "- Edit an EXISTING draft the founder points at (by id, or after list_recent_drafts) → call redraft_caption with that draftId + the edit instruction.",
    "- Cover image → call generate_cover with the article draftId (right after write_article/review_text) or a published slug. To keep all covers consistent, pass sampleItemId = an inbox image the founder designated as the style sample ('use this as the cover style', 'keep all covers like this').",
    "- Need current facts, recent news, a date, a number, or to verify a claim → call web_search. Never guess 'latest'/date/number claims; search first.",
    "- Inbox assets the founder references ('the article I dropped', 'use my inbox') → the INBOX ASSETS block below lists what's fed. Call list_inbox_folder for more, or analyze_attachment to read an image/text item in full.",
    "- Never invent a draft id or inbox item id. If you don't have one, call list_recent_drafts / list_inbox_folder first, or create a new draft with write_article / review_text.",
    "- If a request is ambiguous or no tool fits → ask ONE short clarifying question. Don't fabricate results; don't call a tool you don't have.",
    "",
    "PUBLISH FLOW (tell the founder when you finish, so they know what happens next):",
    "- Articles: approve in Issues → Publish → goes live on inbharat.ai/learn-ai-with-reeturaj/<slug> (the cover commits with it).",
    "- LinkedIn captions: approve in Issues → Publish → you get a one-click share link to post manually (the safe, ToS-compliant path). To auto-fill the LinkedIn composer, the founder runs the local scripts/linkedin-populate.ts Playwright tool on their own machine.",
    "- Covers: approve in Issues → Publish → commits the PNG + wires it to the article.",
    "",
    "STYLE: concise, concrete, hype-free, in the founder's voice. Prefer the fewest tool calls that get the job done; narrate what you did and where to find it. If a tool returns ok:false, relay the reason and suggest a fix instead of retrying blindly.",
    "BANNED TERMS: never 'UniGurus'; for any healthcare reference use 'Sahayaak Seva' (never 'RHCF Seva').",
    strategyBlock ? `\n${strategyBlock}` : "",
    rulesBlock ? `\n${rulesBlock}` : "",
    inboxBlock ? `\n${inboxBlock}` : "",
  ].join("\n");
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

/** Delete a thread + its messages. Best-effort (Postgrest builders are
 *  PromiseLike — use .then(onFulfilled, onRejected), not .catch). */
export async function deleteThread(threadId: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("growth_agent_messages").delete().eq("thread_id", threadId).then(() => undefined, () => undefined);
  await supabaseAdmin.from("growth_agent_threads").delete().eq("id", threadId).then(() => undefined, () => undefined);
}

/** Stable fallback id when Supabase is absent — a fixed UUID so the no-DB path
 *  still returns a consistent thread id (persistMessage no-ops without supabaseAdmin
 *  anyway, so nothing is written). */
const NAMED_THREAD_FALLBACK_ID = "11111111-1111-4111-8111-111111111111";

/** Find or create a thread by its exact title (used by the daily morning cron so
 *  every 8am run appends to ONE "Build with Reeturaj — Daily Plan" thread the
 *  founder reviews each morning). Returns the thread id; on any DB error or when
 *  supabaseAdmin is unset, returns a stable fallback id (never throws). */
export async function ensureNamedThread(title: string): Promise<string> {
  if (!supabaseAdmin) return NAMED_THREAD_FALLBACK_ID;
  try {
    // Look for an existing thread with this exact title (newest first).
    const { data: existing, error: qErr } = await supabaseAdmin
      .from("growth_agent_threads")
      .select("id")
      .eq("title", title)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!qErr && existing && typeof (existing as { id?: unknown }).id === "string") {
      return (existing as { id: string }).id;
    }
    // None found → create it.
    const { data, error } = await supabaseAdmin
      .from("growth_agent_threads")
      .insert({ title })
      .select("id")
      .single();
    if (error || !data) return NAMED_THREAD_FALLBACK_ID;
    return data.id as string;
  } catch {
    return NAMED_THREAD_FALLBACK_ID;
  }
}