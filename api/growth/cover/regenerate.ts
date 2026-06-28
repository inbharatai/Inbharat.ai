import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../../lib/requireAdmin.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { generateCoverDraft, fetchStyleSample } from "../../../lib/growth/cover.js";
import { ARTICLE_HUB_PATH, ARTICLES } from "../../../content/articles.meta.js";
import { logInfo } from "../../../lib/growth/authorization.js";

/**
 * /api/growth/cover/regenerate — admin-only. The founder wants to iterate on a
 * cover BEFORE approving it: delete the existing cover draft(s) for the article
 * (so the idempotency gate in generateCoverDraft lets a fresh one be drafted)
 * and re-run the cover model. The OLD draft is removed (not rejected) to keep
 * the review queue clean; a fresh pending draft takes its place. Still 100%
 * human-gated — nothing publishes here, the founder still approves + publishes.
 *
 * Body: { draftId }  (a draftId of any existing cover draft for the article)
 * Returns: { ok, draftId?, note? }
 */
const Body = z.object({ draftId: z.string().min(1).max(120) });

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
  const { draftId } = parsed.data;
  if (!supabaseAdmin) return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });

  // Find the cover draft → its article URL.
  const { data: draft, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,url,status")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !draft) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "draft not found", requestId });
  if (draft.kind !== "cover") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft is not a cover draft", requestId });
  }
  const url = draft.url as string | null;
  if (!url) return res.status(409).json({ ok: false, code: "CONFLICT", error: "cover draft has no article URL", requestId });

  // Resolve the article meta from the URL. The cover URL is
  // `<origin><articlePath(slug)>` = `<origin>/learn-ai-with-reeturaj/<slug>`.
  // Strip everything up to and including the article hub path to recover the slug.
  const hubIdx = url.indexOf(ARTICLE_HUB_PATH + "/");
  const slug = hubIdx >= 0 ? decodeURIComponent(url.slice(hubIdx + ARTICLE_HUB_PATH.length + 1).replace(/\/.*$/, "")) : "";
  if (!slug) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `could not derive article slug from URL "${url}"`, requestId });
  }
  const meta = ARTICLES.find((a) => a.slug === slug);
  if (!meta) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `no article found for slug "${slug}"`, requestId });
  }

  // Don't regenerate if the cover has ALREADY been published (the PNG is live on
  // the site + wired into articles.meta.ts) — that needs a deliberate override,
  // not a one-click "regenerate". Tell the founder to reject-and-redraft instead.
  if (draft.status === "published") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "this cover is already published to GitHub — reject the draft (which removes it from the queue) and trigger a new cover via the agent instead.", requestId });
  }

  // Clear ALL cover drafts for this article URL so the idempotency gate
  // (hasExistingCoverDraft) lets generateCoverDraft draft a fresh one. Only
  // pending/approved/rejected — never touch a published row.
  const { error: delErr } = await supabaseAdmin
    .from("growth_drafts")
    .delete()
    .eq("url", url)
    .eq("kind", "cover")
    .in("status", ["pending", "approved", "rejected"]);
  if (delErr) {
    await logInfo("cover-regen-delete-fail", url, delErr.message).catch(() => undefined);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `failed to clear existing cover drafts: ${delErr.message}`, requestId });
  }

  // Re-draft with a style sample so the regenerated cover matches the family
  // (the founder's "keep it exactly as the other articles" requirement). force
  // bypasses the hasExistingCoverDraft gate — necessary because a published
  // cover draft for this URL may still exist (kept as audit history) and would
  // otherwise block the fresh draft. generateCoverDraft never throws.
  const sample = await fetchStyleSample();
  const result = await generateCoverDraft(meta, sample ?? undefined, { force: true });
  if (result.status !== "pending") {
    return res.status(200).json({ ok: true, requestId, draftId: result.draftId, note: result.note ?? "regenerate did not produce a new draft" });
  }
  await logInfo("cover-regenerated", url, `newDraft=${result.draftId} file=${result.filename}`).catch(() => undefined);
  return res.status(200).json({ ok: true, requestId, draftId: result.draftId });
}