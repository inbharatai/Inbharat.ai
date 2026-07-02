import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { logInfo } from "../../lib/growth/authorization.js";
import { getArticleBySlug, ARTICLE_ASSET_DIR } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";
import { syndicateArticle } from "../../lib/growth/syndication/index.js";
import type { SyndicationPlatform, SyndicationResult } from "../../lib/growth/syndication/types.js";

/**
 * POST /api/growth/syndicate — syndicate an APPROVED article draft to external
 * platforms (DEV.to, Hashnode, Medium manual) with the InBharat canonical URL
 * set, so Google attributes the original to www.inbharat.ai.
 *
 * Human-gated: requireAdmin (only the founder) + the founder explicitly picks
 * platforms per publish. No cron auto-syndication. NOT an authorized-asset
 * action (the targets are external platforms, not an inbharat.ai repo PR), so
 * assertAuthorized/guardPublishTarget do not apply — requireAdmin is the control.
 *
 * The draft is NOT modified (its status stays approved/published); each attempt
 * is recorded as a growth_syndication row (the syndication ledger the
 * /admin/growth/syndication page reads). Re-syndicating after a fix is a new row.
 */
const Body = z.object({
  draftId: z.string().min(1).max(120),
  platforms: z.array(z.enum(["devto", "hashnode", "medium"])).min(1).max(3),
});

interface DraftRow {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  body_md: string | null;
  status: string;
  schema_json: {
    slug?: unknown;
    description?: unknown;
    hashtags?: unknown;
  } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    return listSyndication(res, admin.requestId);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
  const { draftId, platforms } = parsed.data;

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }

  // Load the draft. Only article drafts syndicate (LinkedIn/covers/video have no
  // canonical article to cross-post). Accept approved OR published: the founder
  // may syndicate before or after the inbharat publish.
  const { data: draft, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,url,title,body_md,status,schema_json")
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

  // Slug from the draft schema (validated lowercase-hyphen). Without a slug we
  // can't build the canonical URL → 409.
  const slug = typeof d.schema_json?.slug === "string" ? d.schema_json.slug.trim() : "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft schema has no valid article slug", requestId });
  }
  const bodyMd = typeof d.body_md === "string" ? d.body_md : "";
  if (!bodyMd.trim()) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft has no body markdown to syndicate", requestId });
  }

  // Prefer the PUBLISHED manifest as the source of truth for title/description/
  // hashtags/visual (it's what's actually live on inbharat.ai). For an approved-
  // but-not-yet-committed draft the manifest won't have it → fall back to the
  // draft's schema_json + title. Hashtags default to [] (DEV.to/Hashnode just
  // get no tags — not an error).
  const meta = getArticleBySlug(slug);
  const title = (meta?.title ?? d.title ?? "Untitled article").trim();
  const description = meta?.description ?? (typeof d.schema_json?.description === "string" ? d.schema_json.description : null);
  const hashtags: string[] = meta?.hashtags ?? (Array.isArray(d.schema_json?.hashtags) ? (d.schema_json.hashtags as unknown[]).filter((h): h is string => typeof h === "string") : []);
  // Cover image: only when the published article has a wired visual (served at
  // the inbharat.ai asset path). For approved-not-published drafts there is none
  // yet → DEV.to gets no main_image (fine).
  const coverImageUrl = meta?.visual ? `${SITE.url}${ARTICLE_ASSET_DIR}/${meta.visual}` : null;

  const results: SyndicationResult[] = await syndicateArticle(platforms as SyndicationPlatform[], {
    draftId: d.id,
    slug,
    title,
    bodyMarkdown: bodyMd,
    hashtags,
    coverImageUrl,
    description,
  });

  // Persist each result to the syndication ledger (best-effort per row; one
  // failure never aborts the rest). The page reads this to show history + URLs.
  for (const r of results) {
    try {
      await supabaseAdmin.from("growth_syndication").insert({
        draft_id: d.id,
        slug,
        platform: r.platform,
        status: r.status,
        canonical_url: r.canonicalUrl,
        platform_url: r.url,
        platform_post_id: r.postId,
        error: r.error,
      });
    } catch (e) {
      await logInfo("syndicate-persist-fail", `${slug}:${r.platform}`, (e as Error).message).catch(() => undefined);
    }
    await logInfo(
      "syndicate",
      `${slug}:${r.platform}`,
      `status=${r.status} ok=${r.ok}${r.url ? ` url=${r.url}` : ""}${r.error ? ` error=${r.error.slice(0, 200)}` : ""}`,
    ).catch(() => undefined);
  }

  return res.status(200).json({ ok: true, requestId, slug, title, results });
}

interface HistoryRow {
  id: string;
  draft_id: string;
  slug: string;
  platform: string;
  status: string;
  canonical_url: string;
  platform_url: string | null;
  platform_post_id: string | null;
  error: string | null;
  created_at: string;
}

interface EligibleRow {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  status: string;
  schema_json: { slug?: unknown } | null;
}

/**
 * GET /api/growth/syndicate — return the syndication ledger (history, newest
 * first) + the article drafts eligible to syndicate (approved or published).
 * The /admin/growth/syndication page renders both. Never throws; degrades to
 * empty arrays when Supabase is absent (guarded by the caller).
 */
async function listSyndication(res: VercelResponse, requestId: string): Promise<VercelResponse> {
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }
  let history: HistoryRow[] = [];
  let eligible: { id: string; kind: string; url: string | null; title: string | null; status: string; slug: string | null }[] = [];
  try {
    const { data: hist, error: hErr } = await supabaseAdmin
      .from("growth_syndication")
      .select("id,draft_id,slug,platform,status,canonical_url,platform_url,platform_post_id,error,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!hErr && Array.isArray(hist)) history = hist as HistoryRow[];
  } catch (e) {
    await logInfo("syndicate-list-history-fail", "global", (e as Error).message).catch(() => undefined);
  }
  try {
    const { data: drafts, error: dErr } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,status,schema_json")
      .eq("kind", "article")
      .in("status", ["approved", "published"])
      .order("created_at", { ascending: false })
      .limit(60);
    if (!dErr && Array.isArray(drafts)) {
      eligible = (drafts as EligibleRow[]).map((d) => ({
        id: d.id,
        kind: d.kind,
        url: d.url,
        title: d.title,
        status: d.status,
        slug: typeof d.schema_json?.slug === "string" ? (d.schema_json.slug as string) : null,
      }));
    }
  } catch (e) {
    await logInfo("syndicate-list-eligible-fail", "global", (e as Error).message).catch(() => undefined);
  }
  return res.status(200).json({ ok: true, requestId, history, eligible });
}