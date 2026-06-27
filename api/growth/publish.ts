import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { seedOutcomeOnPublish } from "../../lib/growth/outcomes.js";

/**
 * /api/growth/publish — LinkedIn one-click publish (HUMAN-GATED). Admin-only.
 *   POST { draftId, mode:'personal'|'company', companyId? }
 *
 * The only transition to status='published'. It does NOT call LinkedIn's API —
 * it marks the approved draft published + returns LinkedIn's OFFICIAL share
 * deep-link prefilled with the article URL. The founder clicks it (and the
 * caption is placed on the clipboard client-side). Zero account-ban risk, zero
 * new infra. approvals.ts stays approve/reject-only (no publish), preserving
 * the never-auto-publish rule.
 */
const Body = z.object({
  draftId: z.string().min(1).max(120),
  mode: z.enum(["personal", "company"]),
  companyId: z.string().min(1).max(80).optional(),
});

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
    .select("id,kind,url,title,body_md,status")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !draft) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "draft not found", requestId });
  if (draft.status !== "approved") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft is '${draft.status}' — only approved drafts can be published.`, requestId });
  }
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