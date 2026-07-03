import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isCronAuthErr, authorizeCron } from "../../lib/requireAdmin.js";
import { logInfo, logError } from "../../../lib/growth/authorization.js";
import { runAgentTurn, ensureNamedThread } from "../../../lib/growth/agent.js";
import { pickNextCalendarTopic } from "../../../lib/growth/calendar.js";
import { BUILD_WITH_REETURAJ_CALENDAR } from "../../../content/build-with-reeturaj-calendar.js";
import { ARTICLES } from "../../../content/articles.meta.js";
import { supabaseAdmin } from "../../../api/lib/supabaseAdmin.js";
import { SITE } from "../../../seo.config.js";

export const MORNING_THREAD_TITLE = "Build with Reeturaj — Daily Plan";
const ARTICLE_PREFIX = "/learn-ai-with-reeturaj/";

/**
 * Daily 8am IST (02:30 UTC) "Build with Reeturaj" auto-plan + draft run.
 *
 * Picks the next unbuilt topic from the founder's content calendar (or, when the
 * calendar is exhausted, instructs the agent to free-plan a fresh trending topic
 * via web_search), then drives ONE runAgentTurn that drafts the article + its
 * LinkedIn caption + its cover — all as HUMAN-GATED pending drafts in a single
 * stable "Build with Reeturaj — Daily Plan" thread the founder reviews each
 * morning. Nothing is ever published here; publishArticle stays gated on
 * status='approved' + admin auth, and the agent never publishes.
 *
 * Invoked three ways, all authenticated by authorizeCron (same as daily.ts):
 *   - Vercel's scheduled cron (GET, user-agent vercel-cron) — the 8am run.
 *   - An external scheduler carrying CRON_SECRET.
 *   - An authenticated admin hitting "Run morning plan now" in the dashboard (POST).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const cron = await authorizeCron(req);
  if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);

  await logInfo("cron-morning-start", "global", `trigger=${cron.source}`);

  try {
    const threadId = await ensureNamedThread(MORNING_THREAD_TITLE);

    // Published slugs (from the article manifest) — never re-draft a live article.
    const publishedSlugs = new Set(ARTICLES.map((a) => a.slug));

    // Drafted slugs (pending/approved 'article' drafts) — skip ones already queued.
    const draftedSlugs = await loadDraftedArticleSlugs();

    const pick = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, publishedSlugs, draftedSlugs);
    const prompt = buildMorningPrompt(pick, draftedSlugs);

    await logInfo(
      "cron-morning-pick",
      "global",
      `topic=${pick ? pick.topic : "free-plan"} published=${publishedSlugs.size} drafted=${draftedSlugs.length}`,
    );

    const result = await runAgentTurn(prompt, threadId, []);

    await logInfo(
      "cron-morning-done",
      "global",
      `trigger=${cron.source} topic=${pick ? pick.topic : "free-plan"} ok=${result.ok} tools=${result.turnTools.map((t) => `${t.name}:${t.ok ? "ok" : "fail"}`).join(",") || "none"} thread=${threadId}`,
    );
    // The agent turn can return ok:false (e.g. note "model not configured" / "no
    // db" / "budget exhausted") — meaning ZERO drafts were created. Previously the
    // cron reported body `ok:true` regardless, so a morning run that drafted
    // nothing looked successful to the founder + the "Run morning plan now" UI.
    // Surface the agent outcome honestly: body `ok` = the agent outcome (the cron
    // still returns HTTP 200 because the cron itself executed — Vercel monitors
    // HTTP status, not body.ok), and log a distinct error line for a failed agent
    // turn so it's visible in the insights error feed, not buried in the done-log.
    if (!result.ok) {
      await logError("cron-morning-agent-fail", "global", `note=${result.note ?? "unknown"} reply=${(result.reply ?? "").slice(0, 200)}`).catch(() => undefined);
    }
    // The agent turn returned ok:true but made ZERO tool calls — the model
    // narrated a call in prose ("Called tool write_article(...)") instead of
    // emitting a real functionCall, or answered in text without doing the work.
    // The body stays ok:true (the turn didn't crash) so this used to look like a
    // successful run while drafting NOTHING. Surface it as a distinct error line
    // so the scheduled 8am run's silent zero-draft is visible in the error feed,
    // not buried in the done-log. (The dashboard "Run morning plan now" UI also
    // gates success on write_article actually running, via toolTrail.)
    if (result.ok && result.turnTools.length === 0) {
      await logError("cron-morning-no-tools", "global", `topic=${pick ? pick.topic : "free-plan"} note=${result.note ?? "none"} reply=${(result.reply ?? "").slice(0, 200)}`).catch(() => undefined);
    }

    return res.status(200).json({
      ok: result.ok,
      requestId: cron.requestId,
      trigger: cron.source,
      threadId,
      topic: pick ? pick.topic : "free-plan",
      mode: pick ? "calendar" : "free-plan",
      reply: result.reply,
      note: result.note ?? null,
      // The tool trail for THIS run (name + ok + short message, execution order)
      // so "Run morning plan now" can show the founder exactly which tools ran
      // and what each returned — e.g. write_article → fail: "article model not
      // configured or monthly budget exhausted". Empty when the model answered in
      // text with no tool calls (or failed before any tool ran).
      toolTrail: result.turnTools,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logInfo("cron-morning-fail", "global", msg).catch(() => undefined);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: msg, requestId });
  }
}

/**
 * Load the slugs of existing 'article' drafts (any status) so the morning run
 * skips topics already queued/published-as-draft. Best-effort: on any error or
 * when Supabase is absent, returns [] (the picker then treats nothing as
 * drafted — safe, just means a topic could re-draft; the founder sees a
 * duplicate pending draft and ignores it). Capped at 200 rows.
 */
async function loadDraftedArticleSlugs(): Promise<string[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("schema_json")
      .eq("kind", "article")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) {
      // Surface the failure instead of silently returning [] — a DB blip here
      // used to make the morning cron re-draft an already-queued topic with no
      // signal. Returning [] is still the safe behavior (picker treats nothing
      // as drafted) but now the error is visible in the insights error feed.
      await logError("morning-load-drafted-slugs-fail", "global", error?.message || "no data returned").catch(() => undefined);
      return [];
    }
    const slugs: string[] = [];
    for (const row of data as Array<{ schema_json?: unknown }>) {
      const sj = row.schema_json as { slug?: unknown } | null;
      if (sj && typeof sj.slug === "string" && sj.slug) slugs.push(sj.slug);
    }
    return slugs;
  } catch (e) {
    await logError("morning-load-drafted-slugs-fail", "global", (e as Error).message).catch(() => undefined);
    return [];
  }
}

/**
 * Compose the steering prompt for the morning run. When the calendar has an
 * unbuilt topic, name it directly; when exhausted, instruct a web_search-backed
 * free-plan that avoids already-published slugs. The common footer drives the
 * full three-draft workflow (article → LinkedIn caption → cover) and forbids
 * approving/publishing.
 */
function buildMorningPrompt(pick: { topic: string; category: string; angle?: string } | null, draftedSlugs: string[] = []): string {
  const publishedList = ARTICLES.map((a) => `- ${a.slug} (${a.title})`).join("\n");
  // Free-plan must avoid BOTH published slugs AND slugs already queued as pending/
  // approved article drafts — otherwise a re-run re-drafts a topic that's already
  // sitting in Issues awaiting review. (Calendar-pick already filters via
  // pickNextCalendarTopic; this covers the free-plan branch the picker can't.)
  const draftedSet = new Set(draftedSlugs);
  const draftedList = draftedSlugs.map((s) => `- ${s}`).join("\n");
  const head = pick
    ? [
        "It is the daily morning content run for the 'Build with Reeturaj' series on inbharat.ai/learn-ai-with-reeturaj.",
        "The founder's content calendar has selected today's topic for you:",
        "",
        `Topic: ${pick.topic}`,
        `Category: ${pick.category}`,
        pick.angle ? `Angle: ${pick.angle}` : "",
        "",
        "Draft this article now.",
      ].filter(Boolean).join("\n")
    : [
        "It is the daily morning content run for the 'Build with Reeturaj' series on inbharat.ai/learn-ai-with-reeturaj.",
        "The founder's content calendar has no unbuilt topics left, so plan today's yourself:",
        "1. Call web_search to find a current, trending AI topic relevant to Indian builders that we have NOT already covered.",
        "2. Pick one topic. Keep it practical, hype-free, founder-voice — the same style as the series.",
        "",
        "Already-published slugs (do NOT duplicate these):",
        publishedList,
        draftedSet.size > 0 ? `\nAlready-drafted (pending/approved) slugs (do NOT duplicate these either — they're already in Issues):\n${draftedList}` : "",
        "",
        "Then draft that article.",
      ].filter(Boolean).join("\n");

  return (
    head +
    "\n\n" +
    [
      "WORKFLOW (do all three, in order — each step DEPENDS on the one before):",
      `1. Call write_article with the topic (and the angle as the instruction if given). It returns a draftId + slug for a NEW article.`,
      `2. ONLY IF step 1 returned ok:true with a draftId + slug: call promote_article with url = "${SITE.url}${ARTICLE_PREFIX}" + the EXACT slug returned by step 1. This drafts the companion LinkedIn caption for the NEW article you just drafted.`,
      "3. ONLY IF step 1 returned ok:true with a draftId: call generate_cover with draftId = the write_article draft id from step 1.",
      "",
      "Then report back, in the founder's voice, in 3–5 short lines: the topic you picked, the article title + slug, and the three draft ids (article / LinkedIn / cover). Tell the founder to review + approve in Issues to publish.",
      "",
      "HARD RULES:",
      "- Do NOT approve or publish anything. Drafts only — the founder reviews.",
      "- Do NOT call write_article more than once for this run (one article).",
      "- This run is for ONE NEW article only. Do NOT call promote_article or generate_cover for any ALREADY-PUBLISHED article (a URL/slug from the published list above, or any slug you did not create in step 1 of THIS run). The founder already has LinkedIn captions for published articles — re-promoting them clutters the review queue with old content.",
      "- If write_article (step 1) returns ok:false — model not configured, budget exhausted, parse failure, anything — STOP. Do NOT call promote_article or generate_cover. Relay the failure reason in your final note and tell the founder what to fix (set GEMINI_API_KEY / raise the budget). Steps 2 and 3 are meaningless without a new article from step 1.",
      "- If a later step returns ok:false, relay the reason in your final note; do not retry blindly.",
    ].join("\n")
  );
}