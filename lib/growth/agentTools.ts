/**
 * InBharat Growth Agent — Phase C: tool registry the conversational agent can call.
 *
 * The founder chats with the CMO agent ("draft a punchier caption for the RAG
 * article", "make a cover for desh-ka-ai", "analyze this image and suggest a
 * cover inspired by it"). Gemini function-calling picks a tool; this module
 * executes it server-side and returns a JSON result the agent loop feeds back to
 * the model. Every tool produces a HUMAN-GATED draft in growth_drafts — the
 * agent NEVER publishes. The founder still approves + publishes in the Issues tab.
 *
 * Gemini-only (Growth Agent's own GEMINI_API_KEY + model-router). Never touches
 * the chat backend. Redacts before every model call; withinBudget fail-closed;
 * logUsage on every model call. The vision tool is the ONLY place raw image bytes
 * reach a model, and it stays inside the Growth Agent's Gemini key.
 *
 * Server-only.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini, callGeminiVision, type GeminiFunctionDeclaration } from "./gemini.js";
import { generateCoverDraft } from "./cover.js";
import { loadInboxContext, formatInboxBlock, INBOX_BUCKET } from "./inbox.js";
import { loadRulesForUrl, formatRulesBlock } from "./rules.js";
import { loadStrategy, formatStrategyBlock } from "./strategy.js";
import { critiqueAndRevise } from "./critique.js";
import { ARTICLES } from "../../content/articles.meta.js";
import { logInfo } from "./authorization.js";

/** Result every executor returns: a JSON-serializable object the agent loop
 *  feeds back to Gemini as a functionResponse part + persists to
 *  growth_agent_messages (role='tool'). `ok:false` means the tool ran but could
 *  not produce the artifact (model unconfigured / budget / not found); the agent
 *  narrates that to the founder instead of erroring the whole turn. */
export interface ToolResult {
  ok: boolean;
  /** Short human line the agent can relay verbatim ("Drafted a cover for X — review in Issues"). */
  message?: string;
  [k: string]: unknown;
}

/** Args the model passes are loosely typed; each executor validates its own. */
type Args = Record<string, unknown>;

const num = (v: unknown, def: number, max: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : def;
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ─── Tool declarations (Gemini functionDeclarations) ─────────────────────────

export const AGENT_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "list_recent_drafts",
    description:
      "List the most recent Growth Agent drafts (LinkedIn captions, covers, inbox outlines, media candidates) so you can reference what's pending, approved, or published. Call this first when the founder asks 'what's in the queue' or before redrafting an existing caption.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many drafts to return (1–20).", minimum: 1, maximum: 20 } },
    },
  },
  {
    name: "redraft_caption",
    description:
      "Rewrite an existing draft's caption (LinkedIn post / inbox outline) per the founder's instruction — e.g. 'make it punchier', 'add a question hook'. Creates a NEW pending draft (the original is untouched); the founder still approves + publishes. Never call this without a specific instruction.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "The growth_drafts id of the draft to rewrite." },
        instruction: { type: "string", description: "The founder's edit instruction (what to change)." },
      },
      required: ["draftId", "instruction"],
    },
  },
  {
    name: "generate_cover",
    description:
      "Draft an on-brand 1200x630 hero cover image for an article (gemini-2.5-flash-image). Creates a pending cover draft the founder approves in Issues. Use the article slug (e.g. 'desh-ka-ai').",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "The article slug to draft a cover for." } },
      required: ["slug"],
    },
  },
  {
    name: "list_inbox_folder",
    description:
      "List the founder-fed inbox reference assets (text excerpts + media notes) the agent can draw on. Pass a folder to scope to that folder (+sub-folders); omit for everything fed. Use before drafting when the founder references dropped material.",
    parameters: {
      type: "object",
      properties: { folder: { type: "string", description: "Optional folder path to scope to." } },
    },
  },
  {
    name: "analyze_attachment",
    description:
      "Analyze an uploaded image or text attachment on command (gemini-2.5-flash vision). The founder says 'analyze this' / 'use this as a cover reference'. Returns the analysis text and stores it on the inbox item. Pass the inbox item id (the UI shows it).",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "The growth_inbox_items id of the attachment to analyze." },
        instruction: { type: "string", description: "Optional: what to analyze the attachment for (e.g. 'suggest a cover inspired by this')." },
      },
      required: ["itemId"],
    },
  },
];

// ─── Executors ──────────────────────────────────────────────────────────────

/** list_recent_drafts — recent growth_drafts with a body snippet. */
async function listRecentDrafts(args: Args): Promise<ToolResult> {
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const limit = num(args.limit, 10, 20);
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,status,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, message: `query failed: ${error.message}` };
    const drafts = (data || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      kind: r.kind,
      url: r.url,
      title: r.title,
      status: r.status,
      created: r.created_at,
      snippet: typeof r.body_md === "string" ? r.body_md.slice(0, 160) : null,
    }));
    return { ok: true, message: `${drafts.length} recent draft(s)`, drafts };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** redraft_caption — rewrite an existing draft's caption per instruction. */
async function redraftCaption(args: Args): Promise<ToolResult> {
  const draftId = str(args.draftId);
  const instruction = str(args.instruction);
  if (!draftId || !instruction) return { ok: false, message: "need draftId + instruction" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  // Load the source draft.
  const { data: src, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,url,title,body_md")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !src) return { ok: false, message: "draft not found" };
  const srcRow = src as { id: string; kind: string; url: string | null; title: string | null; body_md: string | null };
  const original = srcRow.body_md ?? "";
  if (!original) return { ok: false, message: "that draft has no caption text to rewrite" };

  const task: GrowthTask = "draft";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { ok: false, message: "draft model not configured or monthly budget exhausted" };
  }

  const rulesBlock = srcRow.url ? formatRulesBlock(await loadRulesForUrl(srcRow.url)) : "";
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const inboxBlock = formatInboxBlock(await loadInboxContext());

  const system =
    "You are a B2B content editor for InBharat AI. Rewrite the founder's LinkedIn caption per their instruction. " +
    "Keep it 60–90 words, concise, hype-free, in the founder's voice. Respond ONLY with compact JSON: {\"caption\": string}." +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "");
  const user =
    `Original caption:\n${original}\n\n` +
    `Founder's edit instruction:\n${instruction}\n\n` +
    `Return the rewritten caption as JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) return { ok: false, message: "redacted secret in prompt; aborted" };

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 320 });
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: srcRow.url ?? null, provider: choice.provider });
    return { ok: false, message: `model call failed: ${(e as Error).message}` };
  }
  const parsed = safeJsonCaption(raw);
  const caption = typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null;
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: caption ? "ok" : "parse_failed", contextUrl: srcRow.url ?? null, provider: choice.provider,
  });
  if (!caption) return { ok: false, message: "model returned no usable caption" };

  // Self-critique + revision (keeps the candidate when critique is unavailable).
  const crit = await critiqueAndRevise({
    draftBody: caption,
    context: { url: srcRow.url, kind: srcRow.kind, title: srcRow.title },
    rulesBlock, inboxBlock, strategyBlock,
  });
  const finalCaption = crit.revised ?? caption;

  // Persist a NEW pending draft (original untouched). kind = source kind so the
  // Issues tab routes it correctly; schema_json marks it as an agent redraft.
  const { data: ins, error: insErr } = await supabaseAdmin
    .from("growth_drafts")
    .insert({
      kind: srcRow.kind || "linkedin",
      url: srcRow.url,
      title: srcRow.title ? `${srcRow.title} (redraft)` : "Agent redraft",
      body_md: finalCaption,
      schema_json: {
        agentRedraftOf: srcRow.id,
        instruction,
        critique: { weaknesses: crit.weaknesses, revised: crit.revised !== null, status: crit.status, note: crit.note },
      },
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !ins) return { ok: false, message: `persist failed: ${insErr?.message ?? "unknown"}` };
  const newId = ins.id as string;
  // Best-effort critique log (full candidate+revised text only here).
  await supabaseAdmin
    .from("growth_critique_log")
    .insert({
      draft_id: newId, task: "review", candidate: caption, revised: crit.revised,
      weaknesses: crit.weaknesses, model: crit.model, provider: crit.provider, cost_usd: crit.costUsd,
      status: crit.status, note: crit.note,
    })
    .then(() => undefined, () => undefined);
  return { ok: true, message: `Redrafted caption — new pending draft ${newId} (review in Issues).`, draftId: newId, caption: finalCaption };
}

/** generate_cover — draft an on-brand cover for an article slug. */
async function generateCover(args: Args): Promise<ToolResult> {
  const slug = str(args.slug);
  if (!slug) return { ok: false, message: "need an article slug" };
  const meta = ARTICLES.find((a) => a.slug === slug);
  if (!meta) return { ok: false, message: `no article found for slug "${slug}"` };
  try {
    const result = await generateCoverDraft(meta);
    if (result.status !== "pending") {
      return { ok: false, message: result.note ?? "cover not drafted (skipped)" };
    }
    return { ok: true, message: `Cover drafted for "${meta.title}" — review in Issues.`, draftId: result.draftId, filename: result.filename };
  } catch (e) {
    return { ok: false, message: `cover draft failed: ${(e as Error).message}` };
  }
}

/** list_inbox_folder — fed reference assets summary. */
async function listInboxFolder(args: Args): Promise<ToolResult> {
  const folder = str(args.folder);
  const items = await loadInboxContext(folder || undefined);
  if (items.length === 0) return { ok: true, message: "no fed inbox assets", items: [] };
  const block = formatInboxBlock(items);
  return {
    ok: true,
    message: `${items.length} fed asset(s) in ${folder || "all folders"}`,
    items: items.map((it) => ({ id: it.id, folder: it.folder, kind: it.kind, name: it.originalName, excerpt: it.excerpt, mediaNote: it.mediaNote })),
    block,
  };
}

/** analyze_attachment — vision/text analysis of an inbox item on command. */
async function analyzeAttachment(args: Args): Promise<ToolResult> {
  const itemId = str(args.itemId);
  const instruction = str(args.instruction) || "Describe this image and note anything useful for InBharat's content (style, palette, motif, text).";
  if (!itemId) return { ok: false, message: "need an itemId" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  const { data: row, error: qErr } = await supabaseAdmin
    .from("growth_inbox_items")
    .select("id,storage_path,kind,original_name")
    .eq("id", itemId)
    .maybeSingle();
  if (qErr || !row) return { ok: false, message: "attachment not found" };
  const item = row as { id: string; storage_path: string; kind: string; original_name: string | null };

  // Download the object (service_role).
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(INBOX_BUCKET).download(item.storage_path);
  if (dlErr || !blob) return { ok: false, message: `download failed: ${dlErr?.message ?? "no blob"}` };

  if (item.kind === "image") {
    return analyzeImage(item, blob, instruction);
  }
  if (item.kind === "md" || item.kind === "txt") {
    const text = await blobToText(blob);
    const excerpt = text.slice(0, 1500);
    await saveAnalysis(itemId, { kind: "text", excerpt, instruction });
    return { ok: true, message: `Read ${item.original_name ?? "text file"} (${text.length} chars).`, excerpt };
  }
  // video / other — no frame extraction (would need ffmpeg); return metadata.
  await saveAnalysis(itemId, { kind: item.kind, note: "video/non-image attachment — metadata only; frame analysis not supported." });
  return { ok: false, message: `cannot deeply analyze a ${item.kind} attachment yet — use an image or text file` };
}

async function analyzeImage(
  item: { id: string; storage_path: string; kind: string; original_name: string | null },
  blob: Blob,
  instruction: string,
): Promise<ToolResult> {
  const task: GrowthTask = "vision";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { ok: false, message: "vision model not configured or monthly budget exhausted" };
  }
  const ab = await blob.arrayBuffer();
  const buf = Buffer.from(ab);
  const mimeType = guessMime(item.storage_path);
  const imageBase64 = buf.toString("base64");

  const redacted = redact(instruction);
  if (redacted.containedSecret) return { ok: false, message: "redacted secret in instruction; aborted" };

  let analysis: string;
  try {
    analysis = await callGeminiVision(choice, instruction, imageBase64, mimeType);
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: item.storage_path, provider: choice.provider });
    return { ok: false, message: `vision call failed: ${(e as Error).message}` };
  }
  const totalTokens = Math.ceil((instruction.length + analysis.length) / 4) + Math.ceil(buf.length / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil(instruction.length / 4),
    completionTokens: Math.ceil(analysis.length / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: "ok", contextUrl: item.storage_path, provider: choice.provider,
  });
  await saveAnalysis(item.id, { kind: "image", instruction, analysis });
  await logInfo("agent-analyze-image", item.storage_path, analysis.slice(0, 200)).catch(() => undefined);
  return { ok: true, message: `Analyzed image (${item.original_name ?? "untitled"}).`, analysis };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safeJsonCaption(raw: string): { caption?: unknown } | null {
  try {
    return JSON.parse(raw) as { caption?: unknown };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { caption?: unknown };
    } catch {
      return null;
    }
  }
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

async function blobToText(blob: Blob): Promise<string> {
  try {
    return await blob.text();
  } catch {
    return new TextDecoder().decode(await blob.arrayBuffer());
  }
}

async function saveAnalysis(itemId: string, analysis: Record<string, unknown>): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_inbox_items")
    .update({ analysis })
    .eq("id", itemId)
    .then(() => undefined, () => undefined);
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/** Map tool name → executor. The agent loop calls this with the model's args. */
export async function dispatchTool(name: string, args: Args): Promise<ToolResult> {
  switch (name) {
    case "list_recent_drafts": return listRecentDrafts(args);
    case "redraft_caption": return redraftCaption(args);
    case "generate_cover": return generateCover(args);
    case "list_inbox_folder": return listInboxFolder(args);
    case "analyze_attachment": return analyzeAttachment(args);
    default: return { ok: false, message: `unknown tool: ${name}` };
  }
}