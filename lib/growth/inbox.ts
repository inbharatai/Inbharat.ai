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
import { callGemini } from "./gemini.js";
import { critiqueAndRevise } from "./critique.js";
import { loadGlobalRules, formatRulesBlock } from "./rules.js";
import { loadStrategy, formatStrategyBlock } from "./strategy.js";

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

/** Storage path for a dropped file: growth-inbox/<folder>/<sha>/<filename>.
 *  `folder` is a sanitized relative path ('' = root). Each segment is stripped to
 *  [\w.-] so a founder-supplied folder name can't escape the bucket prefix. */
export function inboxPath(sha: string, filename: string, folder: string = ""): string {
  const safe = filename.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const folderSeg = sanitizeFolder(folder);
  return folderSeg ? `${folderSeg}/${sha}/${safe}` : `${sha}/${safe}`;
}

/** Sanitize a folder path to safe storage segments: 'campaigns/launch!' →
 *  'campaigns/launch'. Empty string = root (no folder segment). */
export function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map((s) => s.replace(/[^\w.-]+/g, "_").replace(/^[._-]+/g, "").replace(/[._-]+$/g, "").slice(-40))
    .filter(Boolean)
    .join("/");
}

interface InboxItem {
  id: string;
  storage_path: string;
  kind: string;
  original_name: string | null;
  status: string;
  sha256: string | null;
  folder: string | null;
  fed_to_agent: boolean | null;
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
      .select("id,storage_path,kind,original_name,status,sha256,folder,fed_to_agent,linked_draft_id,error")
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
  // CMO context (Phase D/B): inject the founder's positioning/ICP/voice +
  // global rules + fed-inbox assets into the DRAFT prompt so the first-pass
  // candidate is on-brand from the start — not only into the critique pass
  // (which used to be the only place these blocks landed, so an inbox drop was
  // drafted as a generic copy assistant and only revised toward the brand).
  // Mirrors promoter.ts / articleWriter.ts. Loaded once and reused for the
  // critique pass below to avoid 3 redundant DB reads.
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const rulesBlock = formatRulesBlock(await loadGlobalRules());
  const inboxBlock = formatInboxBlock(await loadInboxContext());

  const system =
    "You are a B2B content assistant for InBharat AI. The founder dropped raw content. Turn it into a concise, hype-free LinkedIn post draft that teases the idea and drives engagement. " +
    "Respond ONLY with compact JSON: {\"caption\": string}." +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "");
  const user = `Source file: ${name}\nContent:\n${excerpt}\n\nWrite a 60–90 word LinkedIn caption in the founder's voice. Return JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return { caption: excerpt.slice(0, 600) || null, note: "redacted secret in dropped content; aborted model call (stored raw excerpt)" };
  }

  try {
    const raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 320 });
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
    // review model is absent/budget exhausted/redacted. Phase B: also feed the
    // founder-fed inbox assets so the critique can cross-reference sibling drops.
    const crit = await critiqueAndRevise({
      draftBody: caption,
      context: { url: null, kind: "inbox-outline", sourceName: name },
      rulesBlock,
      inboxBlock,
      strategyBlock,
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
  // .then(onFulfilled, onRejected) — NOT .catch (Postgrest builders are
  // PromiseLike, .catch throws synchronously; that throw propagated to ingestOne's
  // caller and marked the item 'error' even though the draft was already created).
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
    .then(() => undefined, () => undefined);
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

// ─── Phase B: folder context the agent can access, review, and use ─────────────

export interface InboxContextItem {
  id: string;
  folder: string;
  kind: string;
  originalName: string | null;
  /** Ingested text excerpt for md/txt drops (from the linked draft's body_md);
   *  null for media candidates. Capped for prompt budget. */
  excerpt: string | null;
  /** For image/video: a note that it's a media asset (the bytes are NOT inlined
   *  here — the C4 vision task reads them on demand via a signed URL). */
  mediaNote: string | null;
}

/**
 * Load the inbox assets the founder has marked "fed to agent" as context. When
 * `folder` is given, returns that folder AND its sub-folders (recursive), so a
 * top-level folder drop feeds every nested asset. Joins to growth_drafts via
 * linked_draft_id to recover the ingested text excerpt (media candidates have no
 * excerpt). Never throws; returns [] when the DB is absent / nothing is fed.
 *
 * Server-only. Used by the promoter + critique + agent system prompts.
 */
export async function loadInboxContext(folder?: string): Promise<InboxContextItem[]> {
  if (!supabaseAdmin) return [];
  try {
    const folderSeg = sanitizeFolder(folder ?? "");
    // Recursive: this folder or any sub-folder (folder = '<f>' OR folder LIKE '<f>/%').
    const base = supabaseAdmin
      .from("growth_inbox_items")
      .select("id,folder,kind,original_name,linked_draft_id,draft:growth_drafts(body_md)")
      .eq("fed_to_agent", true)
      .eq("status", "ingested");
    let q;
    if (folderSeg) {
      // Two OR conditions via Postgrest `or`: folder.eq or folder.like (sub-folders).
      q = base.or(`folder.eq.${folderSeg},folder.like.${folderSeg}/%`);
    } else {
      q = base; // root call → every fed item regardless of folder
    }
    const { data, error } = await q.limit(60);
    if (error || !Array.isArray(data)) return [];
    const out: InboxContextItem[] = [];
    for (const r of data as Array<{ id: string; folder: string; kind: string; original_name: string | null; linked_draft_id: string | null; draft: { body_md: string | null } | null }>) {
      const isMedia = r.kind === "image" || r.kind === "video";
      const bodyMd = Array.isArray(r.draft) ? r.draft[0]?.body_md : r.draft?.body_md;
      out.push({
        id: r.id,
        folder: r.folder ?? "",
        kind: r.kind,
        originalName: r.original_name,
        excerpt: !isMedia && typeof bodyMd === "string" ? bodyMd.slice(0, 800) : null,
        mediaNote: isMedia ? `${r.kind} asset (${r.original_name ?? "untitled"}) — available for the vision/cover task to analyze on command` : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Format fed inbox assets into a system-prompt block. Returns "" when there are
 * no assets so the prompt is unchanged (mirrors formatRulesBlock). The block
 * groups by folder and labels media vs text so the critique pass can judge which
 * asset facts belong in a draft.
 */
export function formatInboxBlock(items: InboxContextItem[]): string {
  if (items.length === 0) return "";
  const byFolder = new Map<string, string[]>();
  for (const it of items) {
    const list = byFolder.get(it.folder) ?? [];
    if (it.excerpt) {
      list.push(`- [text/${it.kind}] ${it.originalName ?? "untitled"}: ${it.excerpt.replace(/\s+/g, " ").trim()}`);
    } else if (it.mediaNote) {
      list.push(`- [media/${it.kind}] ${it.mediaNote}`);
    }
    byFolder.set(it.folder, list);
  }
  const sections = Array.from(byFolder.entries()).map(([folder, lines]) => {
    const label = folder || "(root)";
    return `Folder: ${label}\n${lines.join("\n")}`;
  });
  return `INBOX ASSETS (founder-fed reference material — review and use wisely; cite facts, ignore anything off-brand):\n${sections.join("\n\n")}`;
}

/**
 * Mark every (non-ingested or ingested) item in a folder — and its sub-folders —
 * as fed to the agent (available context). Called from the admin "Feed to agent"
 * action. Returns the count updated. Never throws.
 */
export async function markFolderFedToAgent(folder: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  const folderSeg = sanitizeFolder(folder);
  if (!folderSeg) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_inbox_items")
      .update({ fed_to_agent: true })
      .or(`folder.eq.${folderSeg},folder.like.${folderSeg}/%`)
      .eq("status", "ingested")
      .select("id");
    if (error || !Array.isArray(data)) return 0;
    return data.length;
  } catch {
    return 0;
  }
}

/** Un-feed a folder (hide its assets from agent context). Symmetric opt-out. */
export async function unmarkFolderFedToAgent(folder: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  const folderSeg = sanitizeFolder(folder);
  if (!folderSeg) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_inbox_items")
      .update({ fed_to_agent: false })
      .or(`folder.eq.${folderSeg},folder.like.${folderSeg}/%`)
      .select("id");
    if (error || !Array.isArray(data)) return 0;
    return data.length;
  } catch {
    return 0;
  }
}