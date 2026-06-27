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
import { articlePath } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";
import type { ArticleMeta } from "../../content/articles.meta.js";

export interface CoverDraft {
  taskId: string | null;
  draftId: string | null;
  url: string;
  filename: string;
  status: "pending" | "skipped";
  note?: string;
}

/**
 * Draft an on-brand cover image for an article that has no `visual` set.
 * Idempotent: returns {status:'skipped'} if a cover draft already exists for
 * the article URL (any state). Never throws.
 */
export async function generateCoverDraft(meta: ArticleMeta): Promise<CoverDraft> {
  const url = SITE.url + articlePath(meta.slug);
  const filename = `${meta.slug}.png`;

  if (await hasExistingCoverDraft(url)) {
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

  const prompt = buildCoverPrompt(meta);
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
    const img = await callGeminiImage(choice, prompt, { timeoutMs: 90000 });
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
  void logUsage({
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
  const { taskId, draftId } = await persistCoverDraft(url, meta.title, filename, prompt, pngBase64, mimeType, choice, costUsd);
  await logInfo("cover-drafted", url, `kind=cover status=pending file=${filename}`).catch(() => undefined);
  return { taskId, draftId, url, filename, status: "pending" };
}

/** Build a brand-faithful, TEXT-FREE cover prompt from article metadata. */
function buildCoverPrompt(meta: ArticleMeta): string {
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
    "",
    "HARD CONSTRAINTS:",
    "- ABSOLUTELY NO TEXT, no words, no letters, no numbers, no logos, no watermarks anywhere in the image.",
    "- The page renders the article title separately over the image, so the image must be text-free.",
    "- No photographic faces. No clutter. Abstract shapes only.",
    "",
    `TOPIC: ${meta.title}`,
    `CATEGORY: ${meta.category}`,
    meta.abstract ? `SUMMARY: ${meta.abstract.slice(0, 400)}` : "",
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
      .eq("url", url)
      .eq("kind", "cover")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}