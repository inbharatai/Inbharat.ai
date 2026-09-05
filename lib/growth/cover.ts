/**
 * InBharat Growth Agent — Module: Auto-cover drafting.
 *
 * For every "Build AI with Reeturaj" article that has no `visual` set, the
 * daily cron asks gemini-2.5-flash-image (the ONLY Gemini model that emits
 * images) to draft an on-brand 1200×630 hero illustration and stores it as a
 * human-gated `growth_drafts` row (kind:'cover', status:'pending'). The founder
 * approves it in the Issues tab; the publish step then commits the PNG +
 * edits articles.meta.ts to GitHub (Vercel auto-rebuilds). Nothing is ever
 * published automatically (same gate as the LinkedIn drafts).
 *
 * Why no text on the cover: ArticlePage renders the title SEPARATELY over a
 * gradient overlay, so the image itself must be text-free (a model-drawn
 * "title" would clash with the rendered one and look unprofessional).
 *
 * Idempotent: hasExistingCoverDraft skips any article that already has any
 * cover draft (pending/approved/rejected/published), so the cron only drafts
 * a cover once per article. Uses the Growth Agent's own model-router +
 * callGeminiImage; redact() runs on the prompt last. Never throws; no-ops when
 * the cover model is unconfigured or the budget is exhausted (status 'skipped').
 *
 * Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { logInfo } from "./authorization.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCoverCost, type GrowthTask } from "./model-router.js";
import { callGeminiImage } from "./gemini.js";
import { articlePath, ARTICLE_HUB_PATH, ARTICLES } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";
import type { ArticleMeta } from "../../content/articles.meta.js";
import { inBharatUrlAliases } from "./siteUrl.js";

export interface CoverDraft {
  taskId: string | null;
  draftId: string | null;
  url: string;
  filename: string;
  status: "pending" | "skipped";
  note?: string;
}

/** The fields a cover prompt actually uses — both published articles and
 *  not-yet-published article drafts supply these. */
interface CoverPromptFields {
  title: string;
  category?: string;
  abstract?: string;
}

/** Optional style reference: a founder-supplied sample cover whose visual
 *  style (palette, composition, motif language) the new cover should match so
 *  every cover looks like one family. The bytes are passed inline to the image
 *  model and never persisted beyond the growth_drafts audit row. */
export interface CoverStyleSample {
  base64: string;
  mimeType: string;
  /** Where the sample came from (inbox item id / path) — recorded for audit. */
  source: string;
}

/**
 * Draft an on-brand cover image for an article that has no `visual` set.
 * Idempotent: returns {status:'skipped'} if a cover draft already exists for
 * the article URL (any state). Never throws. Pass `sample` to match a
 * founder-supplied cover's visual style.
 */
export async function generateCoverDraft(
  meta: ArticleMeta,
  sample?: CoverStyleSample,
  opts?: { force?: boolean },
): Promise<CoverDraft> {
  return runCoverGeneration(SITE.url + articlePath(meta.slug), `${meta.slug}.png`, meta, sample, opts);
}

/**
 * Draft an on-brand cover for a NOT-YET-PUBLISHED article draft. Same brand
 * prompt + idempotency + gates as generateCoverDraft, but the slug/title/
 * category/abstract come from the draft's schema_json (set by write_article /
 * review_text) instead of the published articles.meta registry. Used by the
 * conversational agent's generate_cover tool so the founder can draft an
 * article AND its cover in one flow, before anything is live. Never throws.
 */
export async function generateCoverDraftFromFields(
  fields: { slug: string; title: string; category?: string; abstract?: string },
  sample?: CoverStyleSample,
  opts?: { force?: boolean },
): Promise<CoverDraft> {
  return runCoverGeneration(SITE.url + articlePath(fields.slug), `${fields.slug}.png`, fields, sample, opts);
}

/** Shared core: idempotency gate → budget/config gate → redact → image call →
 *  persist. Both the published-article and draft-article paths funnel here so
 *  there is exactly one place that spends cover-model budget. Never throws. */
async function runCoverGeneration(
  url: string,
  filename: string,
  fields: CoverPromptFields,
  sample?: CoverStyleSample,
  opts?: { force?: boolean },
): Promise<CoverDraft> {
  // The idempotency gate keeps the cron from re-drafting a cover for an article
  // that already has one. `force` bypasses it for an EXPLICIT founder "load a
  // new cover" action (the on-demand Generate/Regenerate buttons) — so the
  // founder can replace a cover they don't like even when a draft (pending or
  // published) already exists. The cron never sets force.
  if (!opts?.force && (await hasExistingCoverDraft(url))) {
    return { taskId: null, draftId: null, url, filename, status: "skipped", note: "cover draft already exists" };
  }

  const task: GrowthTask = "cover";
  const choice = pickModel(task);
  if (!isModelConfigured(choice)) {
    return { taskId: null, draftId: null, url, filename, status: "skipped", note: "cover model not configured (GEMINI_API_KEY)" };
  }
  if (!(await withinBudget())) {
    return { taskId: null, draftId: null, url, filename, status: "skipped", note: "monthly budget exhausted" };
  }

  const prompt = buildCoverPrompt(fields, !!sample);
  // Redact LAST before the model call (project rule). The prompt is built from
  // article metadata (titles/abstracts), which can occasionally quote user
  // content — redact defensively even though it's our own copy.
  const redacted = redact(prompt);
  if (redacted.containedSecret) {
    await logInfo("cover-redact", url, "redacted secret in cover prompt; aborted").catch(() => undefined);
    return { taskId: null, draftId: null, url, filename, status: "skipped", note: "redacted secret in prompt; aborted" };
  }

  let pngBase64: string;
  let mimeType: string;
  try {
    const img = await callGeminiImage(choice, prompt, {
      timeoutMs: 90000,
      ...(sample ? { referenceImage: { base64: sample.base64, mimeType: sample.mimeType } } : {}),
    });
    pngBase64 = img.pngBase64;
    mimeType = img.mimeType;
  } catch (e) {
    void logUsage({
      model: choice.model, task,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: 0,
      totalTokens: Math.ceil(prompt.length / 4),
      costUsd: 0, status: "model_error", contextUrl: url, provider: choice.provider,
    });
    await logInfo("cover-gen-fail", url, (e as Error).message).catch(() => undefined);
    return { taskId: null, draftId: null, url, filename, status: "skipped", note: `cover model call failed: ${(e as Error).message}` };
  }

  const costUsd = estimateCoverCost();
  // Await (not fire-and-forget) so the spend cache busts before this returns —
  // the Auto Mode cover loop calls generateCoverDraft in sequence, and covers
  // are the most expensive item (~$0.04 each), so a stale cache could let the
  // loop overshoot the cap. logUsage catches its own errors, so awaiting is safe.
  await logUsage({
    model: choice.model, task,
    // Image gen has no token counts; record the prompt size only for audit.
    promptTokens: Math.ceil(prompt.length / 4),
    completionTokens: 0,
    totalTokens: 0,
    costUsd, status: "ok", contextUrl: url, provider: choice.provider,
  });

  // Persist a growth_tasks row + a linked growth_drafts row (kind 'cover').
  // schema_json carries the PNG base64 so the admin UI can render a preview and
  // the publish step can commit it — the bytes never enter the client bundle
  // (Issues.tsx reads them from the draft, which is admin-only).
  const { taskId, draftId } = await persistCoverDraft(url, fields.title, filename, prompt, pngBase64, mimeType, choice, costUsd, sample?.source);
  await logInfo("cover-drafted", url, `kind=cover status=pending file=${filename}`).catch(() => undefined);
  return { taskId, draftId, url, filename, status: "pending" };
}

/** Build a brand-faithful, TEXT-FREE cover prompt from article fields. When
 *  `hasSample` is true, a style-reference image is sent alongside this prompt
 *  (see callGeminiImage referenceImage) and the prompt tells the model to match
 *  that sample's visual language so every cover stays consistent.
 *
 *  Pure + side-effect-free. Used by generateCoverDraft; exported so external
 *  tooling can reuse the EXACT brand prompt without a drift-prone copy. */
export function buildCoverPrompt(fields: CoverPromptFields, hasSample = false): string {
  return [
    "Generate a single 1200x630 pixel hero illustration for a tech article,",
    "landscape orientation, cinematic, high-contrast, premium editorial quality.",
    "",
    "BRAND STYLE (mandatory):",
    "- Dark navy-to-black gradient background (#0d1117 to #11161f).",
    "- A warm orange radial glow (#f59f4f) at low opacity, off-center upper area.",
    "- One thin solid orange (#f59f4f) accent line or bar along the bottom edge.",
    "- Minimalist, abstract, geometric motif suggesting the topic — no people.",
    "- Modern, clean, subtle; lots of negative space in the center.",
    hasSample
      ? "- STYLE REFERENCE: a sample cover is attached. Match its palette, composition, motif language, and overall visual style EXACTLY so this cover looks like one consistent family with the sample. Keep the brand rules above; only the motif/abstract shape changes to fit this article's topic."
      : "",
    "",
    "HARD CONSTRAINTS:",
    "- ABSOLUTELY NO TEXT, no words, no letters, no numbers, no logos, no watermarks anywhere in the image.",
    "- The page renders the article title separately over the image, so the image must be text-free.",
    "- No photographic faces. No clutter. Abstract shapes only.",
    "",
    `TOPIC: ${fields.title}`,
    `CATEGORY: ${fields.category ?? "AI Foundations"}`,
    fields.abstract ? `SUMMARY: ${fields.abstract.slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Insert a growth_tasks row (type 'cover') + a linked growth_drafts row
 * (kind 'cover', status 'pending'). The PNG base64 lives in schema_json so the
 * admin preview + the publish step can both reach it without a second fetch.
 * Best-effort; never throws.
 */
async function persistCoverDraft(
  url: string,
  title: string,
  filename: string,
  prompt: string,
  pngBase64: string,
  mimeType: string,
  choice: ReturnType<typeof pickModel>,
  costUsd: number,
  styleSampleSource?: string,
): Promise<{ taskId: string | null; draftId: string | null }> {
  if (!supabaseAdmin) return { taskId: null, draftId: null };
  try {
    let taskId: string | null = null;
    const taskInsert = await supabaseAdmin
      .from("growth_tasks")
      .insert({
        type: "cover",
        scope: url,
        title: `Cover image: ${title}`,
        description: "Generate an on-brand 1200x630 hero cover for this article (human-gated).",
        priority: "normal",
        status: "open",
        source: "cover",
        payload: { url, kind: "cover", filename },
      })
      .select("id")
      .single();
    if (taskInsert.data?.id) taskId = taskInsert.data.id as string;

    let draftId: string | null = null;
    const draftInsert = await supabaseAdmin
      .from("growth_drafts")
      .insert({
        task_id: taskId,
        kind: "cover",
        url,
        title,
        body_md: null,
        schema_json: {
          pngBase64,
          mimeType,
          filename,
          prompt,
          model: choice.model,
          provider: choice.provider,
          costUsd,
          status: "pending",
          ...(styleSampleSource ? { styleSampleSource } : {}),
        },
        status: "pending",
      })
      .select("id")
      .single();
    if (draftInsert.data?.id) draftId = draftInsert.data.id as string;
    return { taskId, draftId };
  } catch (e) {
    await logInfo("cover-persist-fail", url, (e as Error).message).catch(() => undefined);
    return { taskId: null, draftId: null };
  }
}

/**
 * Idempotency gate: true if a cover draft (any state) already exists for the
 * article URL, so the cron never re-drafts a cover for the same article.
 */
export async function hasExistingCoverDraft(url: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin
      .from("growth_drafts")
      .select("id")
      .in("url", inBharatUrlAliases(url))
      .eq("kind", "cover")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Delete pending/approved/rejected cover drafts for an article URL.
 * Published rows are intentionally kept as audit history and never deleted.
 * Used when a stale cover must be replaced with a fresh one at article publish
 * time, or when the founder explicitly requests a redesign. Never throws.
 */
export async function clearUnpublishedCoverDrafts(url: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("growth_drafts")
      .delete()
      .in("url", inBharatUrlAliases(url))
      .eq("kind", "cover")
      .in("status", ["pending", "approved", "rejected"]);
    if (error) await logInfo("cover-clear-unpublished-fail", url, error.message).catch(() => undefined);
  } catch {
    // best-effort
  }
}

/**
 * Fetch a canonical existing cover (live on the site) to use as a STYLE
 * REFERENCE so every new cover matches the family — the founder's "keep it
 * exactly as we have in the other articles" requirement. Tries a curated list of
 * flagship covers in order and returns the first that loads. Best-effort: returns
 * null on any failure (the brand prompt alone still produces a family-consistent
 * cover, so a missing sample is a graceful degradation, not a hard failure).
 * Bytes are passed inline to the image model and never persisted by this helper.
 */
export async function fetchStyleSample(): Promise<CoverStyleSample | null> {
  // Source style-sample candidates from the live article manifest (ARTICLES with
  // a `visual` set) rather than a hardcoded slug list. The old hardcoded list
  // (`harness-engineering`, `what-are-ai-agents`, `generative-ai`, `rag`) broke
  // silently when slugs changed and only worked when `visual === `${slug}.png``
  // — several articles use truncated visual filenames (e.g.
  // `building-unoone-leaf-indias-local-agi-fabric.png`), so a slug-derived URL
  // 404s. Using the actual `visual` filename always hits the right asset.
  const candidates = ARTICLES
    .filter((a) => typeof a.visual === "string" && a.visual.endsWith(".png"))
    .slice(0, 8)
    .map((a) => a.visual as string);
  for (const visual of candidates) {
    const url = `${SITE.url}${ARTICLE_HUB_PATH}/${visual}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) continue; // guard against an empty/error placeholder
      return { base64: buf.toString("base64"), mimeType: "image/png", source: `live-cover:${visual}` };
    } catch {
      continue;
    }
  }
  return null;
}