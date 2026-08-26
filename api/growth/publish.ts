import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { seedOutcomeOnPublish } from "../../lib/growth/outcomes.js";
import { insertKnowledge, retrieveForTopic, linkToArticle } from "../../lib/growth/knowledge.js";
import { commitBinary, upsertText, COVER_REPO } from "../../lib/growth/githubWrite.js";
import { logInfo, assertAuthorized, AuthorizationError } from "../../lib/growth/authorization.js";
import { generateCoverDraftFromFields, fetchStyleSample, clearUnpublishedCoverDrafts } from "../../lib/growth/cover.js";
import { sanitizeMermaidFences, type MermaidSanitizeResult } from "../../lib/growth/mermaid-validate.js";
import { stripCitationMarkers } from "../../lib/growth/citations.js";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "../../content/articles.meta.js";
import { slugifyTitle } from "../../lib/growth/articleWriter.js";
import { SITE } from "../../seo.config.js";

/**
 * /api/growth/publish — human-gated publish (admin-only). Kinds:
 *
 *   kind='linkedin' (POST { draftId, mode:'personal'|'company', companyId? })
 *     Does NOT call LinkedIn's API — marks the approved draft published + returns
 *     LinkedIn's OFFICIAL share deep-link prefilled with the article URL. The
 *     founder clicks it (caption placed on the clipboard client-side). Zero
 *     account-ban risk, zero new infra.
 *
 *   kind='article' (POST { draftId, mode:'article' })
 *     Commits content/articles/<slug>.md + inserts the ArticleMeta entry into
 *     content/articles.meta.ts, marks the draft published, then AUTO-SHIPS the
 *     companion cover: if a kind='cover' draft (pending or approved) exists for
 *     the same slug, its PNG + `visual:` edit are committed in the SAME publish so
 *     one click ships article + cover together (the founder's choice). The cover
 *     ships best-effort — the article is already live, so a cover failure is
 *     surfaced in the `cover` field, never rolled back, never fails the publish.
 *     If NO companion cover draft exists, a pending cover is AUTO-DRAFTED (budget
 *     permitting) so the article is never left coverless — surfaced in
 *     `coverDrafted`; the founder still approves + Publish cover (no auto-publish).
 *
 *   kind='cover' (POST { draftId, mode:'cover' })
 *     Commits the approved cover PNG to public/learn-ai-with-reeturaj/<slug>.png
 *     AND edits content/articles.meta.ts to set `visual: '<slug>.png'` on the
 *     matching slug — via the GitHub Contents API. The repo is connected to
 *     Vercel → the commit auto-rebuilds so the new cover ships with no manual
 *     deploy. Also reachable implicitly via kind='article' publish (the companion
 *     bundle above). No growth_outcomes row (its `kind` is CHECK-constrained to
 *     linkedin|inbox-outline, so covers skip outcome seeding).
 *
 *   kind='video-script' (POST { draftId, mode:'video-script' })
 *     Commits content/video-scripts/<slug>.md (reference artifact; no site wiring).
 *
 * The only transition to status='published'. approvals.ts stays approve/reject
 * -only (no publish), preserving the never-auto-publish rule.
 */
const Body = z.object({
  draftId: z.string().min(1).max(120),
  mode: z.enum(["personal", "company", "cover", "article", "video-script"]),
  companyId: z.string().min(1).max(80).optional(),
});

interface CoverSchema {
  pngBase64?: unknown;
  mimeType?: unknown;
  filename?: unknown;
}

interface ArticleSchema {
  slug?: unknown;
  description?: unknown;
  category?: unknown;
  datePublished?: unknown;
  readMinutes?: unknown;
  abstract?: unknown;
  faq?: unknown;
  hashtags?: unknown;
}

interface VideoScriptSchema {
  slug?: unknown;
  durationMinutes?: unknown;
  hook?: unknown;
}

/**
 * Stage 2 deny-by-default guard for the GitHub-committing publish paths (article,
 * cover, video-script). The human-gated publish is the founder acting, but the
 * target must still be an authorized asset before we commit to its repo — so a
 * draft whose URL points at a non-authorized domain can't be committed. We assert
 * `createPR` (NOT `publish`: the guard's `publish` action is "agent auto-publish
 * directly", which is correctly always-denied; the human-gated commit-to-repo flow
 * is a createPR, which inbharat.ai allows). Returns true when allowed; on deny,
 * writes the 403 response and returns false (caller must `return`).
 */
function guardPublishTarget(res: VercelResponse, requestId: string, draftUrl: string | null): boolean {
  const target = draftUrl ?? SITE.url;
  try {
    assertAuthorized("createPR", target);
    return true;
  } catch (e) {
    if (e instanceof AuthorizationError) {
      res.status(403).json({ ok: false, code: "FORBIDDEN", error: `publish target not authorized: ${e.message}`, requestId });
      return false;
    }
    throw e;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
  const { draftId, mode, companyId } = parsed.data;
  if (mode === "company" && !companyId) {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "company mode requires a companyId", requestId });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }

  const { data: draft, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,url,title,body_md,status,schema_json")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !draft) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "draft not found", requestId });
  if (draft.status !== "approved") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft is '${draft.status}' — only approved drafts can be published.`, requestId });
  }

  const kind = String(draft.kind);

  // ─── Cover publish: commit PNG + edit articles.meta.ts to GitHub ───────────
  if (kind === "cover" || mode === "cover") {
    return publishCover(res, requestId, draftId, draft.url, draft.title, draft.schema_json as CoverSchema | null);
  }

  // ─── Article publish (Phase E): commit the markdown + insert the meta entry ─
  if (kind === "article" || mode === "article") {
    return publishArticle(res, requestId, admin.userId, draftId, draft.url, draft.title, draft.body_md as string | null, draft.schema_json as ArticleSchema | null);
  }

  // ─── Video-script publish (Phase E): commit the script markdown (no site wiring)
  if (kind === "video-script" || mode === "video-script") {
    return publishVideoScript(res, requestId, admin.userId, draftId, draft.title, draft.body_md as string | null, draft.schema_json as VideoScriptSchema | null);
  }

  // ─── LinkedIn publish: mark published + return the official share deep-link ─
  // The LinkedIn share flow is ONLY for kind='linkedin' drafts (they carry the
  // article URL to prefill the share link). The cover/article/video-script kinds
  // are routed above; inbox-outline / media-candidate drafts have url=null and no
  // share target, so they must never reach this fallback — guard explicitly so an
  // approved inbox/media draft returns a clear 409 instead of a confusing
  // "draft has no URL to share" from the null check below.
  if (kind !== "linkedin") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `LinkedIn publish is for 'linkedin' drafts (this draft is kind='${kind}' with no share URL). Copy its caption manually instead.`, requestId });
  }
  const articleUrl = draft.url as string | null;
  if (!articleUrl) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft has no URL to share.", requestId });
  }

  const enc = encodeURIComponent(articleUrl);
  // LinkedIn has NO supported URL scheme that pre-fills post TEXT — the
  // undocumented feed/?shareActive=true&text= was unreliable and is exactly why
  // the founder saw "just the link, no post written". The honest, working flow:
  // open the OFFICIAL share composer (sharing/share-offsite) with the article
  // URL → a link card appears, the text area is empty → the FULL post (caption +
  // link) is copied to the clipboard AND shown inline in the Issues banner, so
  // the founder reviews the ready-made post, clicks Open LinkedIn, pastes once,
  // and pushes. Company mode keeps /admin/share/?url= (offsite has no company
  // equivalent). The caption is returned as `summary` for the inline review.
  const shareUrl =
    mode === "company"
      ? `https://www.linkedin.com/company/${encodeURIComponent(companyId!)}/admin/share/?url=${enc}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`;

  // Mark published + audit. NO LinkedIn API call — only our row + a deep-link.
  const { error: upErr } = await supabaseAdmin.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
  // .then(onFulfilled,onRejected) — NOT .catch (Postgrest builders are
  // PromiseLike, .catch throws synchronously after the row is already published).
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-linkedin", scope: articleUrl, detail: `mode=${mode} draftId=${draftId}` })
    .then(() => undefined, () => undefined);

  // Seed the outcome baseline so the daily cron can later measure the article's
  // SEO/GEO delta from this publish point. Publishes nothing; never throws.
  await seedOutcomeOnPublish(draftId, articleUrl, String(draft.kind)).catch(() => undefined);

  // Phase 2: best-effort KB write — record the published LinkedIn post so future
  // caption drafts can retrieve prior post angles (founder-voice consistency,
  // avoid repeating an angle). content_hash dedupes; never throws/blocks.
  void insertKnowledge({
    type: "post",
    title: (draft.title as string | null) ?? articleUrl,
    body: (draft.body_md as string | null) ?? null,
    sourceUrl: articleUrl,
    sourceType: "linkedin",
    topicCluster: (draft.title as string | null) ?? undefined,
    status: "published",
  }).catch(() => undefined);

  return res.status(200).json({ ok: true, requestId, shareUrl, summary: (draft.body_md as string | null) ?? "", title: (draft.title as string | null) ?? "" });
}

/**
 * Commit an approved/ready cover to GitHub (PNG + articles.meta.ts `visual:` edit),
 * mark the draft published, and audit-log it. Pure side-effecting helper — does NOT
 * write to the response, does NOT check the draft's status (the caller decides the
 * gate). Used by both the explicit kind='cover' publish (gated on status='approved'
 * at the handler top) and the article-bundle path (the founder's article-publish
 * click is the gate for the whole package, so a pending companion cover ships too).
 *
 * Returns a rich result so callers can map to the right HTTP status / fold into
 * their own response. On a missing/insufficient GITHUB_TOKEN, `needsToken` is set.
 */
type CoverShipResult =
  | { ok: true; filename: string; fileUrl: string; pngCommitSha?: string; metaCommitSha?: string }
  | { ok: false; code: "CONFLICT" | "BAD_FILENAME" | "PRECONDITION_FAILED" | "SERVER_ERROR"; error: string; pngCommitSha?: string; metaCommitSha?: string; needsToken?: boolean };

async function shipCoverToGitHub(
  draftId: string,
  draftUrl: string | null,
  schemaJson: CoverSchema | null,
  /** Optional reviewer tag for auto-approval audit rows (default: manual cover publish). */
  reviewerTag: string = "manual",
): Promise<CoverShipResult> {
  const pngBase64 = typeof schemaJson?.pngBase64 === "string" ? schemaJson.pngBase64 : null;
  const filename = typeof schemaJson?.filename === "string" ? schemaJson.filename : null;
  if (!pngBase64 || !filename) {
    return { ok: false, code: "CONFLICT", error: "cover draft has no image payload (pngBase64/filename missing from schema_json)." };
  }
  // Sanity: filename must be <slug>.png — defend against a path-traversal in schema_json.
  if (!/^[a-z0-9-]+\.png$/i.test(filename)) {
    return { ok: false, code: "BAD_FILENAME", error: `invalid cover filename "${filename}" (expected <slug>.png)` };
  }

  const filePath = `public/learn-ai-with-reeturaj/${filename}`;
  const metaPath = "content/articles.meta.ts";
  const slug = filename.replace(/\.png$/i, "");

  // 1) Commit the PNG.
  const pngRes = await commitBinary(filePath, pngBase64, `cover: add ${filename} (Growth Agent, human-gated)`);
  if (!pngRes.ok) {
    await logInfo("publish-cover-fail-png", draftUrl ?? filename, pngRes.error || "commit failed").catch(() => undefined);
    if (pngRes.needsToken) {
      return { ok: false, code: "PRECONDITION_FAILED", error: `GitHub token cannot push to ${COVER_REPO}: ${pngRes.error}. Set GITHUB_TOKEN (contents:write) in Vercel env.`, needsToken: true };
    }
    return { ok: false, code: "SERVER_ERROR", error: `cover PNG commit failed: ${pngRes.error}` };
  }

  // 2) Edit articles.meta.ts: set `visual: '<filename>'` on the matching slug's entry.
  const metaRes = await upsertText(metaPath, (current) => insertVisualField(current, slug, filename), `cover: set visual for ${slug} (Growth Agent, human-gated)`);
  if (!metaRes.ok && !metaRes.skipped) {
    await logInfo("publish-cover-fail-meta", metaPath, metaRes.error || "edit failed").catch(() => undefined);
    // PNG committed but the meta edit failed — the cover file exists but the article
    // won't reference it until the meta edit lands. Surface it (re-run is safe; PNG is idempotent).
    return { ok: false, code: "SERVER_ERROR", error: `cover PNG committed (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but articles.meta.ts edit failed: ${metaRes.error}. Re-run publish to wire the visual.`, pngCommitSha: pngRes.commitSha };
  }
  if (metaRes.skipped && metaRes.raw && !articleMetaEntryExists(metaRes.raw, slug)) {
    // The visual edit was a no-op because the article's meta entry isn't in the
    // repo yet — the cover was published BEFORE the article. The PNG is committed
    // but nothing references it, so the cover won't render until the article lands.
    // This is the silent-failure race that left the multilingual article coverless:
    // shipCoverToGitHub used to return ok:true with an unwired visual. Surface it
    // honestly (re-run is safe — PNG commit is idempotent; publishing the article
    // also has a backstop that wires this visual, so either order recovers).
    await logInfo("publish-cover-meta-missing", metaPath, `slug ${slug} not in articles.meta.ts yet — cover PNG committed but visual not wired`).catch(() => undefined);
    return { ok: false, code: "CONFLICT", error: `cover PNG committed (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but the article meta for "${slug}" is not in articles.meta.ts yet — publish the article first (its backstop will wire this cover's visual), or re-run cover publish once the article is live. The cover won't render until the visual is wired.`, pngCommitSha: pngRes.commitSha };
  }

  // 3) Mark the draft published + audit (auto-approval row if shipped via article publish).
  const { error: upErr } = await supabaseAdmin!.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) {
    await logInfo("publish-cover-db-fail", draftUrl ?? filename, upErr.message).catch(() => undefined);
    return { ok: false, code: "SERVER_ERROR", error: `cover committed to GitHub (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but DB status update failed: ${upErr.message}`, pngCommitSha: pngRes.commitSha, metaCommitSha: metaRes.commitSha };
  }
  if (reviewerTag !== "manual" && reviewerTag) {
    await supabaseAdmin!
      .from("growth_approvals")
      .insert({
        draft_id: draftId,
        reviewer: reviewerTag,
        decision: "approved",
        note: `auto-approved + auto-published as companion cover for article ${slug}`,
      })
      .then(() => undefined, () => undefined);
  }
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-cover", scope: draftUrl ?? filename, detail: `file=${filePath} pngSha=${pngRes.commitSha ?? ""} metaSha=${metaRes.commitSha ?? ""} draftId=${draftId} reviewer=${reviewerTag}` })
    .then(() => undefined, () => undefined);

  const fileUrl = `https://inbharat.ai/learn-ai-with-reeturaj/${filename}`;
  return { ok: true, filename, fileUrl, pngCommitSha: pngRes.commitSha, metaCommitSha: metaRes.commitSha };
}

/** Map a CoverShipResult to the explicit kind='cover' publish HTTP response. */
function respondCoverShip(res: VercelResponse, requestId: string, r: CoverShipResult, draftTitle: string | null): VercelResponse {
  if (r.ok) {
    return res.status(200).json({ ok: true, requestId, kind: "cover", filename: r.filename, fileUrl: r.fileUrl, pngCommitSha: r.pngCommitSha, metaCommitSha: r.metaCommitSha, title: draftTitle ?? null });
  }
  if (r.code === "CONFLICT") return res.status(409).json({ ok: false, code: "CONFLICT", error: r.error, requestId });
  if (r.code === "BAD_FILENAME") return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: r.error, requestId });
  if (r.code === "PRECONDITION_FAILED") return res.status(412).json({ ok: false, code: "PRECONDITION_FAILED", error: r.error, requestId });
  return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: r.error, requestId, pngCommitSha: r.pngCommitSha, metaCommitSha: r.metaCommitSha });
}

/**
 * Cover publish: ship the approved cover draft to GitHub. The status='approved'
 * gate is enforced at the handler top (line 84) before this is reached. Delegates
 * to shipCoverToGitHub so the commit logic is shared with the article-bundle path.
 */
async function publishCover(
  res: VercelResponse,
  requestId: string,
  draftId: string,
  draftUrl: string | null,
  draftTitle: string | null,
  schemaJson: CoverSchema | null,
): Promise<VercelResponse> {
  if (!guardPublishTarget(res, requestId, draftUrl)) return res;
  const r = await shipCoverToGitHub(draftId, draftUrl, schemaJson);
  return respondCoverShip(res, requestId, r, draftTitle);
}

/**
 * Find the most recent APPROVED companion cover draft for a just-published article
 * slug and ship it to GitHub (PNG + visual edit + mark published). Stage 2 integrity
 * fix: only an APPROVED cover ships — a PENDING cover has not been reviewed, so
 * auto-publishing it with the article would bypass the never-auto-publish rule. The
 * founder approves + Publishes the cover separately (the cover has its own Publish
 * button in Issues). Best-effort: a cover failure never rolls back or fails the
 * article publish (the article is already live); the outcome is returned so
 * publishArticle can surface it.
 *
 * Returns null when there is no APPROVED companion cover draft for the slug (a
 * pending one may still exist — publishArticle surfaces that so the founder knows
 * to approve it).
 */
async function shipCompanionCover(slug: string): Promise<{ draftId: string; result: CoverShipResult } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,url,title,schema_json,created_at")
      .eq("kind", "cover")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    const want = `${slug}.png`;
    const row = (data as Array<{ id: string; url: string | null; title: string | null; schema_json: CoverSchema | null; created_at: string }>)
      .find((r) => typeof r.schema_json?.filename === "string" && r.schema_json.filename === want);
    if (!row) return null;
    const result = await shipCoverToGitHub(row.id, row.url, row.schema_json);
    return { draftId: row.id, result };
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup: has a cover PNG for this slug already been SHIPPED to the repo
 * (a kind='cover' draft in status='published' with filename `<slug>.png`)? This is
 * the cover-published-BEFORE-the-article race: the cover's `set visual` step no-op'd
 * because the article meta wasn't in the repo yet, so the PNG is committed but no
 * `visual:` field references it. publishArticle's backstop calls this to wire that
 * dangling visual once the article meta lands — making the article+cover push order
 * independent (the cover never silently fails to deploy when pushed together).
 * Returns the cover filename to wire, or null.
 */
async function findShippedCoverForSlug(slug: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,schema_json")
      .eq("kind", "cover")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    const want = `${slug}.png`;
    const row = (data as Array<{ id: string; schema_json: CoverSchema | null }>)
      .find((r) => typeof r.schema_json?.filename === "string" && r.schema_json.filename === want);
    const fn = row?.schema_json?.filename;
    return typeof fn === "string" ? fn : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup: does a PENDING (not yet approved) companion cover draft exist
 * for this slug? Used to surface "a cover is waiting for your approval" in the
 * article-publish response so the founder knows to approve + Publish cover —
 * instead of the old behavior where the pending cover silently auto-shipped.
 */

/** Stale threshold in milliseconds (24h). Pending/rejected covers older than this
 *  are considered stale and regenerated at article publish time. */
export const STALE_COVER_MS = 24 * 60 * 60 * 1000;

/** Minimal row shape used by the pure cover-draft selectors below. */
export interface CoverDraftSelectorRow {
  id: string;
  status: "pending" | "approved" | "rejected" | "published";
  schema_json: { filename?: string } | null;
  created_at: string;
}

/**
 * Pure selector: find a stale pending or rejected companion cover for the slug.
 * Returns the most recent matching row whose filename is `<slug>.png` and whose
 * created_at is older than `now - staleMs`. Published and approved rows are never
 * stale — published rows are already shipped, approved rows are handled by
 * shipCompanionCover.
 */
export function selectStaleCompanionCover(
  rows: CoverDraftSelectorRow[],
  slug: string,
  now: number,
  staleMs: number = STALE_COVER_MS,
): CoverDraftSelectorRow | null {
  const want = `${slug}.png`;
  const cutoff = now - staleMs;
  const allowedStatuses = new Set<typeof rows[number]["status"]>(["pending", "rejected"]);
  return rows
    .filter((r) => allowedStatuses.has(r.status) && typeof r.schema_json?.filename === "string" && r.schema_json.filename === want)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .find((r) => new Date(r.created_at).getTime() <= cutoff) ?? null;
}

/**
 * Pure selector: find the most recent fresh pending companion cover for the slug.
 * Returns null if the only pending cover is stale (those are regenerated and
 * auto-shipped) or if no pending cover exists.
 */
export function selectFreshPendingCover(
  rows: CoverDraftSelectorRow[],
  slug: string,
  now: number,
  staleMs: number = STALE_COVER_MS,
): { id: string; created_at: string } | null {
  const want = `${slug}.png`;
  const cutoff = now - staleMs;
  const row = rows
    .filter((r) => r.status === "pending" && typeof r.schema_json?.filename === "string" && r.schema_json.filename === want)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .find((r) => new Date(r.created_at).getTime() > cutoff);
  return row ? { id: row.id, created_at: row.created_at } : null;
}

/**
 * Find a stale pending or rejected companion cover for the slug. Returns the row
 * if one exists and is older than STALE_COVER_MS, otherwise null.
 */
async function findStaleCompanionCover(slug: string): Promise<{ id: string; url: string | null; schema_json: CoverSchema | null; created_at: string } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,url,schema_json,created_at")
      .eq("kind", "cover")
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    return selectStaleCompanionCover(data as CoverDraftSelectorRow[], slug, Date.now()) as { id: string; url: string | null; schema_json: CoverSchema | null; created_at: string } | null;
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup: does a PENDING (not yet approved) companion cover draft exist
 * for this slug? Used to surface "a cover is waiting for your approval" in the
 * article-publish response so the founder knows to approve + Publish cover —
 * instead of the old behavior where the pending cover silently auto-shipped.
 * Excludes stale covers (those are regenerated and auto-shipped).
 */
async function findPendingCompanionCover(slug: string): Promise<{ id: string; created_at: string } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,schema_json,created_at")
      .eq("kind", "cover")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    return selectFreshPendingCover(data as CoverDraftSelectorRow[], slug, Date.now());
  } catch {
    return null;
  }
}

/**
 * Scoped edit of articles.meta.ts: find the article entry whose `slug: '<slug>'`
 * line we're targeting, then insert `visual: '<filename>',` right after the
 * `readMinutes: <n>,` line (the visual field belongs there per the file's
 * convention). If a `visual:` field already exists ANYWHERE in that entry, return
 * null (no-op) — this is the idempotency guard that prevents a duplicate `visual:`
 * line when the cover is shipped twice for the same slug (e.g. once via the
 * article-bundle companion path and once via an explicit "Publish cover" click).
 * Returns the edited text, or null when no change is needed / the slug can't be
 * safely located.
 */
export function insertVisualField(source: string, slug: string, filename: string): string | null {
  // Match the WHOLE article entry: from `slug: '<slug>',` through the entry's
  // closing `  },` line. Non-greedy so it stops at THIS entry's close (the faq
  // array closes with `]`, not `  },`, so the first `\n  },` is the entry close).
  const entryRe = new RegExp(
    `(slug:\\s*['"]${escapeRe(slug)}['"]\\s*,[\\s\\S]*?readMinutes:\\s*\\d+\\s*,)([\\s\\S]*?\\n  \\},)`,
    "m",
  );
  const m = source.match(entryRe);
  if (!m) return null; // slug not found → don't touch the file
  const head = m[1]; // slug ... readMinutes: <n>,
  const tail = m[2]; // rest of the entry through `  },`
  // Idempotency: if a visual field already exists anywhere in this entry, no-op.
  // (The previous version only checked between slug and readMinutes, but the
  // visual is inserted AFTER readMinutes — so a re-run never saw the existing
  // visual and inserted a second one, producing a duplicate `visual:` line.)
  if (/visual\s*:\s*['"]/.test(head + tail)) return null;
  const insertion = `\n    visual: '${filename}',`;
  return source.replace(entryRe, `${head}${insertion}${tail}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure probe: does an article entry with `slug: '<slug>'` exist in the meta file
 * source? Used by shipCoverToGitHub to tell the two null-return cases of
 * insertVisualField apart:
 *   - slug NOT present → the article hasn't been published yet (the cover was
 *     shipped before the article meta landed). This is the silent-failure race:
 *     the cover PNG is in the repo but nothing references it. Must surface an
 *     error so the founder knows to publish the article (whose backstop will then
 *     wire the visual) or re-run the cover once the article is live.
 *   - slug IS present but insertVisualField returned null → a `visual:` field is
 *     already set on the entry (idempotent no-op). Benign — the cover is wired.
 *
 * Pure + hermetically testable (mirrors insertVisualField's slug-line match).
 */
export function articleMetaEntryExists(source: string, slug: string): boolean {
  return new RegExp(`slug:\\s*['"]${escapeRe(slug)}['"]`).test(source);
}

// ─── Phase E: article + video-script publish ─────────────────────────────────

/** Validate / coerce a draft's article meta from schema_json. Returns null when
 *  the draft can't be published (missing body, bad slug, bad category). */
function readArticleMeta(title: string | null, bodyMd: string | null, schema: ArticleSchema | null): {
  slug: string; title: string; description: string; category: ArticleCategory;
  datePublished: string; readMinutes: number; abstract: string;
  faq: { q: string; a: string }[]; hashtags: string[];
} | null {
  const slug = typeof schema?.slug === "string" ? schema.slug.trim() : "";
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const body = typeof bodyMd === "string" ? bodyMd.trim() : "";
  if (!body) return null;
  const t = (typeof title === "string" ? title.trim() : "") || "Untitled article";
  const description = typeof schema?.description === "string" ? schema.description.slice(0, 160) : "";
  const abstract = typeof schema?.abstract === "string" ? schema.abstract : "";
  const rawCat = typeof schema?.category === "string" ? schema.category : "";
  const category = (ARTICLE_CATEGORIES as readonly string[]).includes(rawCat) ? (rawCat as ArticleCategory) : "AI Foundations";
  const datePublished = typeof schema?.datePublished === "string" && /^\d{4}-\d{2}-\d{2}$/.test(schema.datePublished) ? schema.datePublished : new Date().toISOString().slice(0, 10);
  const readMinutes = typeof schema?.readMinutes === "number" && schema.readMinutes > 0 ? Math.min(60, Math.round(schema.readMinutes)) : 5;
  const faq = Array.isArray(schema?.faq)
    ? (schema.faq as Array<Record<string, unknown>>).filter((f) => typeof f?.q === "string" && typeof f?.a === "string").map((f) => ({ q: String(f.q), a: String(f.a) }))
    : [];
  const hashtags = Array.isArray(schema?.hashtags) ? (schema.hashtags as unknown[]).filter((h) => typeof h === "string").map(String) : [];
  return { slug, title: t, description, category, datePublished, readMinutes, abstract, faq, hashtags };
}

/** Build a single-quoted TS object literal for one ArticleMeta entry, matching
 *  the file's 2-space indent + field-order convention. Pure + testable. */
export function formatArticleEntry(m: {
  slug: string; title: string; description: string; category: ArticleCategory;
  datePublished: string; readMinutes: number; abstract: string;
  faq: { q: string; a: string }[]; hashtags: string[];
}): string {
  const q = (s: string): string => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  const faqStr = m.faq.length === 0
    ? "[]"
    : "[\n" + m.faq.map((f) => `      { q: ${q(f.q)}, a: ${q(f.a)} },`).join("\n") + "\n    ]";
  const hashtagsStr = m.hashtags.length === 0 ? "[]" : "[" + m.hashtags.map(q).join(", ") + "]";
  return [
    "  {",
    `    slug: ${q(m.slug)},`,
    `    title: ${q(m.title)},`,
    `    description: ${q(m.description)},`,
    `    category: ${q(m.category)},`,
    `    datePublished: ${q(m.datePublished)},`,
    `    readMinutes: ${m.readMinutes},`,
    `    abstract: ${q(m.abstract)},`,
    `    faq: ${faqStr},`,
    `    hashtags: ${hashtagsStr},`,
    "  },",
  ].join("\n");
}

/**
 * Scoped insert of a NEW ArticleMeta entry into articles.meta.ts: place it just
 * before the `];` that closes the ARTICLES array (the one immediately followed by
 * `export function getArticleBySlug`). Idempotent — returns null if the slug is
 * already present, so re-publishing a published article only re-commits the
 * markdown (no duplicate meta entry). Returns the edited text or null when the
 * marker can't be safely located. Pure + hermetically testable.
 */
export function insertArticleMeta(source: string, slug: string, entryText: string): string | null {
  const slugRe = new RegExp(`slug:\\s*['"]${escapeRe(slug)}['"]`);
  if (slugRe.test(source)) return null; // already present → no-op
  const marker = "\n];\n\nexport function getArticleBySlug";
  if (!source.includes(marker)) return null; // can't safely locate the array close
  return source.replace(marker, `\n${entryText}\n];\n\nexport function getArticleBySlug`);
}

/**
 * Scoped edit of content/build-with-reeturaj-calendar.ts: retire the calendar
 * entry whose `topic:` slugifies to `slug` by replacing its `{ ... },` block with
 * a NOTE comment (matching the file's existing retirement convention). This is
 * the automation for the step that used to be done by hand every time an article
 * shipped — without it, the calendar keeps a topic whose slug now equals a
 * published slug, scripts/test-growth.ts "no calendar topic slug-collides with a
 * published slug" trips on the next push, and pickNextCalendarTopic skips it every
 * morning anyway (so the entry is dead weight).
 *
 * Idempotent: once retired (block replaced by a `// NOTE:` comment), the entry no
 * longer matches the `{ ... },` block regex, so a re-publish returns null (no-op).
 * Returns the edited text, or null when no calendar topic slugifies to `slug`
 * (e.g. a free-plan article not on the calendar — nothing to retire). Pure +
 * hermetically testable.
 */
export function retireCalendarTopic(source: string, slug: string, articleTitle: string | null): string | null {
  // Match each calendar entry block: a 2-space-indented `{ ... },` object. The
  // file interleaves `// NOTE:` comments between entries — those are not `{`
  // blocks so they don't match. Non-greedy `[\s\S]*?` stops at this entry's close.
  const blockRe = /\n {2}\{\s*\n[\s\S]*?\n {2}\},/g;
  let found = false;
  const next = source.replace(blockRe, (block) => {
    const topicMatch = block.match(/topic:\s*['"]([^'"]+)['"]/);
    if (!topicMatch) return block;
    if (slugifyTitle(topicMatch[1]) !== slug) return block;
    found = true;
    const titleSuffix = articleTitle ? ` ("${articleTitle}")` : "";
    return [
      `\n  // NOTE: "${topicMatch[1]}" was auto-retired by publishArticle because it`,
      `  // shipped as the article of slug ${slug}${titleSuffix}. Now that the slug is`,
      `  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts`,
      `  // would trip, and pickNextCalendarTopic skips it every morning anyway — so`,
      `  // it is removed. (Replenish this slot with a distinct, non-colliding topic`,
      `  // to keep the calendar ≥17 live entries.)`,
    ].join("\n");
  });
  return found ? next : null;
}

/**
 * Article publish (Phase E): commit content/articles/<slug>.md (markdown body) +
 * insert the ArticleMeta entry into content/articles.meta.ts, then mark the draft
 * published. Vercel auto-rebuilds so the article ships live on inbharat.ai. The
 * markdown commit uses commitBinary (create-or-update, handles new files); the
 * meta edit uses upsertText with the scoped insertArticleMeta transform.
 */
async function publishArticle(
  res: VercelResponse,
  requestId: string,
  userId: string,
  draftId: string,
  draftUrl: string | null,
  draftTitle: string | null,
  bodyMd: string | null,
  schema: ArticleSchema | null,
): Promise<VercelResponse> {
  // Stage 2 deny-by-default: the publish target must be an authorized asset before
  // we commit to its repo. (createPR, not publish — see guardPublishTarget.)
  if (!guardPublishTarget(res, requestId, draftUrl)) return res;

  const meta = readArticleMeta(draftTitle, bodyMd, schema);
  if (!meta) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "article draft is missing a valid slug/body (schema_json.slug + body_md required).", requestId });
  }

  // Stage 2 mermaid dry-run: parse every ```mermaid fence with the real parser before
  // committing. A broken diagram would render as an error box on inbharat.ai. Rather
  // than block the WHOLE article publish on one bad fence (the founder's prose is
  // still valuable + the founder can't easily edit mermaid in the Issues UI), strip
  // the unparseable fence(s) from the committed body, log it, and proceed — the
  // article ships without the broken diagram, and `mermaidStripped` in the response
  // tells the founder what was dropped (so they can re-draft the diagram if they want
  // it). Skipped (graceful) only if mermaid can't load in the runtime — never blocks a
  // publish because the validator itself failed. The draft path also sanitizes, so
  // this is the backstop for drafts that pre-date the draft-time fix or were edited.
  const mermaidSanitize: MermaidSanitizeResult = await sanitizeMermaidFences(bodyMd ?? "");
  if (mermaidSanitize.skipped) {
    await logInfo("publish-article-mermaid-skip", meta.slug, mermaidSanitize.skipReason ?? "unknown").catch(() => undefined);
  }
  if (mermaidSanitize.stripped.length > 0) {
    await logInfo("publish-article-mermaid-stripped", meta.slug, `${mermaidSanitize.stripped.length} broken fence(s) stripped before commit: ${mermaidSanitize.stripped.map((e) => `#${e.fenceIndex}`).join(",")}`).catch(() => undefined);
  }
  const bodyToCommit = stripCitationMarkers(mermaidSanitize.cleaned);

  const mdPath = `content/articles/${meta.slug}.md`;
  const metaPath = "content/articles.meta.ts";

  // 1) Commit the markdown body (create-or-update; base64 = correct utf8 on decode).
  //    bodyToCommit has any unparseable mermaid fences stripped (see above).
  const mdBase64 = Buffer.from(bodyToCommit, "utf-8").toString("base64");
  const mdRes = await commitBinary(mdPath, mdBase64, `article: add ${meta.slug} (Growth Agent, human-gated)`);
  if (!mdRes.ok) {
    await logInfo("publish-article-fail-md", mdPath, mdRes.error || "commit failed").catch(() => undefined);
    if (mdRes.needsToken) {
      return res.status(412).json({ ok: false, code: "PRECONDITION_FAILED", error: `GitHub token cannot push to ${COVER_REPO}: ${mdRes.error}. Set GITHUB_TOKEN (contents:write) in Vercel env.`, requestId });
    }
    return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: `article markdown commit failed: ${mdRes.error}`, requestId });
  }

  // 2) Insert the ArticleMeta entry (idempotent — no-op if slug already present).
  const metaRes = await upsertText(metaPath, (current) => insertArticleMeta(current, meta.slug, formatArticleEntry(meta)), `article: add meta for ${meta.slug} (Growth Agent, human-gated)`);
  if (!metaRes.ok && !metaRes.skipped) {
    await logInfo("publish-article-fail-meta", metaPath, metaRes.error || "edit failed").catch(() => undefined);
    // Markdown committed but meta not wired → the .md exists but the hub won't list it until the meta edit lands.
    return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: `article markdown committed (sha ${mdRes.commitSha?.slice(0, 7) ?? "?"}) but articles.meta.ts edit failed: ${metaRes.error}. Re-run publish to wire the meta entry.`, requestId, mdCommitSha: mdRes.commitSha });
  }

  // 3) Mark the draft published + audit.
  const { error: upErr } = await supabaseAdmin!.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) {
    await logInfo("publish-article-db-fail", meta.slug, upErr.message).catch(() => undefined);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `article committed to GitHub (sha ${mdRes.commitSha?.slice(0, 7) ?? "?"}) but DB status update failed: ${upErr.message}`, requestId, mdCommitSha: mdRes.commitSha, metaCommitSha: metaRes.commitSha });
  }
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-article", scope: draftUrl ?? meta.slug, detail: `md=${mdPath} mdSha=${mdRes.commitSha ?? ""} metaSha=${metaRes.commitSha ?? ""} draftId=${draftId} by=${userId}` })
    .then(() => undefined, () => undefined);

  // 2b) Auto-retire the matching calendar topic. The article just landed in
  //     articles.meta.ts, so any calendar entry whose topic slugifies to meta.slug
  //     is now a collision that trips scripts/test-growth.ts on the next push (and
  //     pickNextCalendarTopic skips it every morning anyway). This used to be a
  //     manual whack-a-mole edit after every publish; automating it keeps CI green
  //     without founder effort. Best-effort, non-fatal: the article is already
  //     live, so a calendar-edit failure is surfaced in `calendarRetire` (never
  //     rolls back, never fails the publish) — the founder can re-run publish to
  //     retire it, or retire by hand. Idempotent (retireCalendarTopic no-ops once
  //     the entry is already a NOTE). Skipped silently for free-plan articles not
  //     on the calendar (no matching topic → nothing to retire).
  let calendarRetire: { ok: boolean; commitSha?: string; skipped?: boolean; error?: string } | null = null;
  const calRes = await upsertText(
    "content/build-with-reeturaj-calendar.ts",
    (current) => retireCalendarTopic(current, meta.slug, meta.title),
    `calendar: retire ${meta.slug} (shipped as article) (Growth Agent, human-gated)`,
  );
  if (!calRes.ok && !calRes.skipped) {
    await logInfo("publish-article-calendar-retire-fail", meta.slug, calRes.error || "edit failed").catch(() => undefined);
    calendarRetire = { ok: false, error: calRes.error };
  } else {
    calendarRetire = { ok: true, commitSha: calRes.commitSha, skipped: calRes.skipped };
  }

  // Phase 2: best-effort KB writes — (a) record this article as a KB 'article'
  // row so future drafts retrieve it as prior work (cross-source dedupe), and
  // (b) link any related discovered topics/sources to this slug. Never throws.
  void insertKnowledge({
    type: "article",
    title: meta.title,
    summary: meta.description || meta.abstract || null,
    sourceUrl: draftUrl ?? `https://inbharat.ai/learn-ai-with-reeturaj/${meta.slug}`,
    sourceType: "website",
    topicCluster: meta.title,
    keywords: meta.hashtags,
    linkedArticleId: meta.slug,
    status: "published",
  }).catch(() => undefined);
  void (async () => {
    try {
      const related = await retrieveForTopic(`${meta.title} ${meta.description}`.trim());
      for (const it of related.slice(0, 6)) {
        if (it.type === "topic" || it.type === "source") {
          await linkToArticle(it.id, meta.slug).catch(() => null);
        }
      }
    } catch {
      /* best-effort */
    }
  })();

  // 4) Auto-ship the APPROVED companion cover with the article (Stage 2: only an
  //    approved cover ships — a pending one has not been reviewed and must not be
  //    auto-published). The article is already live at this point, so a cover
  //    failure is NON-fATAL — we surface it in the `cover` field instead of failing
  //    the publish. The cover's `visual:` edit runs AFTER the article meta insert
  //    above so insertVisualField can find the freshly-added slug entry.
  const companion = await shipCompanionCover(meta.slug);
  const cover = companion
    ? companion.result.ok
      ? { ok: true, draftId: companion.draftId, filename: companion.result.filename, fileUrl: companion.result.fileUrl, pngCommitSha: companion.result.pngCommitSha, metaCommitSha: companion.result.metaCommitSha }
      : { ok: false, draftId: companion.draftId, error: companion.result.error, needsToken: (companion.result as { needsToken?: boolean }).needsToken ?? false }
    : null;

  // 5) If NO APPROVED companion cover shipped, handle pending/rejected covers.
  //    A STALE pending/rejected cover (>24h old) is regenerated into a fresh cover,
  //    auto-approved, and shipped in the same article publish so old articles don't
  //    go live coverless. A fresh pending cover is left for human review.
  //    If no cover draft exists at all, auto-DRAFT a pending cover so the founder can
  //    approve + Publish cover. Best-effort, budget/config-gated, never fails the
  //    article publish.
  let coverDrafted: { draftId: string | null; note: string } | null = null;
  let pendingCover: { id: string; created_at: string } | null = null;
  let coverRegenerated: { ok: boolean; draftId?: string; filename?: string; fileUrl?: string; pngCommitSha?: string; metaCommitSha?: string; error?: string; needsToken?: boolean } | null = null;
  if (!companion) {
    // First, try to ship a stale cover (regenerate + auto-approve + publish).
    const stale = await findStaleCompanionCover(meta.slug);
    if (stale) {
      coverRegenerated = await regenerateAndAutoShipCover(meta.slug, stale.id, stale.url);
    }

    // If we didn't regenerate/ship, see if a fresh pending cover is waiting.
    if (!coverRegenerated?.ok) {
      pendingCover = await findPendingCompanionCover(meta.slug);
      if (!pendingCover) {
        // No companion cover of any kind — create a pending draft for the founder.
        try {
          const drafted = await generateCoverDraftFromFields({
            slug: meta.slug,
            title: meta.title,
            category: meta.category,
            abstract: meta.abstract,
          });
          if (drafted.status === "pending" && drafted.draftId) {
            coverDrafted = { draftId: drafted.draftId, note: "cover draft created — approve it in Issues, then Publish cover" };
            await logInfo("publish-article-cover-drafted", meta.slug, `auto-drafted companion cover ${drafted.filename} (draftId=${drafted.draftId})`).catch(() => undefined);
          }
        } catch {
          // Never let a cover-drafting failure fail the article publish.
        }
      } else {
        await logInfo("publish-article-cover-pending", meta.slug, `companion cover ${pendingCover.id} awaiting approval (not auto-shipped)`).catch(() => undefined);
      }
    }
  }

  // 6) Cover-wire BACKSTOP — makes the article + cover push order-independent.
  //    The companion step (4) only ships an APPROVED cover, so it MISSES a cover
  //    that was already PUBLISHED before this article (the cover's own `set visual`
  //    step no-op'd because this article's meta wasn't in the repo yet — the silent
  //    race that left the multilingual article coverless: PNG committed, never
  //    referenced). The article meta was just inserted in step 2, so insertVisualField
  //    will now find the slug and wire the visual onto it. Idempotent (no-op if the
  //    companion step or regenerated cover already set it) and best-effort — never
  //    fails the article publish (the article is already live); surfaced in
  //    `coverBackstop`. Skipped when coverRegenerated already wired the visual.
  let coverBackstop: { ok: boolean; wired?: boolean; commitSha?: string; skipped?: boolean; error?: string } | null = null;
  if (!companion && !coverRegenerated?.ok) {
    const shippedFilename = await findShippedCoverForSlug(meta.slug);
    if (shippedFilename) {
      const br = await upsertText(
        metaPath,
        (current) => insertVisualField(current, meta.slug, shippedFilename),
        `cover: set visual for ${meta.slug} (Growth Agent, human-gated)`,
      );
      if (!br.ok && !br.skipped) {
        await logInfo("publish-article-cover-backstop-fail", meta.slug, br.error || "edit failed").catch(() => undefined);
        coverBackstop = { ok: false, error: br.error };
      } else {
        coverBackstop = { ok: true, wired: !br.skipped, commitSha: br.commitSha, skipped: br.skipped };
      }
    }
  }

  const fileUrl = `https://inbharat.ai/learn-ai-with-reeturaj/${meta.slug}`;
  return res.status(200).json({
    ok: true, requestId, kind: "article", slug: meta.slug, title: meta.title,
    fileUrl, mdCommitSha: mdRes.commitSha, metaCommitSha: metaRes.commitSha,
    cover, coverDrafted,
    // Fresh pending cover waiting for human approval (non-stale). Kept for UI parity.
    pendingCoverId: pendingCover?.id ?? null,
    // Outcome of stale-cover regeneration + auto-ship. Present only when a stale
    // pending/rejected cover was found, regenerated, and (on ok:true) shipped.
    coverRegenerated,
    // Outcome of the cover-wire backstop (step 6). null = no already-shipped cover
    // found for this slug (companion step or regenerated cover handled it, or the
    // article is coverless). ok:true + wired:true = a cover published before the
    // article got its visual wired now (the race recovered). ok:true + skipped:true
    // = visual was already set (idempotent). ok:false = the meta edit failed
    // (article still live); re-run publish or the cover stays unreferenced.
    coverBackstop,
    // Outcome of the auto calendar-retire (step 2b). ok:true + skipped:true = no
    // calendar topic matched this slug (free-plan article) → nothing retired.
    // ok:true + skipped:false = a topic was retired + committed. ok:false = the
    // calendar edit failed (article still live); re-run publish or retire by hand
    // or the next CI push trips the slug-collision guard.
    calendarRetire,
    // Present only when one or more broken mermaid fences were stripped before commit
    // (so the UI can tell the founder a diagram was dropped — re-draft it if wanted).
    mermaidStripped: mermaidSanitize.stripped.length > 0 ? mermaidSanitize.stripped : undefined,
  });
}

/**
 * Regenerate a stale pending/rejected cover for an article, auto-approve it, and
 * ship it to GitHub under the article's publish gate. The old stale draft is
 * removed first so the review queue stays clean. Uses a live style sample for
 * family consistency. Returns a rich result for the publishArticle response.
 * Never throws — a failure is surfaced in the returned object.
 */
async function regenerateAndAutoShipCover(
  slug: string,
  staleDraftId: string,
  articleUrl: string | null,
): Promise<{ ok: true; draftId: string; filename: string; fileUrl: string; pngCommitSha?: string; metaCommitSha?: string } | { ok: false; draftId?: string; error: string; needsToken?: boolean }> {
  if (!supabaseAdmin) return { ok: false, error: "database not configured" };
  const url = articleUrl ?? `https://inbharat.ai/learn-ai-with-reeturaj/${slug}`;
  const meta = ARTICLES.find((a) => a.slug === slug);
  if (!meta) return { ok: false, error: `no published article found for slug ${slug}` };

  // Clear unpublished drafts for this URL (the stale one + any siblings) so the
  // idempotency gate in generateCoverDraftFromFields lets a fresh draft through.
  await clearUnpublishedCoverDrafts(url);

  const sample = await fetchStyleSample();
  const drafted = await generateCoverDraftFromFields(
    { slug, title: meta.title, category: meta.category, abstract: meta.abstract },
    sample ?? undefined,
    { force: true },
  );

  if (drafted.status !== "pending" || !drafted.draftId) {
    await logInfo("publish-article-cover-regenerate-skip", slug, drafted.note ?? "no draft").catch(() => undefined);
    return { ok: false, draftId: drafted.draftId ?? undefined, error: drafted.note ?? "cover regeneration did not produce a new draft" };
  }

  // Ship the fresh cover with an auto-approval audit row. The article publish
  // click is the human gate for the whole bundle.
  const result = await shipCoverToGitHub(drafted.draftId, url, drafted.filename as unknown as CoverSchema | null, "auto-article-publish");
  if (!result.ok) {
    await logInfo("publish-article-cover-regenerate-fail", slug, result.error || "ship failed").catch(() => undefined);
    return { ok: false, draftId: drafted.draftId, error: result.error, needsToken: (result as { needsToken?: boolean }).needsToken ?? false };
  }

  await logInfo("publish-article-cover-regenerate-shipped", slug, `draftId=${drafted.draftId} file=${result.filename}`).catch(() => undefined);
  return { ok: true, draftId: drafted.draftId, filename: result.filename, fileUrl: result.fileUrl, pngCommitSha: result.pngCommitSha, metaCommitSha: result.metaCommitSha };
}

/**
 * Video-script publish (Phase E): commit content/video-scripts/<slug>.md and mark
 * the draft published. No site wiring (videos aren't rendered on inbharat.ai
 * today) — this is a reference artifact in the repo. Honest scoping.
 */
async function publishVideoScript(
  res: VercelResponse,
  requestId: string,
  userId: string,
  draftId: string,
  draftTitle: string | null,
  bodyMd: string | null,
  schema: VideoScriptSchema | null,
): Promise<VercelResponse> {
  // Video-scripts carry no URL (draft.url is null) — they commit to inbharat's own
  // repo, so the guard target is the inbharat.ai asset (SITE.url fallback).
  if (!guardPublishTarget(res, requestId, null)) return res;
  const slug = typeof schema?.slug === "string" ? schema.slug.trim() : "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "video-script draft has no valid slug in schema_json.", requestId });
  }
  const body = typeof bodyMd === "string" ? bodyMd.trim() : "";
  if (!body) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "video-script draft has no body_md to publish.", requestId });
  }
  const path = `content/video-scripts/${slug}.md`;
  const base64 = Buffer.from(body, "utf-8").toString("base64");
  const mdRes = await commitBinary(path, base64, `video-script: add ${slug} (Growth Agent, human-gated)`);
  if (!mdRes.ok) {
    await logInfo("publish-video-script-fail", path, mdRes.error || "commit failed").catch(() => undefined);
    if (mdRes.needsToken) {
      return res.status(412).json({ ok: false, code: "PRECONDITION_FAILED", error: `GitHub token cannot push to ${COVER_REPO}: ${mdRes.error}. Set GITHUB_TOKEN (contents:write) in Vercel env.`, requestId });
    }
    return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: `video-script commit failed: ${mdRes.error}`, requestId });
  }
  const { error: upErr } = await supabaseAdmin!.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `script committed (sha ${mdRes.commitSha?.slice(0, 7) ?? "?"}) but DB status update failed: ${upErr.message}`, requestId, mdCommitSha: mdRes.commitSha });
  }
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-video-script", scope: slug, detail: `path=${path} sha=${mdRes.commitSha ?? ""} draftId=${draftId} by=${userId}` })
    .then(() => undefined, () => undefined);
  return res.status(200).json({ ok: true, requestId, kind: "video-script", slug, title: draftTitle ?? null, mdCommitSha: mdRes.commitSha });
}