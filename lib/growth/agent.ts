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
import { logError } from "./authorization.js";

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
  /** Compact trail of the tool calls made THIS turn (name + ok + short message),
   *  in execution order, so callers like the morning cron can show the founder
   *  exactly which tools ran and what each returned — instead of a single opaque
   *  `reply` that's null when the turn ends on a tool call. Empty when the model
   *  answered in text with no tool calls. */
  turnTools: { name: string; ok: boolean; message: string }[];
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
    return { ok: false, threadId: tid, reply: "The Growth Agent database isn't configured, so I can't run tools or persist this conversation. Set Supabase to enable the agent.", messages: [userMsg], note: "no db", turnTools: [] };
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
    return { ok: false, threadId: tid, reply: reply2, messages: await loadHistory(tid), note: "redacted", turnTools: [] };
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
    return { ok: true, threadId: tid, reply, messages: await loadHistory(tid), note: "budget exhausted", turnTools: [] };
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
    return { ok: false, threadId: tid, reply, messages: await loadHistory(tid), note: "model not configured", turnTools: [] };
  }

  // ─── Function-calling loop ─────────────────────────────────────────────────
  let iteration = 0;
  let reply: string | null = null;
  let malformedCount = 0;
  // Tool calls made THIS turn, in execution order, so callers (the morning cron)
  // can surface exactly which tools ran + what each returned instead of a single
  // opaque (and often null) reply. Populated only inside the loop below; the early
  // returns above the loop pass `turnTools: []` literally.
  const turnTools: { name: string; ok: boolean; message: string }[] = [];
  // Declared tool names, for narration detection (see the narration-recovery
  // branch below + detectNarratedToolCall). Computed once, outside the loop.
  const toolNames = AGENT_TOOLS.map((t) => t.name);
  // Bounded corrective retries for narration-as-text (sibling to malformedCount).
  let narrationRetries = 0;
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
      return { ok: false, threadId: tid, reply: reply2, messages: await loadHistory(tid), note: "redacted", turnTools };
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
      return { ok: false, threadId: tid, reply: errMsg, messages: await loadHistory(tid), note: "model error", turnTools };
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
      // Before treating this as a final text answer, check the model didn't
      // NARRATE a tool call in prose ("Called tool write_article(...)") instead
      // of emitting a real Gemini functionCall part. This is a known Gemini
      // failure mode (esp. with thinkingBudget:0 + a long replayed-history
      // context) — a sibling of MALFORMED_FUNCTION_CALL above. Left unchecked,
      // the turn ends with zero tool calls and the caller (morning cron) reports
      // a phantom "Called tool X" while drafting nothing. Correct it and retry,
      // bounded so it can't spin. After the retries exhaust, fall through to the
      // normal text-answer end (the caller surfaces "no tools ran" honestly).
      const narrated = result.text ? detectNarratedToolCall(result.text, toolNames) : null;
      if (narrated && result.text && narrationRetries < 2) {
        narrationRetries++;
        await persistMessage(tid, "assistant", result.text, null, null, null);
        contents.push({
          role: "user",
          parts: [{ text: `Your last message described calling ${narrated} in prose — "${result.text.slice(0, 160)}" — but you did NOT actually invoke it. Tool calls are made via the function-calling API (a functionCall part), NOT by writing "Called tool ${narrated}(...)" in text. Please actually call ${narrated} now, using the function-calling interface.` }],
        });
        continue;
      }
      // Real text answer (no tool calls) ends the turn.
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
      // Record this turn's tool call for the caller-facing trail. `message` is
      // already a short human line the model relays verbatim — perfect for the
      // founder-facing "what ran this morning" summary.
      turnTools.push({ name: tc.name, ok: toolResult.ok, message: typeof toolResult.message === "string" ? toolResult.message : "" });
      await persistMessage(tid, "tool", null, tc.name, tc.args, toolResult);
      responseParts.push({ functionResponse: { name: tc.name, response: toolResult as Record<string, unknown> } });
    }
    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: responseParts });
    // If the model gave text AND tool calls, keep looping so it can close after
    // seeing results. If it gave ONLY tool calls, loop to get the closing text.
  }

  if (iteration >= MAX_ITERATIONS && reply === null) {
    // Distinct from the budget-exhausted message (line 170, "monthly budget")
    // and the malformed/narration retry-exhausted messages (lines 225/247): this
    // is the per-turn tool-call bound (6 calls) — the model kept calling tools
    // without producing a closing text answer. Honest about the cause.
    reply = "I reached my per-turn tool-call limit (6 calls) without a closing summary — the work I finished is queued in Issues for your review. Send \"continue\" and I'll pick up where I left off.";
    await persistMessage(tid, "assistant", reply, null, null, null);
  }

  return { ok: true, threadId: tid, reply, messages: await loadHistory(tid), turnTools };
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
    "- Knowledge base (your memory layer) → call search_knowledge BEFORE drafting an article or caption to retrieve what you already know about the topic (prior sources, articles, posts, notes) and avoid repeating an angle. Call find_duplicate before write_article to check the topic isn't a near-duplicate of an existing article/KB entry — if it is, pivot the angle, update the existing piece, or skip. Call save_knowledge to remember a source/decision/note for later. Call list_knowledge when the founder asks 'what topics do we have' or to browse pending research. web_search results are saved to the KB automatically. When the founder asks to find new topics / what to write about / high-intent opportunities for a product → call find_high_intent_topics with the product id (inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep); it scores topics 0-100 across 12 dimensions, dedupes, and saves discovered topics to the KB for founder review (intent is estimated, NOT confirmed search volume; regulated topics are flagged for extra review).",
    "- Analytics (data-driven growth) → for ANY analytics/traffic/search-performance question ('show analytics summary', 'show top pages', 'show top search queries', 'which articles need update', 'which pages have low CTR', 'which topics should we write next', 'show traffic for JAK Shield / Sahayaak / from India') → call read_analytics with the right `view` (summary | top_pages | top_queries | low_ctr | needs_update | recommendations) and optional product/country filter. It reads live GA4 + Search Console data + the recommendations saved by the last sync. NEVER fabricate traffic numbers — if analytics isn't configured, say so. When the founder says 'sync analytics now' or it's been >1d since the last sync and they ask for recommendations → call sync_analytics (pulls fresh data, generates insights, saves them to the KB so future drafts are data-driven). The founder reviews insights in the Knowledge UI; nothing auto-publishes.",
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

/** Compact a persisted tool result for history replay so the model can still
 *  reference the ids it produced in EARLIER turns (draftId, slug, itemId, id,
 *  filename, url) without bloating context with full previews/captions/bodies.
 *
 *  The old replay did `JSON.stringify(result).slice(0, 240)`, which truncated
 *  LONG results (e.g. write_article's ~400-char `preview`) BEFORE the `draftId`
 *  field — so in a later turn the model had lost the draftId and the next
 *  generate_cover(redraft_caption, promote_article) call failed with
 *  "draft not found" (the founder saw the agent ask them to re-confirm the id).
 *  This ALWAYS surfaces the id-like fields + ok + message, capping only the
 *  bulky non-identifying fields. Fixes the cross-turn memory-retention bug. */
export function summarizeToolResult(name: string, result: ToolResult | null): string {
  if (!result) return `(no result for ${name})`;
  const ID_KEYS = ["draftId", "slug", "itemId", "id", "threadId", "filename", "url", "status"];
  const parts: string[] = [`ok=${result.ok ? "true" : "false"}`];
  if (typeof result.message === "string" && result.message) parts.push(`msg=${result.message.slice(0, 160)}`);
  const seen = new Set(["ok", "message"]);
  for (const key of ID_KEYS) {
    const v = (result as Record<string, unknown>)[key];
    if (typeof v === "string" && v) { parts.push(`${key}=${v}`); seen.add(key); }
    else if (typeof v === "number") { parts.push(`${key}=${v}`); seen.add(key); }
  }
  // A short preview of any remaining fields (title, category, captionPreview, …)
  // capped so context stays lean — never the full body/preview/caption.
  const extra: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (seen.has(k) || v == null) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    extra.push(`${k}=${s.slice(0, 80)}`);
    if (extra.length >= 4) break;
  }
  if (extra.length) parts.push(extra.join(", "));
  return `[result of ${name}]: ${parts.join("; ")}`;
}

/** Detect when the model NARRATED a tool call in prose — "Called tool X(...)",
 *  "I'll call X(...)", "let me run X(...)" — instead of emitting a real Gemini
 *  `functionCall` part. Returns the narrated tool name, or null for a normal text
 *  answer. Conservative: requires a calling-verb before the tool name + `(` so a
 *  doc-style answer like "write_article(topic, instruction) creates a draft"
 *  (no calling verb) does NOT trip a false positive. Sibling to the
 *  MALFORMED_FUNCTION_CALL recovery: the model emitting text that LOOKS like a
 *  tool call but isn't a real functionCall is a known Gemini failure mode
 *  (especially with thinkingBudget:0 and a long replayed-history context). */
export function detectNarratedToolCall(text: string, toolNames: string[]): string | null {
  if (!text || toolNames.length === 0) return null;
  // Calling verbs that signal "the model is describing a tool invocation" vs
  // "the model is documenting what a tool does". Keep the alternation tight so
  // the regex stays readable + auditable.
  const VERBS = "called|calling|call|invoke|invoking|invoked|use|using|used|run|running|ran|let me|i'll|i will|going to|will now|now i'll";
  for (const name of toolNames) {
    // Escape the tool name (they're all \w+ here, but be safe) — no special chars,
    // so a plain escape is fine.
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:${VERBS})\\s+(?:tool\\s+)?${esc}\\s*\\(`, "i");
    if (re.test(text)) return name;
  }
  return null;
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
      out.push({ role: "user", parts: [{ text: redact(summarizeToolResult(r.tool_name, r.toolResult)).redacted }] });
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
    if (error || !Array.isArray(data)) {
      // Surface the failure: a DB blip used to silently return [] and make the
      // agent answer context-blind with no signal to the founder. Returning []
      // is still the graceful behavior (the turn continues with no history), but
      // now the error is visible in the insights error feed.
      await logError("agent-load-history-fail", threadId, error?.message || "no data returned").catch(() => undefined);
      return [];
    }
    return data as MessageRow[];
  } catch (e) {
    await logError("agent-load-history-fail", threadId, (e as Error).message).catch(() => undefined);
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