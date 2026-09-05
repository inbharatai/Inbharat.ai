import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { MORNING_THREAD_TITLE } from "./cron/morning.js";
import { sameInBharatUrl } from "../../lib/growth/siteUrl.js";

/**
 * GET /api/growth/pipeline — "Today's pipeline" bundle for the shared strip on
 * the Agent + Issues admin pages. One call returns the morning content run
 * end-to-end: the "Build with Reeturaj — Daily Plan" thread + today's
 * article / LinkedIn / cover drafts with their current statuses. The strip can
 * then render topic → article → LinkedIn → cover at a glance, with deep-links
 * both ways. Admin-only; every DB step degrades to empty on a Supabase hiccup
 * (the strip shows an empty state, never a 500).
 *
 * The bundle is derived from the drafts themselves (no tool-message parsing):
 * the article is the most-recent kind='article' draft today; the LinkedIn draft
 * is the one whose url matches the article's; the cover is the one whose
 * schema_json.filename === '<slug>.png'. This keeps the strip robust to changes
 * in how the agent narrates its tool calls.
 */

interface PipelineDraft {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  schema_json: { slug?: string; filename?: string } | null;
  status: string;
  created_at: string;
}

export interface PipelineBundle {
  thread: { id: string; title: string; updatedAt: string } | null;
  topic: string | null;
  article: { draftId: string; slug: string | null; title: string | null; status: string; url: string | null } | null;
  linkedin: { draftId: string; status: string } | null;
  cover: { draftId: string; filename: string | null; status: string } | null;
}

/**
 * Pure assembly — given today's drafts (ordered created_at desc) + the morning
 * thread, build the pipeline bundle. Exported so the hermetic test can drive it
 * with fixture rows (no DB, no Gemini).
 */
export function assemblePipeline(drafts: PipelineDraft[], thread: { id: string; title: string; updatedAt: string } | null): PipelineBundle {
  const articleRow = drafts.find((d) => d.kind === "article") ?? null;
  const articleSlug = typeof articleRow?.schema_json?.slug === "string" ? articleRow.schema_json.slug : null;

  const linkedinRow = articleRow
    ? drafts.find((d) => d.kind === "linkedin" && sameInBharatUrl(d.url, articleRow.url)) ?? drafts.find((d) => d.kind === "linkedin") ?? null
    : drafts.find((d) => d.kind === "linkedin") ?? null;

  const wantCoverFile = articleSlug ? `${articleSlug}.png` : null;
  const coverRow = wantCoverFile
    ? drafts.find((d) => d.kind === "cover" && d.schema_json?.filename === wantCoverFile) ?? drafts.find((d) => d.kind === "cover") ?? null
    : drafts.find((d) => d.kind === "cover") ?? null;

  return {
    thread,
    topic: articleRow?.title ?? null,
    article: articleRow
      ? { draftId: articleRow.id, slug: articleSlug, title: articleRow.title, status: articleRow.status, url: articleRow.url }
      : null,
    linkedin: linkedinRow ? { draftId: linkedinRow.id, status: linkedinRow.status } : null,
    cover: coverRow ? { draftId: coverRow.id, filename: coverRow.schema_json?.filename ?? null, status: coverRow.status } : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (!supabaseAdmin) {
    // No DB → empty bundle (the strip renders its empty state).
    return res.status(200).json({ ok: true, requestId: admin.requestId, ...assemblePipeline([], null) });
  }

  try {
    // Morning thread (newest by title).
    const threadQ = supabaseAdmin
      .from("growth_agent_threads")
      .select("id,title,updated_at")
      .eq("title", MORNING_THREAD_TITLE)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Current content drafts, newest first. The window is the last 48h, NOT just
    // the IST day: a daily-plan article is often drafted on day N, approved on day
    // N, and published on day N+1 (the founder approves when they review, then
    // clicks Publish the next morning). A strict "today only" filter excluded
    // those drafts, so the strip showed empty chips (Article — → LinkedIn — →
    // Cover —) even though the article had just shipped — and the "Review in
    // Issues ↗" link (gated on article?.draftId) vanished with it. 48h covers the
    // approve→publish boundary for a daily cadence while staying bounded (at most
    // ~2 article drafts). assemblePipeline picks the newest kind='article', so a
    // fresh same-day draft still wins over a prior-day published one.
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const draftsQ = supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,schema_json,status,created_at")
      .gte("created_at", since)
      .in("kind", ["article", "linkedin", "cover"])
      .order("created_at", { ascending: false })
      .limit(30);

    const [threadRes, draftsRes] = await Promise.all([threadQ, draftsQ]);

    const thread =
      threadRes.error || !threadRes.data
        ? null
        : { id: threadRes.data.id as string, title: threadRes.data.title as string, updatedAt: threadRes.data.updated_at as string };

    const drafts = (draftsRes.error || !Array.isArray(draftsRes.data) ? [] : draftsRes.data) as PipelineDraft[];

    return res.status(200).json({ ok: true, requestId: admin.requestId, ...assemblePipeline(drafts, thread) });
  } catch {
    // Never 500 on a Supabase hiccup — empty bundle keeps the page usable.
    return res.status(200).json({ ok: true, requestId: admin.requestId, ...assemblePipeline([], null) });
  }
}