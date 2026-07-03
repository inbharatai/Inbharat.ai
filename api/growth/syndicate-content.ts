import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { getArticleBySlug } from "../../content/articles.meta.js";
import { canonicalForSlug } from "../../lib/growth/syndication/tags.js";
import type { SyndicationPlatform } from "../../lib/growth/syndication/types.js";

/**
 * GET /api/growth/syndicate-content?draftId=... — return the title + body
 * markdown + hashtags + canonical URL + the platform "new post" / importer URLs
 * for an approved/published article draft.
 *
 * This powers the no-API-key, LinkedIn-style "Open ↗" path in
 * /admin/growth/syndication: the founder clicks a button, the body (or canonical
 * for Medium) is copied to the clipboard, the platform's editor opens in their
 * browser (they are already logged in), and they paste + review + publish by
 * hand. No server-side Playwright (Vercel serverless has no browser runtime),
 * no platform API key — exactly mirroring how the deployed LinkedIn path opens
 * LinkedIn's share deep-link from a button click.
 *
 * Human-gated (requireAdmin). The draft is NOT modified. Server-only.
 */

const Query = z.object({ draftId: z.string().min(1).max(120) });

/** The platform page to open in the founder's browser (logged-in session). */
const PLATFORM_OPEN_URLS: Record<SyndicationPlatform, string> = {
  devto: "https://dev.to/new",
  hashnode: "https://hashnode.com/new",
  medium: "https://medium.com/p/import",
};

interface DraftRow {
  id: string;
  kind: string;
  title: string | null;
  body_md: string | null;
  status: string;
  schema_json: { slug?: unknown; description?: unknown; hashtags?: unknown } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const parsed = Query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid query", requestId });
  const { draftId } = parsed.data;

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }

  const { data: draft, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,title,body_md,status,schema_json")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !draft) {
    return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "draft not found", requestId });
  }
  const d = draft as DraftRow;
  if (d.kind !== "article") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft kind is '${d.kind}' — only article drafts can be syndicated.`, requestId });
  }
  if (d.status !== "approved" && d.status !== "published") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft is '${d.status}' — only approved or published article drafts can be syndicated.`, requestId });
  }

  const slug = typeof d.schema_json?.slug === "string" ? d.schema_json.slug.trim() : "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft schema has no valid article slug", requestId });
  }
  const bodyMarkdown = typeof d.body_md === "string" ? d.body_md : "";
  if (!bodyMarkdown.trim()) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft has no body markdown to syndicate", requestId });
  }

  // Prefer the PUBLISHED manifest for title + hashtags (source of truth when live).
  const meta = getArticleBySlug(slug);
  const title = (meta?.title ?? d.title ?? "Untitled article").trim();
  const hashtags: string[] = meta?.hashtags ?? (Array.isArray(d.schema_json?.hashtags) ? (d.schema_json.hashtags as unknown[]).filter((h): h is string => typeof h === "string") : []);
  const canonicalUrl = canonicalForSlug(slug);

  return res.status(200).json({
    ok: true,
    requestId,
    draftId: d.id,
    slug,
    title,
    bodyMarkdown,
    hashtags,
    canonicalUrl,
    platformUrls: PLATFORM_OPEN_URLS,
  });
}