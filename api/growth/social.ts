import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { sanitizeFolder } from "../../lib/growth/inbox.js";
import { orderedCarousel, toMediaItems, validatePostMedia, signMediaItem, DEFAULT_MEDIA_URL_TTL_SEC, type InboxMediaRow } from "../../lib/growth/social/media.js";
import { generateCaption } from "../../lib/growth/social/captions.js";
import * as instagram from "../../lib/growth/social/instagram.js";
import * as linkedin from "../../lib/growth/social/linkedin.js";
import type { SocialChannel, SocialPostKind, SocialPostDraft, SocialMediaItem, SocialPublishResult } from "../../lib/growth/social/types.js";
import { canonicalForSlug } from "../../lib/growth/syndication/index.js";

/**
 * /api/growth/social — consolidated admin route for the Inbox→social publishing
 * layer. Admin-only. Follows api/growth/promote.ts + api/growth/inbox.ts exactly:
 * requireAdmin, zod bodies, the { ok, code, error, requestId } JSON contract,
 * supabaseAdmin null → 503, and the never-auto-publish rule (compose creates a
 * PENDING draft; publish requires an APPROVED one — same gate as publish.ts).
 *
 * Actions (via ?action= or body.action, matching inbox.ts's dispatch):
 *   compose  { folder, channel, kind, articleSlug? }
 *              → validate media, order the carousel, generate a caption, insert a
 *                growth_drafts row (kind='instagram'|'linkedin', status='pending')
 *                carrying the SocialPostDraft in schema_json.social.
 *   preview  { draftId }  → the draft + fresh signed media URLs (final order).
 *   dryrun   { draftId }  → the channel client's exact request plan (no API call).
 *   publish  { draftId }  → ONLY for approved drafts: call the channel client,
 *                write a growth_syndication ledger row, mark the draft published,
 *                store the permalink; on partial carousel failure record which
 *                child containers succeeded for idempotent retry.
 *   quota                 → Instagram content_publishing_limit passthrough.
 *
 * VISUALS COME FROM THE INBOX — the model writes only captions/alt text.
 * Server-only. Never touches the chat backend.
 */
export const config = { maxDuration: 300 };

const CHANNELS = ["instagram", "linkedin"] as const;
const KINDS = ["image", "carousel", "video"] as const;

const ComposeBody = z.object({
  folder: z.string().min(1).max(160),
  channel: z.enum(CHANNELS),
  kind: z.enum(KINDS),
  articleSlug: z.string().max(200).optional(),
});
const DraftIdBody = z.object({ draftId: z.string().min(1).max(120) });

function err(res: VercelResponse, status: number, code: string, error: string, requestId: string) {
  return res.status(status).json({ ok: false, code, error, requestId });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);
  if (!supabaseAdmin) return err(res, 503, "SERVER_ERROR", "Supabase not configured.", requestId);

  const action = (typeof req.query?.action === "string" ? req.query.action : undefined) ?? (req.body && typeof req.body === "object" ? (req.body as { action?: string }).action : undefined);

  // ─── quota (GET or POST): Instagram publishing-limit passthrough ───────────
  if (action === "quota") {
    if (!instagram.isInstagramConfigured()) {
      return res.status(200).json({ ok: true, requestId, configured: false, limit: null, note: "IG_USER_ID / META_ACCESS_TOKEN not set" });
    }
    const limit = await instagram.contentPublishingLimit();
    return res.status(200).json({ ok: true, requestId, configured: true, limit });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return err(res, 405, "SERVER_ERROR", "Method not allowed", requestId);
  }

  // ─── compose ───────────────────────────────────────────────────────────────
  if (action === "compose") {
    const parsed = ComposeBody.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "SERVER_ERROR", "Invalid body (need folder, channel, kind).", requestId);
    return compose(res, requestId, parsed.data.folder, parsed.data.channel, parsed.data.kind, parsed.data.articleSlug);
  }

  // ─── preview / dryrun / publish all take { draftId } ────────────────────────
  const parsed = DraftIdBody.safeParse(req.body);
  if (!parsed.success) return err(res, 400, "SERVER_ERROR", "Invalid body (need draftId).", requestId);
  const { draftId } = parsed.data;

  const { data: draft, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,title,status,schema_json")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !draft) return err(res, 404, "NOT_FOUND", "draft not found", requestId);

  const social = readSocial(draft.schema_json);
  if (!social) return err(res, 409, "CONFLICT", `draft ${draftId} is not a social post (no schema_json.social).`, requestId);

  if (action === "preview") return preview(res, requestId, draft, social);
  if (action === "dryrun") return dryrun(res, requestId, social);
  if (action === "publish") return publish(res, requestId, draftId, draft, social);

  return err(res, 400, "SERVER_ERROR", "Unknown action. Use compose|preview|dryrun|publish|quota.", requestId);
}

/** Read the SocialPostDraft off a draft row's schema_json (null when absent). */
function readSocial(schema: unknown): SocialPostDraft | null {
  const s = (schema as { social?: unknown } | null)?.social;
  if (!s || typeof s !== "object") return null;
  const draft = s as SocialPostDraft;
  if (!Array.isArray(draft.media) || !draft.channel || !draft.kind) return null;
  return draft;
}

// ─── compose ───────────────────────────────────────────────────────────────

async function compose(
  res: VercelResponse,
  requestId: string,
  folderRaw: string,
  channel: SocialChannel,
  kind: SocialPostKind,
  articleSlug?: string,
): Promise<VercelResponse> {
  const folder = sanitizeFolder(folderRaw);
  if (!folder) return err(res, 400, "SERVER_ERROR", "Invalid folder.", requestId);

  // 1. Order the folder's media (post_order → created_at). Visuals from the Inbox.
  const rows = await orderedCarousel(folder);
  if (rows.length === 0) return err(res, 409, "CONFLICT", `folder "${folder}" has no image/video items to compose from.`, requestId);

  // For image/video, take the first item; for carousel, take up to 10.
  const selected: InboxMediaRow[] = kind === "carousel" ? rows.slice(0, 10) : rows.slice(0, 1);

  // 2. Validate for the channel (hard errors block; unverified are surfaced).
  const validation = validatePostMedia(selected, channel, kind);
  if (!validation.ok) {
    return res.status(422).json({ ok: false, code: "VALIDATION", error: "media failed channel validation", requestId, validation });
  }

  const media: SocialMediaItem[] = toMediaItems(selected);

  // 3. Generate a caption from the REAL uploaded material (+ optional article).
  const article = articleSlug
    ? { title: articleSlug, url: canonicalForSlug(articleSlug), summary: null, hashtags: null }
    : null;
  const gen = await generateCaption(channel, {
    article,
    inbox: { folder, items: selected.map((r) => ({ name: r.original_name, note: r.alt_text ?? null })) },
  });

  const socialDraft: SocialPostDraft = {
    channel,
    kind,
    caption: gen.caption ?? "",
    firstComment: gen.firstComment,
    media,
    folder,
    articleSlug: articleSlug ?? null,
    status: "draft",
  };

  // 4. Insert a human-gated growth_drafts row (status pending, like every draft).
  const { data: inserted, error: insErr } = await supabaseAdmin!
    .from("growth_drafts")
    .insert({
      kind: channel, // 'instagram' | 'linkedin'
      url: article?.url ?? null,
      title: `${channel} ${kind} — ${folder}`,
      body_md: gen.caption ?? null,
      schema_json: {
        social: socialDraft,
        note: gen.note ?? null,
        validation,
        articleSlug: articleSlug ?? null,
      },
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return err(res, 500, "SERVER_ERROR", `DB insert failed: ${insErr?.message ?? "unknown"}`, requestId);

  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "social-compose", scope: folder, detail: `channel=${channel} kind=${kind} items=${selected.length} draftId=${inserted.id}${gen.caption ? "" : " (caption needs manual write)"}` })
    .then(() => undefined, () => undefined);

  return res.status(201).json({
    ok: true,
    requestId,
    draftId: inserted.id,
    channel,
    kind,
    caption: gen.caption,
    firstComment: gen.firstComment,
    note: gen.note ?? null,
    validation,
    itemCount: selected.length,
  });
}

// ─── preview ─────────────────────────────────────────────────────────────────

async function preview(res: VercelResponse, requestId: string, draft: Record<string, unknown>, social: SocialPostDraft): Promise<VercelResponse> {
  // Fresh signed URLs so the admin UI renders the exact final media order.
  const media = await Promise.all(
    social.media.map(async (m) => ({
      inboxItemId: m.inboxItemId,
      originalName: m.originalName ?? null,
      alt: m.alt,
      kind: m.kind ?? null,
      signedUrl: await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC),
    })),
  );
  return res.status(200).json({
    ok: true,
    requestId,
    draftId: draft.id,
    status: draft.status,
    channel: social.channel,
    kind: social.kind,
    caption: social.caption,
    firstComment: social.firstComment ?? null,
    folder: social.folder ?? null,
    articleSlug: social.articleSlug ?? null,
    media,
  });
}

// ─── dryrun ──────────────────────────────────────────────────────────────────

async function dryrun(res: VercelResponse, requestId: string, social: SocialPostDraft): Promise<VercelResponse> {
  const plan = social.channel === "instagram" ? await instagram.dryRun(social) : await linkedin.dryRun(social);
  return res.status(200).json({ ok: true, requestId, dryRun: plan });
}

// ─── publish ─────────────────────────────────────────────────────────────────

async function publish(
  res: VercelResponse,
  requestId: string,
  draftId: string,
  draft: Record<string, unknown>,
  social: SocialPostDraft,
): Promise<VercelResponse> {
  // Same gate as api/growth/publish.ts: only approved drafts publish.
  if (draft.status !== "approved") {
    return err(res, 409, "CONFLICT", `draft is '${String(draft.status)}' — only approved drafts can be published.`, requestId);
  }
  if (!social.caption || !social.caption.trim()) {
    return err(res, 409, "CONFLICT", "draft has no caption — write one before publishing.", requestId);
  }

  const channel = social.channel;
  // Resume any children created on a prior attempt (idempotent carousel retry).
  const alreadyCreated = readCreatedChildren(draft.schema_json);

  let result: SocialPublishResult;
  if (channel === "instagram") {
    result = await instagram.publishPost(social, { alreadyCreated });
  } else {
    result = await linkedin.publishPost(social);
  }

  // not_configured → 200 with the honest typed result (never an opaque 500).
  if (result.status === "not_configured") {
    await recordLedger(draftId, social, result);
    return res.status(200).json({ ok: false, requestId, code: "NOT_CONFIGURED", result });
  }

  // Persist any successfully-created carousel children for idempotent retry,
  // even on failure — a retry then skips re-creating them (no double media).
  if (result.createdChildren && result.createdChildren.length) {
    await persistCreatedChildren(draftId, draft.schema_json, result.createdChildren);
  }

  if (!result.ok) {
    await recordLedger(draftId, social, result);
    await supabaseAdmin!
      .from("growth_agent_logs")
      .insert({ level: "error", action: "social-publish", scope: channel, detail: `draftId=${draftId} FAILED: ${result.error ?? "unknown"}` })
      .then(() => undefined, () => undefined);
    return res.status(502).json({ ok: false, requestId, code: "PUBLISH_FAILED", result });
  }

  // Success: mark the draft published + write the ledger row + store permalink.
  const { error: upErr } = await supabaseAdmin!
    .from("growth_drafts")
    .update({ status: "published", schema_json: mergePublished(draft.schema_json, social, result) })
    .eq("id", draftId);
  if (upErr) return err(res, 500, "SERVER_ERROR", "DB update failed after publish", requestId);

  await recordLedger(draftId, social, result);
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "social-publish", scope: channel, detail: `draftId=${draftId} permalink=${result.permalink ?? ""} id=${result.platformPostId ?? ""}` })
    .then(() => undefined, () => undefined);

  return res.status(200).json({ ok: true, requestId, result });
}

/** Recover children created on a prior publish attempt (inboxItemId → creationId). */
function readCreatedChildren(schema: unknown): Record<string, string> {
  const raw = (schema as { social_progress?: { createdChildren?: { inboxItemId: string; creationId: string }[] } } | null)?.social_progress?.createdChildren;
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) for (const c of raw) if (c?.inboxItemId && c?.creationId) out[c.inboxItemId] = c.creationId;
  return out;
}

/** Store created children on schema_json.social_progress (merge, best-effort). */
async function persistCreatedChildren(
  draftId: string,
  schema: unknown,
  children: { inboxItemId: string; creationId: string }[],
): Promise<void> {
  const base = (schema as Record<string, unknown> | null) ?? {};
  const merged = { ...base, social_progress: { createdChildren: children, at: new Date().toISOString() } };
  await supabaseAdmin!.from("growth_drafts").update({ schema_json: merged }).eq("id", draftId).then(() => undefined, () => undefined);
}

/** Merge the publish result (permalink + platform id) into schema_json on success. */
function mergePublished(schema: unknown, social: SocialPostDraft, result: SocialPublishResult): Record<string, unknown> {
  const base = (schema as Record<string, unknown> | null) ?? {};
  return {
    ...base,
    social: { ...social, status: "published" },
    social_result: {
      permalink: result.permalink,
      platformPostId: result.platformPostId,
      firstCommentId: result.firstCommentId ?? null,
      at: new Date().toISOString(),
    },
  };
}

/**
 * Write a growth_syndication ledger row (platform='instagram'|'linkedin'). The
 * ledger schema is (draft_id, slug, platform, status, canonical_url, platform_url,
 * platform_post_id, error) — see migration 20260703130000. slug falls back to the
 * folder when the post isn't article-linked (the column is NOT NULL). Best-effort.
 */
async function recordLedger(draftId: string, social: SocialPostDraft, result: SocialPublishResult): Promise<void> {
  const slug = social.articleSlug || social.folder || "social";
  const canonicalUrl = social.articleSlug ? canonicalForSlug(social.articleSlug) : (result.permalink ?? "");
  await supabaseAdmin!
    .from("growth_syndication")
    .insert({
      draft_id: draftId,
      slug,
      platform: social.channel,
      status: result.status,
      canonical_url: canonicalUrl,
      platform_url: result.permalink,
      platform_post_id: result.platformPostId,
      error: result.error,
    })
    .then(() => undefined, () => undefined);
}
