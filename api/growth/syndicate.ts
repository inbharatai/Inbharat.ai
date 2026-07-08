import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { logInfo } from "../../lib/growth/authorization.js";
import { getArticleBySlug, ARTICLE_ASSET_DIR } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";
import { syndicateArticle } from "../../lib/growth/syndication/index.js";
import { fetchPublishedArticleBody } from "../../lib/growth/syndication/articleBody.js";
import { stripCitationMarkers } from "../../lib/growth/citations.js";
import { sanitizeMermaidFences } from "../../lib/growth/mermaid-validate.js";
import { containsSecret } from "../../lib/growth/redaction.js";
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
  // Either draftId (an approved/published article draft) OR slug (a published
  // article slug). The Issues "Published articles" section knows the slug but
  // not the draftId for pre-growth-agent articles, so the route resolves a slug
  // to its draft row when present and falls back to a synthetic `slug:<slug>`
  // ledger id when no draft row exists (the article is still live + syndicatable
  // from its published .md).
  draftId: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  platforms: z.array(z.enum(["devto", "hashnode", "medium"])).min(1).max(3),
  // mode:"playwright" = the LOCAL Playwright submit path the founder asked for
  // (the same process as LinkedIn): the route resolves the body + canonical,
  // records a `playwright_draft` ledger row per platform, and returns them so
  // the founder's "Submit (local) ↗" click can copy + open the platform editor +
  // surface the local `npx tsx scripts/syndicate-populate.ts ...` command. It does
  // NOT call any platform API — no API keys/tokens needed. The founder runs the
  // script on their own machine (persistent logged-in profile) and clicks Publish
  // themselves. mode:"api" (default) = the existing API path (DEV.to/Hashnode with
  // keys; Medium manual importer).
  mode: z.enum(["api", "playwright"]).optional(),
}).refine((b) => Boolean(b.draftId || b.slug), { message: "draftId or slug is required" });

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
    // ?historyOnly=1 → skip the eligible-drafts query. The Issues page only needs
    // the syndication ledger (history) — the eligible payload (60 article drafts
    // with full body_md) was fetched on every Issues load and discarded, costing a
    // serial RTT + a heavy DB read for nothing. Callers that actually use the
    // eligible list omit the flag and get the full response.
    const historyOnly = req.query?.historyOnly === "1" || req.query?.historyOnly === "true";
    return listSyndication(res, admin.requestId, historyOnly);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
  const { draftId, platforms } = parsed.data;
  const mode = parsed.data.mode ?? "api";
  const slugArg = typeof parsed.data.slug === "string" ? parsed.data.slug.trim() : "";

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }

  // Resolve to a draft row + slug. Two entry points:
  //  1) draftId — the original Growth-Agent flow (an approved/published article
  //     draft from the review queue). Loads the row, enforces kind=article +
  //     status in {approved,published}, reads the slug from schema_json.
  //  2) slug — the Issues "Published articles" flow. Validates the slug against
  //     the published ARTICLES manifest (so only real live articles syndicate),
  //     then looks up the matching growth_drafts row by schema_json.slug for the
  //     draft-body fallback. If no draft row exists (e.g. a pre-growth-agent
  //     article), syndication still proceeds from the published .md with a
  //     synthetic `slug:<slug>` ledger id.
  let d: DraftRow | null = null;
  let slug = "";
  let ledgerDraftId: string;
  let draftStatus: string;

  if (draftId) {
    const { data: draft, error: qErr } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,status,schema_json")
      .eq("id", draftId)
      .maybeSingle();
    if (qErr || !draft) {
      return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "draft not found", requestId });
    }
    d = draft as DraftRow;
    if (d.kind !== "article") {
      return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft kind is '${d.kind}' — only article drafts can be syndicated.`, requestId });
    }
    if (d.status !== "approved" && d.status !== "published") {
      return res.status(409).json({ ok: false, code: "CONFLICT", error: `draft is '${d.status}' — only approved or published article drafts can be syndicated.`, requestId });
    }
    slug = typeof d.schema_json?.slug === "string" ? d.schema_json.slug.trim() : "";
    ledgerDraftId = d.id;
    draftStatus = d.status;
  } else {
    // slug-based entry: must be a real published article.
    slug = slugArg;
    const meta = getArticleBySlug(slug);
    if (!meta) {
      return res.status(404).json({ ok: false, code: "NOT_FOUND", error: `no published article found for slug "${slug}"`, requestId });
    }
    // Look up the matching draft row (best-effort; not required).
    const { data: row } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,status,schema_json")
      .eq("schema_json->>slug", slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      d = row as DraftRow;
      ledgerDraftId = (row as DraftRow).id;
      draftStatus = (row as DraftRow).status;
    } else {
      d = null;
      ledgerDraftId = `slug:${slug}`;
      draftStatus = "published"; // it's in the manifest → treat as published.
    }
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "no valid article slug resolved", requestId });
  }
  const draftBodyMd = d && typeof d.body_md === "string" ? d.body_md : "";
  // For slug-based entry with no draft row, require the published .md (checked below).
  if (!draftBodyMd.trim() && draftStatus !== "published") {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "draft has no body markdown to syndicate", requestId });
  }

  // Body source of truth: the PUBLISHED .md (content/articles/<slug>.md) is the
  // exact markdown live on www.inbharat.ai — citation-stripped + mermaid-cleaned
  // at commit time, and capturing any founder post-publish edits. The raw draft
  // body_md diverges from it (still has [N] markers / unsanitized fences), so
  // syndicating body_md would ship a divergent version and break the canonical
  // attribution that is the entire point of cross-posting. Use the published
  // body when the article is live; fall back to the draft body only for an
  // approved-but-not-yet-committed draft (no .md in the repo yet). Either way,
  // re-run stripCitationMarkers + sanitizeMermaidFences as defense-in-depth.
  const published = getArticleBySlug(slug);
  let sourceBody = draftBodyMd;
  let bodySource: "published" | "draft" = "draft";
  if (published && (draftStatus === "published" || draftStatus === "approved")) {
    const pub = await fetchPublishedArticleBody(slug);
    if (pub.ok && pub.body && pub.body.trim()) {
      sourceBody = pub.body;
      bodySource = "published";
    } else if (pub.ok === false && !/GITHUB_TOKEN not configured/.test(pub.error ?? "")) {
      await logInfo("syndicate-body-fetch-fail", slug, pub.error ?? "unknown").catch(() => undefined);
      // fall through to draft body — better to syndicate the draft than to hard-fail.
    }
  }
  // Slug-based entry with no draft row → the published .md is the ONLY body
  // source. If the fetch failed, we have nothing to syndicate.
  if (!sourceBody.trim()) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "could not resolve an article body to syndicate (published .md fetch failed and no draft body available)", requestId });
  }
  const mermaidSanitize = await sanitizeMermaidFences(sourceBody);
  const bodyMd = stripCitationMarkers(mermaidSanitize.cleaned);
  if (!bodyMd.trim()) {
    return res.status(409).json({ ok: false, code: "CONFLICT", error: "resolved body is empty after cleaning", requestId });
  }

  // Prefer the PUBLISHED manifest as the source of truth for title/description/
  // hashtags/visual (it's what's actually live on inbharat.ai). For an approved-
  // but-not-yet-committed draft the manifest won't have it → fall back to the
  // draft's schema_json + title. Hashtags default to [] (DEV.to/Hashnode just
  // get no tags — not an error).
  const meta = getArticleBySlug(slug);
  const title = (meta?.title ?? d?.title ?? "Untitled article").trim();
  const description = meta?.description ?? (d && typeof d.schema_json?.description === "string" ? d.schema_json.description : null);
  const hashtags: string[] = meta?.hashtags ?? (d && Array.isArray(d.schema_json?.hashtags) ? (d.schema_json.hashtags as unknown[]).filter((h): h is string => typeof h === "string") : []);
  // Cover image: only when the published article has a wired visual (served at
  // the inbharat.ai asset path). For approved-not-published drafts there is none
  // yet → DEV.to gets no main_image (fine).
  const coverImageUrl = meta?.visual ? `${SITE.url}${ARTICLE_ASSET_DIR}/${meta.visual}` : null;

  // ── Local Playwright path ──────────────────────────────────────────────────
  // mode:"playwright" — the founder clicked "Submit (local) ↗" in the Issues
  // SyndicatePanel. Resolve the body + canonical (already done above), record a
  // `playwright_draft` ledger row per platform, and return them. Do NOT call any
  // platform API — the founder runs scripts/syndicate-populate.ts on their own
  // machine (persistent logged-in browser profile) to pre-fill the editor, then
  // clicks Publish themselves. The deployed Vercel app cannot spawn a browser.
  // Nothing publishes here. No API keys/tokens required (the whole point).
  if (mode === "playwright") {
    const canonicalUrl = `${SITE.url}/learn-ai-with-reeturaj/${slug}`;
    // Secret scan up front — mirror syndicateArticle (index.ts:41). The Playwright
    // path returns bodyMarkdown to the client for clipboard copy + paste into
    // DEV.to/Hashnode/Medium; a stray secret in a draft would land on the
    // founder's clipboard and get pasted public. Abort before any ledger row.
    if (containsSecret(bodyMd)) {
      return res.status(409).json({
        ok: false,
        code: "CONFLICT",
        error: "article body contains a secret pattern; local syndication aborted before copy (clean the draft and retry).",
        requestId,
      });
    }
    const results: SyndicationResult[] = (platforms as SyndicationPlatform[]).map((p) => ({
      platform: p,
      ok: true,
      url: null,
      postId: null,
      status: "playwright_draft",
      error: null,
      canonicalUrl,
    }));
    for (const r of results) {
      try {
        await supabaseAdmin.from("growth_syndication").insert({
          draft_id: ledgerDraftId,
          slug,
          platform: r.platform,
          status: r.status,
          canonical_url: r.canonicalUrl,
          platform_url: null,
          platform_post_id: null,
          error: null,
        });
      } catch (e) {
        await logInfo("syndicate-persist-fail", `${slug}:${r.platform}`, (e as Error).message).catch(() => undefined);
      }
      await logInfo("syndicate", `${slug}:${r.platform}`, `status=playwright_draft ok=true (local Playwright path)`).catch(() => undefined);
    }
    return res.status(200).json({
      ok: true,
      requestId,
      slug,
      title,
      results,
      bodyMarkdown: bodyMd,
      canonicalUrl,
      bodySource,
      mode: "playwright",
    });
  }

  const results: SyndicationResult[] = await syndicateArticle(platforms as SyndicationPlatform[], {
    draftId: ledgerDraftId,
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
        draft_id: ledgerDraftId,
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

  // Surface the cleaned body + canonical so the Issues UI can copy+open for
  // MANUAL platforms (Medium always; DEV.to/Hashnode when their API keys are
  // absent). API-success platforms ignore these fields. bodySource tells the
  // founder whether the cross-post used the live published .md ("published") or
  // fell back to the draft body ("draft") — normally "published" once the
  // article is committed.
  const canonicalUrl = results[0]?.canonicalUrl ?? `${SITE.url}/learn-ai-with-reeturaj/${slug}`;
  return res.status(200).json({
    ok: true,
    requestId,
    slug,
    title,
    results,
    bodyMarkdown: bodyMd,
    canonicalUrl,
    bodySource,
  });
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
  body_md: string | null;
  status: string;
  schema_json: { slug?: unknown } | null;
}

/**
 * GET /api/growth/syndicate — return the syndication ledger (history, newest
 * first) + the article drafts eligible to syndicate (approved or published).
 * The /admin/growth/syndication page renders both. Each eligible row carries its
 * body markdown so the founder's "Open ↗" click can copy the body to the
 * clipboard synchronously in the click gesture (no per-click fetch — which on a
 * cold serverless start could outrun the browser's clipboard-activation window
 * and silently fail the copy). Never throws; degrades to empty arrays when
 * Supabase is absent (guarded by the caller).
 */
async function listSyndication(res: VercelResponse, requestId: string, historyOnly = false): Promise<VercelResponse> {
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }
  let history: HistoryRow[] = [];
  let eligible: { id: string; kind: string; url: string | null; title: string | null; bodyMarkdown: string; status: string; slug: string | null }[] = [];
  if (historyOnly) {
    // Issues path: only the ledger is needed. One query, no eligible payload.
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
    return res.status(200).json({ ok: true, requestId, history, eligible });
  }
  // Full path: run the two independent reads concurrently (was serial — two RTTs).
  const [histRes, draftsRes] = await Promise.all([
    supabaseAdmin
      .from("growth_syndication")
      .select("id,draft_id,slug,platform,status,canonical_url,platform_url,platform_post_id,error,created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r) => r, (e) => { logInfo("syndicate-list-history-fail", "global", (e as Error).message).catch(() => undefined); return null; }),
    supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,status,schema_json")
      .eq("kind", "article")
      .in("status", ["approved", "published"])
      .order("created_at", { ascending: false })
      .limit(60)
      .then((r) => r, (e) => { logInfo("syndicate-list-eligible-fail", "global", (e as Error).message).catch(() => undefined); return null; }),
  ]);
  if (histRes && !histRes.error && Array.isArray(histRes.data)) history = histRes.data as HistoryRow[];
  if (draftsRes && !draftsRes.error && Array.isArray(draftsRes.data)) {
    eligible = (draftsRes.data as EligibleRow[]).map((d) => ({
      id: d.id,
      kind: d.kind,
      url: d.url,
      title: d.title,
      bodyMarkdown: typeof d.body_md === "string" ? d.body_md : "",
      status: d.status,
      slug: typeof d.schema_json?.slug === "string" ? (d.schema_json.slug as string) : null,
    }));
  }
  return res.status(200).json({ ok: true, requestId, history, eligible });
}