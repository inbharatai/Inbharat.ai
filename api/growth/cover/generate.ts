import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../../lib/requireAdmin.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { generateCoverDraft, fetchStyleSample } from "../../../lib/growth/cover.js";
import { ARTICLES, articlePath } from "../../../content/articles.meta.js";
import { SITE } from "../../../seo.config.js";
import { logInfo } from "../../../lib/growth/authorization.js";

/**
 * /api/growth/cover/generate — admin-only, ON-DEMAND cover for a PUBLISHED
 * article. The founder's "option to load a new cover if the previous cover is
 * not there or not good" — works whether the article has no cover yet OR an
 * existing cover the founder wants to replace.
 *
 * Body: { slug }
 *   - Resolves the article meta from ARTICLES (published articles only — for
 *     not-yet-published drafts the agent's generate_cover tool is the path).
 *   - Clears any pending/approved/rejected cover drafts for the article URL so
 *     the review queue stays clean (published rows are kept as audit history).
 *   - Fetches a style sample from a canonical live cover so the new cover
 *     matches the family, then force-generates (force bypasses the
 *     hasExistingCoverDraft idempotency gate, so this works even when a cover
 *     draft — including a published one — already exists).
 *   - Returns a fresh PENDING draft for the founder to approve + publish.
 *     Still 100% human-gated — nothing publishes here.
 *
 * Returns: { ok, draftId?, note? }
 */
const Body = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (slug required, kebab-case)", requestId });
  const { slug } = parsed.data;

  const meta = ARTICLES.find((a) => a.slug === slug);
  if (!meta) {
    return res.status(404).json({ ok: false, code: "NOT_FOUND", error: `no published article found for slug "${slug}"`, requestId });
  }

  const url = `${SITE.url}${articlePath(slug)}`;

  if (supabaseAdmin) {
    // Clear pending/approved/rejected cover drafts for this URL so a fresh one
    // takes their place. Published rows are kept (audit history). Best-effort.
    const { error: delErr } = await supabaseAdmin
      .from("growth_drafts")
      .delete()
      .eq("url", url)
      .eq("kind", "cover")
      .in("status", ["pending", "approved", "rejected"]);
    if (delErr) {
      await logInfo("cover-generate-delete-fail", url, delErr.message).catch(() => undefined);
    }
  }

  // Style sample from a canonical live cover → family-consistent result.
  const sample = await fetchStyleSample();

  // force:true so this generates even when a cover draft (incl. published) exists.
  const result = await generateCoverDraft(meta, sample ?? undefined, { force: true });
  if (result.status !== "pending") {
    await logInfo("cover-generate-skip", url, result.note ?? "no draft").catch(() => undefined);
    return res.status(200).json({ ok: true, requestId, draftId: result.draftId, note: result.note ?? "generate did not produce a new draft" });
  }
  await logInfo("cover-generated", url, `newDraft=${result.draftId} file=${result.filename} sample=${sample ? "yes" : "no"}`).catch(() => undefined);
  return res.status(200).json({ ok: true, requestId, draftId: result.draftId });
}