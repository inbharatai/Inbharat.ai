import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronAuthErr, authorizeCron } from "../../lib/requireAdmin.js";
import { auditDomain } from "../../../lib/growth/audit-runner.js";
import { getAuthorizedAssets, logInfo } from "../../../lib/growth/authorization.js";
import { promoteArticle } from "../../../lib/growth/promoter.js";
import { ingestPendingInbox } from "../../../lib/growth/inbox.js";
import { measureOutcomes } from "../../../lib/growth/outcomes.js";
import { distillLearnings } from "../../../lib/growth/learning.js";
import { generateCoverDraft, fetchStyleSample } from "../../../lib/growth/cover.js";
import { ARTICLES } from "../../../content/articles.meta.js";
import { supabaseAdmin } from "../../../api/lib/supabaseAdmin.js";
import { discoverSitePages } from "../../../lib/growth/discovery.js";

const ARTICLE_PATH_PREFIX = "/learn-ai-with-reeturaj/";

/**
 * Daily Growth Agent run — audits every authorized domain and enqueues
 * human-gated promotion drafts for "Build AI with Reeturaj" articles.
 *
 * Invoked three ways, all authenticated by authorizeCron:
 *   - Vercel's scheduled cron (GET, user-agent vercel-cron) — the daily run.
 *   - An external scheduler carrying CRON_SECRET.
 *   - An authenticated admin hitting "Run now" in the dashboard (POST).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = await authorizeCron(req);
  if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);

  await logInfo("cron-daily-start", "global", `trigger=${cron.source}`);

  const assets = getAuthorizedAssets().filter((a) => a.canAudit && a.canCrawl && a.status !== "planned");
  const results: { domain: string; status: string; pages?: number; promoted?: number; error?: string }[] = [];

  for (const asset of assets) {
    try {
      const run = await auditDomain(asset.domain);
      const promoted = asset.canDraft ? await enqueueArticlePromotions(run.pages || []) : 0;
      results.push({ domain: asset.domain, status: run.status, pages: run.pagesCount, promoted });
      // Full-site discovery (sitemap-driven, wider than the homepage-link seed):
      // keeps the site picture current and feeds outcome baselines. Wrapped so an
      // auth-denied domain or a sitemap hiccup never aborts the audit+promote run.
      if (asset.canCrawl) {
        try {
          await discoverSitePages(asset.domain);
        } catch (e) {
          await logInfo("cron-daily-discovery-fail", asset.domain, (e as Error).message).catch(() => undefined);
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      results.push({ domain: asset.domain, status: "failed", error: msg });
      await logInfo("cron-daily-fail", asset.domain, msg);
    }
  }

  // Ingest any dropped inbox content (Phase 2). Wrapped so a storage/DB hiccup
  // never aborts the audit+promote run above — one bad file won't either.
  let inbox = { ingested: 0, errored: 0, skipped: 0 };
  try {
    inbox = await ingestPendingInbox();
  } catch (e) {
    await logInfo("cron-daily-inbox-fail", "global", (e as Error).message).catch(() => undefined);
  }

  // Re-audit published articles and record SEO/GEO deltas vs their publish-time
  // baseline (the learning signal). Capped at 20/run; never throws.
  let outcomes = { measured: 0, errors: 0 };
  try {
    outcomes = await measureOutcomes();
  } catch (e) {
    await logInfo("cron-daily-outcomes-fail", "global", (e as Error).message).catch(() => undefined);
  }

  // Weekly learning distill: turn recent measured outcomes into PROPOSED rules
  // (enabled=false, source='learned') for founder approval. Gated to once per
  // 7 days via the latest growth_agent_logs 'learning-distill' row — no schema
  // change (growth_settings is a fixed-column singleton). distillLearnings emits
  // its own 'learning-distill' log row, which becomes the next gate's marker.
  let learning = { proposed: 0 };
  if (await shouldRunWeeklyDistill()) {
    try {
      learning = await distillLearnings();
    } catch (e) {
      await logInfo("cron-daily-learning-fail", "global", (e as Error).message).catch(() => undefined);
    }
  }

  // Draft on-brand cover images for articles that have no `visual` set
  // (human-gated, kind:'cover'). Idempotent per article. Wrapped so one image-gen
  // failure never aborts the run; the budget cap + withinBudget gate live in cover.ts.
  let covers = { drafted: 0, skipped: 0 };
  try {
    covers = await enqueueCoverDrafts();
  } catch (e) {
    await logInfo("cron-daily-covers-fail", "global", (e as Error).message).catch(() => undefined);
  }

  await logInfo("cron-daily-done", "global", `trigger=${cron.source} domains=${assets.length} inbox=${inbox.ingested}/${inbox.errored} outcomes=${outcomes.measured}/${outcomes.errors} learned=${learning.proposed} covers=${covers.drafted}/${covers.skipped}`);

  return res.status(200).json({ ok: true, requestId: cron.requestId, trigger: cron.source, results, inbox, outcomes, learning, covers });
}

/**
 * Weekly gate for the learning distill pass. True when there is no prior
 * 'learning-distill' log row, or the most recent one is ≥ 7 days old. No schema
 * change — the marker is the log row distillLearnings() itself emits. False when
 * Supabase is absent (distill needs the DB). Never throws.
 */
async function shouldRunWeeklyDistill(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_agent_logs")
      .select("created_at")
      .eq("action", "learning-distill")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return true; // no prior run → eligible
    const last = (data as { created_at?: string }).created_at;
    if (!last) return true;
    const ageMs = Date.now() - new Date(last).getTime();
    return ageMs >= 7 * 86400000;
  } catch {
    return false;
  }
}

/**
 * For every audited page that is a "Build AI with Reeturaj" article, enqueue a
 * human-gated LinkedIn promotion draft. promoteArticle is idempotent (skips
 * URLs that already have a 'linkedin' draft), so re-running the cron daily
 * only drafts newly-published articles. Each call is wrapped so one failure
 * doesn't abort the rest. Returns the count of newly drafted (non-skipped) URLs.
 */
async function enqueueArticlePromotions(
  pages: { url: string; title?: string; metaDescription?: string }[],
): Promise<number> {
  let drafted = 0;
  for (const page of pages) {
    if (!page.url.includes(ARTICLE_PATH_PREFIX)) continue;
    try {
      const draft = await promoteArticle(page.url, { title: page.title, description: page.metaDescription });
      if (draft.status === "pending") drafted++;
    } catch (e) {
      // authorization failure / model error for one article → log + continue
      await logInfo("cron-promote-fail", page.url, (e as Error).message).catch(() => undefined);
    }
  }
  return drafted;
}

/**
 * For every "Build AI with Reeturaj" article that has no `visual` set, draft an
 * on-brand cover image (human-gated, kind 'cover'). generateCoverDraft is
 * idempotent (skips articles that already have a cover draft), so re-running
 * the cron only drafts covers for newly-published visual-less articles. Each
 * call is wrapped so one image-gen failure doesn't abort the rest. Returns the
 * count of newly drafted vs skipped. ARTICLES is the full article manifest
 * (already imported by promoter.ts at runtime), so this runs over every article
 * regardless of whether today's audit happened to crawl it.
 */
async function enqueueCoverDrafts(): Promise<{ drafted: number; skipped: number }> {
  let drafted = 0;
  let skipped = 0;
  // Fetch one style sample for the whole run so every cron-drafted cover matches
  // the existing family (the founder's "keep it exactly as the other articles"
  // requirement). Best-effort — null degrades to the brand-prompt-only path.
  const sample = await fetchStyleSample();
  for (const meta of ARTICLES) {
    // Skip articles that already have a wired visual — they need no cover.
    if (meta.visual) { skipped++; continue; }
    try {
      const draft = await generateCoverDraft(meta, sample ?? undefined);
      if (draft.status === "pending") drafted++;
      else skipped++;
    } catch (e) {
      // image-gen / persist failure for one article → log + continue
      await logInfo("cron-cover-fail", meta.slug, (e as Error).message).catch(() => undefined);
      skipped++;
    }
  }
  return { drafted, skipped };
}