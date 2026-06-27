/**
 * InBharat Growth Agent — Module: Content drop-folder (inbox ingestion).
 *
 * The founder drops articles/assets/topics/videos into the admin Inbox tab;
 * files land in a private Supabase Storage bucket `growth-inbox` (tracked in
 * growth_inbox_items). The daily cron ingests pending items:
 *   - text (.md/.txt)  → a human-gated draft outline in growth_drafts
 *     (kind='inbox-outline'); the file content is redact()'d before any model
 *     call, and if no model/budget the raw content is stored for the founder.
 *   - image/video      → a growth_drafts row kind='media-candidate' with the
 *     storage path (no model call); surfaced for the LinkedIn publish flow.
 *   - error            → status='error' + error text; one bad file never aborts
 *     the batch (cron stays reliable).
 *
 * Server-only. Never touches the chat backend; uses the Growth Agent's own
 * model-router + keys. Storage access is service_role only (browser never sees
 * the service key — only short-lived signed upload URLs from /api/growth/inbox).
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { logInfo } from "./authorization.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { critiqueAndRevise } from "./critique.js";
import { loadGlobalRules, formatRulesBlock } from "./rules.js";

export type InboxKind = "md" | "txt" | "image" | "video";

const BUCKET = "growth-inbox";
export const INBOX_BUCKET = BUCKET;
export const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXT = new Set(["md", "txt", "png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "webm"]);

export function isAllowedExt(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXT.has(ext);
}

export function classifyKind(filename: string): InboxKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md") return "md";
  if (ext === "txt") return "txt";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "video";
}

/** sha256 hex of a Buffer/string — used for dedup + the storage object path. */
export function sha256Hex(data: string | Buffer | ArrayBuffer): string {
  return createHash("sha256").update(typeof data === "string" ? data : Buffer.from(data)).digest("hex");
}

/** Storage path for a dropped file: growth-inbox/<sha>/<filename>. */
export function inboxPath(sha: string, filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  return `${sha}/${safe}`;
}

interface InboxItem {
  id: string;
  storage_path: string;
  kind: string;
  original_name: string | null;
  status: string;
  sha256: string | null;
  linked_draft_id: string | null;
  error: string | null;
}

/**
 * Ingest every pending inbox item. Called from the daily cron. Never throws —
 * each item is processed in its own try/catch so one failure doesn't abort the
 * batch. Returns a summary for logging.
 */
export async function ingestPendingInbox(): Promise<{ ingested: number; errored: number; skipped: number }> {
  if (!supabaseAdmin) return { ingested: 0, errored: 0, skipped: 0 };
  let items: InboxItem[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id,storage_path,kind,original_name,status,sha256,linked_draft_id,error")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(25);
    if (error || !Array.isArray(data)) return { ingested: 0, errored: 0, skipped: 0 };
    items = data as InboxItem[];
  } catch {
    return { ingested: 0, errored: 0, skipped: 0 };
  }

  let ingested = 0;
  let errored = 0;
  for (const item of items) {
    try {
      await ingestOne(item);
      ingested++;
    } catch (e) {
      errored++;
      await markError(item.id, (e as Error).message).catch(() => undefined);
    }
  }
  await logInfo("cron-daily-inbox", "global", `ingested=${ingested} errored=${errored} pending=${items.length}`);
  return { ingested, errored, skipped: 0 };
}

async function ingestOne(item: InboxItem): Promise<void> {
  if (!supabaseAdmin) return;
  // Download the object from the private bucket (service_role).
  const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(item.storage_path);
  if (error || !blob) throw new Error(`storage download failed: ${error?.message ?? "no blob"}`);

  if (item.kind === "md" || item.kind === "txt") {
    const text = await blobToText(blob);
    const draft = await draftFromText(text, item.original_name || item.storage_path);
    const draftId = await createDraft({
      kind: "inbox-outline",
      url: null,
      title: item.original_name || "Inbox drop",
      body_md: draft.caption,
      schema_json: {
        inboxPath: item.storage_path,
        note: draft.note ?? null,
        critique: draft.critique
          ? { weaknesses: draft.critique.weaknesses, revised: draft.critique.revised !== null, status: draft.critique.status, note: draft.critique.note }
          : null,
      },
      status: "pending",
    });
    if (draftId && draft.critique) {
      await logCritique(draftId, draft.critique);
    }
    await markIngested(item.id, draftId);
    return;
  }

  // image / video → media-candidate draft (no model call).
  const draftId = await createDraft({
    kind: "media-candidate",
    url: null,
    title: item.original_name || "Inbox media",
    body_md: null,
    schema_json: { inboxPath: item.storage_path, kind: item.kind },
    status: "pending",
  });
  await markIngested(item.id, draftId);
}

async function blobToText(blob: Blob): Promise<string> {
  try {
    return await blob.text();
  } catch {
    // Node supabase-js returns a Blob-like; fall back to arrayBuffer.
    const ab = await blob.arrayBuffer();
    return new TextDecoder().decode(ab);
  }
}

interface DraftResult {
  caption: string | null;
  note?: string;
  critique?: {
    candidate: string;
    revised: string | null;
    weaknesses: { severity: string; area: string; fix: string }[];
    model: string;
    provider: string;
    costUsd: number;
    status: string;
    note: string;
  } | null;
}

/**
 * Produce a short LinkedIn-style outline/caption from dropped text. Redacts the
 * file content before the model call (defensive — the founder's drop may quote
 * anything). Falls back to storing a trimmed excerpt when no model/budget.
 */
async function draftFromText(text: string, name: string): Promise<DraftResult> {
  const excerpt = text.slice(0, 6000);
  const task: GrowthTask = "draft";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { caption: excerpt.slice(0, 600) || null, note: "model not configured or budget exhausted — stored raw excerpt" };
  }
  const system =
    "You are a B2B content assistant for InBharat AI. The founder dropped raw content. Turn it into a concise, hype-free LinkedIn post draft that teases the idea and drives engagement. " +
    "Respond ONLY with compact JSON: {\"caption\": string}.";
  const user = `Source file: ${name}\nContent:\n${excerpt}\n\nWrite a 60–90 word LinkedIn caption in the founder's voice. Return JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return { caption: excerpt.slice(0, 600) || null, note: "redacted secret in dropped content; aborted model call (stored raw excerpt)" };
  }

  try {
    const raw = await callDraftModel(choice, system, user);
    const parsed = safeJson(raw);
    const caption = typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null;
    const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
    void logUsage({
      model: choice.model,
      task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: Math.ceil((raw?.length ?? 0) / 4),
      totalTokens,
      costUsd: estimateCost(choice, totalTokens),
      status: caption ? "ok" : "parse_failed",
      contextUrl: name,
      provider: choice.provider,
    });
    if (!caption) return { caption: excerpt.slice(0, 600) || null, note: "model returned no caption; stored raw excerpt" };

    // Self-critique + revision pass (Phase 2). Inbox drops have no URL scope,
    // so the founder's GLOBAL rules shape the critique. Redacts LAST before its
    // model call (inside critiqueAndRevise). Keeps the candidate when the
    // review model is absent/budget exhausted/redacted.
    const crit = await critiqueAndRevise({
      draftBody: caption,
      context: { url: null, kind: "inbox-outline", sourceName: name },
      rulesBlock: formatRulesBlock(await loadGlobalRules()),
    });
    const finalCaption = crit.revised ?? caption;
    return {
      caption: finalCaption,
      critique: {
        candidate: caption,
        revised: crit.revised,
        weaknesses: crit.weaknesses,
        model: crit.model,
        provider: crit.provider,
        costUsd: crit.costUsd,
        status: crit.status,
        note: crit.note,
      },
    };
  } catch (e) {
    return { caption: excerpt.slice(0, 600) || null, note: `model call failed: ${(e as Error).message}` };
  }
}

/** Call Gemini or OpenAI directly (mirrors promoter.ts; Growth Agent's own key). */
async function callDraftModel(
  choice: ReturnType<typeof pickModel>,
  system: string,
  user: string,
): Promise<string> {
  if (choice.provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${choice.model}:generateContent?key=${key}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 320, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("gemini empty response");
    return text;
  }
  const key = process.env.GROWTH_OPENAI_API_KEY;
  if (!key) throw new Error("GROWTH_OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: choice.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 320,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`openai HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("openai empty response");
  return text;
}

function safeJson(raw: string): { caption?: unknown } | null {
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

async function createDraft(row: {
  kind: string;
  url: string | null;
  title: string;
  body_md: string | null;
  schema_json: Record<string, unknown>;
  status: string;
}): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .insert({
        kind: row.kind,
        url: row.url,
        title: row.title,
        body_md: row.body_md,
        schema_json: row.schema_json,
        status: row.status,
      })
      .select("id")
      .single();
    if (error) return null;
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

/** Append-only transparency log for the inbox critique pass (full candidate +
 *  revised text live only here, never in the client bundle). Best-effort. */
async function logCritique(
  draftId: string,
  c: NonNullable<DraftResult["critique"]>,
): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_critique_log")
    .insert({
      draft_id: draftId,
      task: "review",
      candidate: c.candidate,
      revised: c.revised,
      weaknesses: c.weaknesses,
      model: c.model,
      provider: c.provider,
      cost_usd: c.costUsd,
      status: c.status,
      note: c.note,
    })
    .catch(() => undefined);
}

async function markIngested(itemId: string, draftId: string | null): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_inbox_items")
    .update({ status: "ingested", linked_draft_id: draftId, ingested_at: new Date().toISOString() })
    .eq("id", itemId);
}

async function markError(itemId: string, error: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("growth_inbox_items").update({ status: "error", error }).eq("id", itemId);
}