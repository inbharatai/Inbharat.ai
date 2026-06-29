import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { seedOutcomeOnPublish } from "../../lib/growth/outcomes.js";
import { commitBinary, upsertText, COVER_REPO } from "../../lib/growth/githubWrite.js";
import { logInfo } from "../../lib/growth/authorization.js";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "../../content/articles.meta.js";

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

  // 3) Mark the draft published + audit.
  const { error: upErr } = await supabaseAdmin!.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) {
    await logInfo("publish-cover-db-fail", draftUrl ?? filename, upErr.message).catch(() => undefined);
    return { ok: false, code: "SERVER_ERROR", error: `cover committed to GitHub (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but DB status update failed: ${upErr.message}`, pngCommitSha: pngRes.commitSha, metaCommitSha: metaRes.commitSha };
  }
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-cover", scope: draftUrl ?? filename, detail: `file=${filePath} pngSha=${pngRes.commitSha ?? ""} metaSha=${metaRes.commitSha ?? ""} draftId=${draftId}` })
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
  const r = await shipCoverToGitHub(draftId, draftUrl, schemaJson);
  return respondCoverShip(res, requestId, r, draftTitle);
}

/**
 * Find the most recent companion cover draft for a just-published article slug and
 * ship it to GitHub (PNG + visual edit + mark published). The founder's article-
 * publish click is the human gate for the whole package, so a pending OR approved
 * cover ships — the cover image is visible in Issues alongside the article. Best-
 * effort: a cover failure never rolls back or fails the article publish (the article
 * is already live); the outcome is returned so publishArticle can surface it.
 *
 * Returns null when there is no companion cover draft for the slug.
 */
async function shipCompanionCover(slug: string): Promise<{ draftId: string; result: CoverShipResult } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,url,title,schema_json,created_at")
      .eq("kind", "cover")
      .in("status", ["pending", "approved"])
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
 * Scoped edit of articles.meta.ts: find the article entry whose `slug: '<slug>'`
 * line we're targeting, then insert `visual: '<filename>',` on the next line
 * that currently has `readMinutes: <n>,` (the visual field belongs right after
 * readMinutes per the file's existing convention). If a `visual:` field already
 * exists for that slug, return null (no-op). Returns the edited text, or null
 * when no change is needed / the slug can't be safely located.
 */
function insertVisualField(source: string, slug: string, filename: string): string | null {
  // Locate `slug: 'harness-engineering',` (handles single or double quotes).
  const slugRe = new RegExp(`(slug:\\s*['"]${escapeRe(slug)}['"]\\s*,[\\s\\S]*?readMinutes:\\s*\\d+\\s*,)`, "m");
  const m = source.match(slugRe);
  if (!m) return null; // slug not found → don't touch the file
  const segment = m[1];
  // If a visual field already exists between slug and readMinutes, no-op.
  if (/visual\s*:\s*['"]/.test(segment)) return null;
  const insertion = `\n    visual: '${filename}',`;
  return source.replace(slugRe, `${segment}${insertion}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const meta = readArticleMeta(draftTitle, bodyMd, schema);
  if (!meta) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "article draft is missing a valid slug/body (schema_json.slug + body_md required).", requestId });
  }
  const mdPath = `content/articles/${meta.slug}.md`;
  const metaPath = "content/articles.meta.ts";

  // 1) Commit the markdown body (create-or-update; base64 = correct utf8 on decode).
  const mdBase64 = Buffer.from(bodyMd ?? "", "utf-8").toString("base64");
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

  // 4) Auto-ship the companion cover with the article (founder's choice). The
  //    article is already live at this point, so a cover failure is NON-fATAL —
  //    we surface it in the `cover` field instead of failing the publish. The
  //    cover's `visual:` edit runs AFTER the article meta insert above so
  //    insertVisualField can find the freshly-added slug entry. Best-effort:
  //    no companion cover draft → cover: null (the founder can generate one later).
  const companion = await shipCompanionCover(meta.slug);
  const cover = companion
    ? companion.result.ok
      ? { ok: true, draftId: companion.draftId, filename: companion.result.filename, fileUrl: companion.result.fileUrl, pngCommitSha: companion.result.pngCommitSha, metaCommitSha: companion.result.metaCommitSha }
      : { ok: false, draftId: companion.draftId, error: companion.result.error, needsToken: (companion.result as { needsToken?: boolean }).needsToken ?? false }
    : null;

  const fileUrl = `https://inbharat.ai/learn-ai-with-reeturaj/${meta.slug}`;
  return res.status(200).json({
    ok: true, requestId, kind: "article", slug: meta.slug, title: meta.title,
    fileUrl, mdCommitSha: mdRes.commitSha, metaCommitSha: metaRes.commitSha,
    cover,
  });
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