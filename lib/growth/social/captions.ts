/**
 * InBharat Growth Agent — Social caption generation.
 *
 * generateCaption(channel, source) produces a channel-aware caption that
 * describes the REAL uploaded inbox material — the model never invents product
 * claims or visuals. Source = optional article meta (title/summary/url/hashtags)
 * and/or inbox folder context (item names + notes). This is the ONLY place the
 * social layer calls a model; visuals always come from the Inbox.
 *
 * Copies promoter.ts's pattern exactly:
 *   pickModel('draft') → isModelConfigured + withinBudget gate → build system+user
 *   → redact() LAST before the call → callGemini → logUsage (await, busts spend
 *   cache) → safe JSON parse. Returns caption:null + a note when no model/budget
 *   so a human writes it (honest degradation — never throws).
 *
 * Channel rules:
 *   instagram — caption ≤2,200 chars; hashtags go in the FIRST COMMENT by default
 *               (returned separately as firstComment), keeping the caption clean.
 *   linkedin  — longer-form, plain text (no markdown); hashtags inline at the end,
 *               ≤5. No firstComment.
 *
 * Server-only. Never touches the chat backend.
 */
import { redact } from "../redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "../model-router.js";
import { callGemini } from "../gemini.js";
import { loadStrategy, formatStrategyBlock } from "../strategy.js";
import { loadGlobalRules, formatRulesBlock } from "../rules.js";
import type { SocialChannel } from "./types.js";

/** Instagram's hard caption limit. */
export const IG_CAPTION_MAX = 2200;

/** Article-side context for a caption. */
export interface CaptionArticleSource {
  title?: string | null;
  summary?: string | null;
  url?: string | null;
  hashtags?: string[] | null;
}

/** Inbox-side context: the real uploaded material the post is built from. */
export interface CaptionInboxSource {
  folder?: string | null;
  /** One entry per media item: its file name + any founder note / alt text. */
  items: { name: string | null; note?: string | null }[];
}

export interface CaptionSource {
  article?: CaptionArticleSource | null;
  inbox?: CaptionInboxSource | null;
}

export interface GeneratedCaption {
  caption: string | null;
  /** Instagram: the hashtag first-comment; null for LinkedIn (inline hashtags). */
  firstComment: string | null;
  note?: string;
}

/** Format the inbox material into a prompt block (the caption must describe THIS). */
function formatInboxSource(inbox?: CaptionInboxSource | null): string {
  if (!inbox || inbox.items.length === 0) return "";
  const lines = inbox.items.map((it, i) => {
    const note = it.note ? ` — note: ${it.note}` : "";
    return `  ${i + 1}. ${it.name ?? "untitled"}${note}`;
  });
  const folder = inbox.folder ? ` (folder: ${inbox.folder})` : "";
  return `UPLOADED MEDIA${folder} — the post's visuals ARE these files; describe only what is really here, invent nothing:\n${lines.join("\n")}`;
}

function formatArticleSource(article?: CaptionArticleSource | null): string {
  if (!article) return "";
  const parts: string[] = [];
  if (article.title) parts.push(`Title: ${article.title}`);
  if (article.summary) parts.push(`Summary: ${article.summary}`);
  if (article.url) parts.push(`URL: ${article.url}`);
  if (article.hashtags && article.hashtags.length) parts.push(`Suggested hashtags: ${article.hashtags.map((h) => "#" + String(h).replace(/\s+/g, "").toLowerCase()).join(" ")}`);
  return parts.length ? `SOURCE ARTICLE:\n${parts.join("\n")}` : "";
}

/**
 * Generate a caption for a channel. Mirrors promoter.ts's generatePromotionDraft
 * gate/redact/log flow. Returns caption:null (+ note) when the model isn't
 * configured, the budget is exhausted, a secret was found, or parsing failed —
 * the route still persists a pending draft so a human writes the caption.
 */
export async function generateCaption(channel: SocialChannel, source: CaptionSource): Promise<GeneratedCaption> {
  const task: GrowthTask = "draft";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { caption: null, firstComment: null, note: "model not configured or monthly budget exhausted" };
  }

  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const rulesBlock = formatRulesBlock(await loadGlobalRules());
  const inboxBlock = formatInboxSource(source.inbox);
  const articleBlock = formatArticleSource(source.article);

  const channelRules =
    channel === "instagram"
      ? `Channel: INSTAGRAM. Write a caption of AT MOST ${IG_CAPTION_MAX} characters — aim for 1–3 short paragraphs, warm and concrete. Do NOT put hashtags in the caption; instead return them separately in "firstComment" as a single line of 3–8 space-separated #tags (lowercase, no spaces inside a tag). The caption must reflect the uploaded media above.`
      : `Channel: LINKEDIN. Write a longer-form, plain-text post (no markdown — LinkedIn renders **bold**/## as literal characters). One hook line, 2–4 short practical paragraphs, then a trailing line of NO MORE THAN 5 hashtags inline (space-separated #tags, lowercase). Leave "firstComment" null (LinkedIn keeps hashtags inline). The post must reflect the uploaded media above.`;

  const system =
    "You are a B2B social content assistant for InBharat AI, an Indian AI product studio. " +
    "You write concise, hype-free social captions for a founder-authored account. " +
    "CRITICAL: the visuals are real files the founder uploaded (listed below) — describe ONLY what is actually in those files. NEVER invent product features, metrics, or claims that are not in the source article or the founder's notes. " +
    "Respond ONLY with compact JSON: {\"caption\": string, \"firstComment\": string | null}. " +
    channelRules +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "") +
    (articleBlock ? `\n\n${articleBlock}` : "");

  const user =
    `Write the ${channel} caption now, grounded in the uploaded media and (if present) the source article. Return JSON only.`;

  // Redaction runs LAST before the model call (project rule) — defensive even
  // for marketing copy, since folder notes / file names are founder-supplied.
  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return { caption: null, firstComment: null, note: "redacted secret in prompt; aborted model call" };
  }

  try {
    const raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 700 });
    const parsed = safeParseJson(raw);
    let caption = typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null;
    let firstComment = typeof parsed?.firstComment === "string" && parsed.firstComment.trim() ? parsed.firstComment.trim() : null;
    // Enforce the Instagram caption ceiling defensively (the model may overshoot).
    if (channel === "instagram" && caption && caption.length > IG_CAPTION_MAX) caption = caption.slice(0, IG_CAPTION_MAX);
    // LinkedIn keeps hashtags inline — never a first comment.
    if (channel === "linkedin") firstComment = null;

    const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
    // Await (not fire-and-forget) so the spend cache busts BEFORE this returns —
    // matches promoter.ts (a batch compose loop would otherwise soft-bypass budget).
    await logUsage({
      model: choice.model,
      task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: Math.ceil((raw?.length ?? 0) / 4),
      totalTokens,
      costUsd: estimateCost(choice, totalTokens),
      status: caption ? "ok" : "parse_failed",
      contextUrl: source.article?.url ?? (source.inbox?.folder ? `inbox:${source.inbox.folder}` : undefined),
      provider: choice.provider,
    });

    if (!caption) return { caption: null, firstComment: null, note: "model returned no usable caption" };
    return { caption, firstComment };
  } catch (e) {
    return { caption: null, firstComment: null, note: `model call failed: ${(e as Error).message}` };
  }
}

function safeParseJson(raw: string): { caption?: unknown; firstComment?: unknown } | null {
  try {
    return JSON.parse(raw) as { caption?: unknown; firstComment?: unknown };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { caption?: unknown; firstComment?: unknown };
    } catch {
      return null;
    }
  }
}
