import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { seedOutcomeOnPublish } from "../../lib/growth/outcomes.js";
import { commitBinary, upsertText, COVER_REPO } from "../../lib/growth/githubWrite.js";
import { logInfo } from "../../lib/growth/authorization.js";

/**
 * /api/growth/publish — human-gated publish (admin-only). Two kinds:
 *
 *   kind='linkedin' (POST { draftId, mode:'personal'|'company', companyId? })
 *     Does NOT call LinkedIn's API — marks the approved draft published + returns
 *     LinkedIn's OFFICIAL share deep-link prefilled with the article URL. The
 *     founder clicks it (caption placed on the clipboard client-side). Zero
 *     account-ban risk, zero new infra.
 *
 *   kind='cover' (POST { draftId, mode:'cover' })
 *     Commits the approved cover PNG to public/learn-ai-with-reeturaj/<slug>.png
 *     AND edits content/articles.meta.ts to set `visual: '<slug>.png'` on the
 *     matching slug — via the GitHub Contents API. The repo is connected to
 *     Vercel → the commit auto-rebuilds so the new cover ships with no manual
 *     deploy. No growth_outcomes row (its `kind` is CHECK-constrained to
 *     linkedin|inbox-outline, so covers skip outcome seeding).
 *
 * The only transition to status='published'. approvals.ts stays approve/reject
 * -only (no publish), preserving the never-auto-publish rule.
 */
const Body = z.object({
  draftId: z.string().min(1).max(120),
  mode: z.enum(["personal", "company", "cover"]),
  companyId: z.string().min(1).max(80).optional(),
});

interface CoverSchema {
  pngBase64?: unknown;
  mimeType?: unknown;
  filename?: unknown;
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

  // ─── LinkedIn publish: mark published + return the official share deep-link ─
  const articleUrl = draft.url as string | null;
  if (!articleUrl) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft has no URL to share.", requestId });
  }

  const enc = encodeURIComponent(articleUrl);
  const shareUrl =
    mode === "company"
      ? `https://www.linkedin.com/company/${encodeURIComponent(companyId!)}/admin/share/?url=${enc}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`;

  // Mark published + audit. NO LinkedIn API call — only our row + a deep-link.
  const { error: upErr } = await supabaseAdmin.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-linkedin", scope: articleUrl, detail: `mode=${mode} draftId=${draftId}` })
    .catch(() => undefined);

  // Seed the outcome baseline so the daily cron can later measure the article's
  // SEO/GEO delta from this publish point. Publishes nothing; never throws.
  await seedOutcomeOnPublish(draftId, articleUrl, String(draft.kind)).catch(() => undefined);

  return res.status(200).json({ ok: true, requestId, shareUrl, summary: (draft.body_md as string | null) ?? "", title: (draft.title as string | null) ?? "" });
}

/**
 * Cover publish: commit the PNG + the articles.meta.ts `visual:` edit to GitHub,
 * mark the draft published, and audit-log it. The schema_json carries the base64
 * PNG + the target filename (set when the cover was drafted). Returns the commit
 * sha + the public file URL. On a missing/insufficient GITHUB_TOKEN, returns 412
 * with a clear message (no silent commit failure).
 */
async function publishCover(
  res: VercelResponse,
  requestId: string,
  draftId: string,
  draftUrl: string | null,
  draftTitle: string | null,
  schemaJson: CoverSchema | null,
): Promise<VercelResponse> {
  const pngBase64 = typeof schemaJson?.pngBase64 === "string" ? schemaJson.pngBase64 : null;
  const filename = typeof schemaJson?.filename === "string" ? schemaJson.filename : null;
  if (!pngBase64 || !filename) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "cover draft has no image payload (pngBase64/filename missing from schema_json).", requestId });
  }
  // Sanity: filename must be <slug>.png — defend against a path-traversal in schema_json.
  if (!/^[a-z0-9-]+\.png$/i.test(filename)) {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: `invalid cover filename "${filename}" (expected <slug>.png)`, requestId });
  }

  const filePath = `public/learn-ai-with-reeturaj/${filename}`;
  const metaPath = "content/articles.meta.ts";
  const slug = filename.replace(/\.png$/i, "");

  // 1) Commit the PNG.
  const pngRes = await commitBinary(filePath, pngBase64, `cover: add ${filename} (Growth Agent, human-gated)`);
  if (!pngRes.ok) {
    await logInfo("publish-cover-fail-png", draftUrl ?? filename, pngRes.error || "commit failed").catch(() => undefined);
    if (pngRes.needsToken) {
      return res.status(412).json({ ok: false, code: "PRECONDITION_FAILED", error: `GitHub token cannot push to ${COVER_REPO}: ${pngRes.error}. Set GITHUB_TOKEN (contents:write) in Vercel env.`, requestId });
    }
    return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: `cover PNG commit failed: ${pngRes.error}`, requestId });
  }

  // 2) Edit articles.meta.ts: set `visual: '<filename>'` on the matching slug's
  //    entry. The edit is a scoped regex insert on the readMinutes line, so it is
  //    robust to formatting churn elsewhere in the file.
  const metaRes = await upsertText(metaPath, (current) => insertVisualField(current, slug, filename), `cover: set visual for ${slug} (Growth Agent, human-gated)`);
  if (!metaRes.ok && !metaRes.skipped) {
    await logInfo("publish-cover-fail-meta", metaPath, metaRes.error || "edit failed").catch(() => undefined);
    // The PNG committed but the meta edit failed — the cover file exists but the
    // article won't reference it until the meta edit lands. Surface it clearly
    // (the founder can re-run; commitBinary is idempotent on the PNG).
    return res.status(502).json({ ok: false, code: "SERVER_ERROR", error: `cover PNG committed (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but articles.meta.ts edit failed: ${metaRes.error}. Re-run publish to wire the visual.`, requestId, pngCommitSha: pngRes.commitSha });
  }

  // 3) Mark the draft published + audit.
  const { error: upErr } = await supabaseAdmin!.from("growth_drafts").update({ status: "published" }).eq("id", draftId);
  if (upErr) {
    await logInfo("publish-cover-db-fail", draftUrl ?? filename, upErr.message).catch(() => undefined);
    // Files are committed; only the status row failed. Non-fatal — surface but don't roll back the commits.
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `cover committed to GitHub (sha ${pngRes.commitSha?.slice(0, 7) ?? "?"}) but DB status update failed: ${upErr.message}`, requestId, pngCommitSha: pngRes.commitSha, metaCommitSha: metaRes.commitSha });
  }
  await supabaseAdmin!
    .from("growth_agent_logs")
    .insert({ level: "info", action: "publish-cover", scope: draftUrl ?? filename, detail: `file=${filePath} pngSha=${pngRes.commitSha ?? ""} metaSha=${metaRes.commitSha ?? ""} draftId=${draftId}` })
    .catch(() => undefined);

  const fileUrl = `https://inbharat.ai/learn-ai-with-reeturaj/${filename}`;
  return res.status(200).json({
    ok: true,
    requestId,
    kind: "cover",
    filename,
    fileUrl,
    pngCommitSha: pngRes.commitSha,
    metaCommitSha: metaRes.commitSha,
    title: draftTitle ?? null,
  });
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