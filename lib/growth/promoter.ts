/**
 * InBharat Growth Agent — Module: Article Promoter.
 *
 * Generates a human-gated LinkedIn syndication draft for a "Build AI with
 * Reeturaj" article + 2–3 suggested internal-link targets, and persists a
 * growth_tasks row (type 'internal-link') + a growth_drafts row (kind
 * 'linkedin', status 'pending'). Nothing is ever published automatically —
 * canPublishDirectly is false and requiresHumanApproval is true in the
 * authorized-assets registry; a human approves via /api/growth/approvals.
 *
 * Completely separate from the chat backend: uses the Growth Agent's own
 * model-router (pickModel('draft')) + GROWTH_OPENAI_API_KEY / GEMINI_API_KEY,
 * never api/lib/serverLLM.ts. Runs redaction.ts before any model call.
 *
 * Server-only. Never touches the chat backend.
 */
import { assertAuthorized, logInfo } from "./authorization.js";
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { fetchPage, parsePage } from "./crawler.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { loadRulesForUrl, formatRulesBlock } from "./rules.js";
import { ARTICLES, articlePath } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";

export interface ArticlePageMeta {
  title?: string;
  description?: string;
  abstract?: string;
}

export interface PromoteDraft {
  taskId: string | null;
  draftId: string | null;
  url: string;
  caption: string | null;
  internalLinks: string[];
  status: "pending" | "skipped";
  note?: string;
}

const ARTICLE_PATH_PREFIX = "/learn-ai-with-reeturaj/";

/** Sibling article URLs + titles the model may suggest as internal links. */
const SIBLING_ARTICLES = ARTICLES.map((a) => ({
  url: SITE.url + articlePath(a.slug),
  title: a.title,
  category: a.category,
}));

/**
 * Promote a single article URL. Idempotent: if a 'linkedin' draft already
 * exists for this URL, returns {status:'skipped'} instead of re-drafting (so
 * the daily cron doesn't regenerate the same caption every day).
 */
export async function promoteArticle(
  url: string,
  pageMeta?: ArticlePageMeta,
): Promise<PromoteDraft> {
  // Deny-by-default guard. Throws AuthorizationError if the domain isn't
  // authorized for 'draft' (inbharat.ai is; canPublishDirectly stays false).
  assertAuthorized("draft", url);
  const scope = new URL(url).hostname.replace(/^www\./, "");

  // Idempotency: skip if a linkedin draft already exists for this URL.
  if (await hasExistingDraft(url)) {
    await logInfo("promote-skip", scope, `linkedin draft already exists for ${url}`);
    return { taskId: null, draftId: null, url, caption: null, internalLinks: [], status: "skipped", note: "linkedin draft already exists" };
  }

  // Gather article context. Prefer caller-supplied meta; else fetch the page.
  const ctx = pageMeta?.title || pageMeta?.description
    ? { title: pageMeta.title, description: pageMeta.description, abstract: pageMeta.abstract }
    : await fetchArticleContext(url);

  const title = ctx.title || url;
  const description = ctx.description || "";
  const abstract = ctx.abstract || description;

  // Generate the caption + internal-link suggestions (or skip if no model/budget).
  const generated = await generatePromotionDraft(url, title, description, abstract);

  // Persist a growth_tasks row + a growth_drafts row.
  const { taskId, draftId } = await persistDraft(url, title, generated.caption, generated.internalLinks, generated.note);

  await logInfo(
    "promote-draft",
    scope,
    generated.caption
      ? `drafted linkedin caption for ${url} (${generated.internalLinks.length} internal links)`
      : `created pending draft for ${url} (caption needs manual write: ${generated.note || "model unavailable"})`,
  );

  return {
    taskId,
    draftId,
    url,
    caption: generated.caption,
    internalLinks: generated.internalLinks,
    status: "pending",
    note: generated.note,
  };
}

/** Fetch <title> + meta description from the live URL (best-effort).
 *  SSRF guard: assertAuthorized checked the input URL, but fetchPage follows
 *  redirects. If the final destination lands on a different registrable domain
 *  (e.g. an open redirect on an authorized host → internal/cloud-metadata URL),
 *  refuse to parse it. */
async function fetchArticleContext(url: string): Promise<ArticlePageMeta> {
  try {
    const { html, status, finalUrl } = await fetchPage(url);
    if (status >= 400) return {};
    if (finalUrl && normalizeDomain(finalUrl) !== normalizeDomain(url)) {
      await logInfo("promote-ssrf-guard", new URL(url).hostname, `redirect ${url} → ${finalUrl} blocked`);
      return {};
    }
    const meta = parsePage(html, finalUrl || url);
    return { title: meta.title, description: meta.metaDescription };
  } catch {
    return {};
  }
}

/** Strip scheme + path + leading www. for same-registrable-domain comparison. */
function normalizeDomain(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function hasExistingDraft(url: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin
      .from("growth_drafts")
      .select("id")
      .eq("url", url)
      .eq("kind", "linkedin")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

interface GeneratedDraft {
  caption: string | null;
  internalLinks: string[];
  note?: string;
}

/**
 * Call the Growth Agent's draft model (Gemini or OpenAI) to produce a JSON
 * {caption, internalLinks}. If the model isn't configured or the monthly
 * budget is exhausted, returns caption:null so a human can write it manually
 * — the task + draft rows are still created.
 */
async function generatePromotionDraft(
  url: string,
  title: string,
  description: string,
  abstract: string,
): Promise<GeneratedDraft> {
  const task: GrowthTask = "draft";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { caption: null, internalLinks: [], note: "model not configured or monthly budget exhausted" };
  }

  const slug = url.includes(ARTICLE_PATH_PREFIX) ? url.split(ARTICLE_PATH_PREFIX)[1]?.replace(/\/+$/, "") : "";
  const cat = ARTICLES.find((a) => a.slug === slug)?.category;
  // Token efficiency: prefer same-category siblings, then fill, cap at 8 (not
  // all 11) so the candidate list stays lean. Idempotency already bounds total
  // model calls to one per article, so this trims each call's prompt ~30%.
  const siblings = SIBLING_ARTICLES
    .filter((s) => !slug || !s.url.endsWith(`/${slug}`))
    .map((s) => ({ s, sameCat: s.category === cat }))
    .sort((a, b) => Number(b.sameCat) - Number(a.sameCat))
    .slice(0, 8)
    .map(({ s }) => `- ${s.title} → ${s.url}`)
    .join("\n");

  // Founder-authored rules (agent "memory") — global + this URL's domain.
  // Appended to the system prompt BEFORE redact() so they ride inside the
  // redacted payload (never sent raw if a secret sneaks in). Empty when no
  // rules exist yet (pre-migration / DB absent) — prompt is unchanged.
  const rulesBlock = formatRulesBlock(await loadRulesForUrl(url));

  const system =
    "You are a B2B content syndication assistant for InBharat AI, an Indian AI product studio. " +
    "You write concise, practical, hype-free LinkedIn post drafts that tease a founder-authored article and drive clicks to the article URL. " +
    "You also suggest 2–3 internal links (other InBharat article URLs or the hub) to weave into the post. " +
    "Respond ONLY with compact JSON: {\"caption\": string, \"internalLinks\": string[]}." +
    (rulesBlock ? `\n\n${rulesBlock}` : "");

  const user =
    `Article URL: ${url}\n` +
    `Article title: ${title}\n` +
    `Article description: ${description}\n` +
    `Abstract: ${abstract}\n\n` +
    `Author: Reeturaj Goswami, founder of InBharat.ai.\n` +
    `Hub: ${SITE.url}${ARTICLE_PATH_PREFIX}\n\n` +
    `Candidate sibling articles to link to (pick 2–3 most topically relevant):\n${siblings}\n\n` +
    `Write a 60–90 word LinkedIn caption in the founder's voice: one hook line, a 1–2 line practical teaser (no jargon, no hype), and a CTA to read the full article. ` +
    `Then list 2–3 internalLinks from the candidates above (full URLs). Return JSON only.`;

  // Redact before any model call (defensive — public marketing copy, but cheap).
  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return { caption: null, internalLinks: [], note: "redacted secret in prompt; aborted model call" };
  }

  try {
    const raw = await callModel(choice, system, user);
    const parsed = safeParseJson(raw);
    const caption = typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null;
    const internalLinks = Array.isArray(parsed?.internalLinks)
      ? parsed.internalLinks.filter((x) => typeof x === "string" && /^https?:\/\//.test(x)).slice(0, 3)
      : [];
    // Rough token estimate for usage logging (chars/4 heuristic).
    const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
    void logUsage({
      model: choice.model,
      task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: Math.ceil((raw?.length ?? 0) / 4),
      totalTokens,
      costUsd: estimateCost(choice, totalTokens),
      status: caption ? "ok" : "parse_failed",
      // So the admin "where used" view can attribute spend to this article.
      contextUrl: url,
      provider: choice.provider,
    });
    if (!caption) return { caption: null, internalLinks, note: "model returned no usable caption" };
    return { caption, internalLinks };
  } catch (e) {
    return { caption: null, internalLinks: [], note: `model call failed: ${(e as Error).message}` };
  }
}

/** Call Gemini or OpenAI directly (separate from the chat backend's serverLLM). */
async function callModel(
  choice: ReturnType<typeof pickModel>,
  system: string,
  user: string,
): Promise<string> {
  if (choice.provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${choice.model}:generateContent?key=${key}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 320 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("gemini empty response");
    return text;
  }
  // openai — Growth Agent uses its OWN key (never the chat backend's OPENAI_API_KEY).
  const key = process.env.GROWTH_OPENAI_API_KEY;
  if (!key) throw new Error("GROWTH_OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: choice.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 320,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`openai HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("openai empty response");
  return text;
}

function safeParseJson(raw: string): { caption?: unknown; internalLinks?: unknown } | null {
  try {
    return JSON.parse(raw) as { caption?: unknown; internalLinks?: unknown };
  } catch {
    // Model may wrap JSON in prose — try to extract the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as { caption?: unknown; internalLinks?: unknown };
    } catch {
      return null;
    }
  }
}

/** Insert a growth_tasks row + a linked growth_drafts row. Best-effort persistence. */
async function persistDraft(
  url: string,
  title: string,
  caption: string | null,
  internalLinks: string[],
  note?: string,
): Promise<{ taskId: string | null; draftId: string | null }> {
  if (!supabaseAdmin) return { taskId: null, draftId: null };
  try {
    let taskId: string | null = null;
    const taskInsert = await supabaseAdmin
      .from("growth_tasks")
      .insert({
        type: "internal-link",
        scope: url,
        title: `Promote article: ${title}`,
        description: note || "Generate a LinkedIn syndication caption + internal-link suggestions for this article.",
        priority: "normal",
        status: "open",
        source: "promotion",
        payload: { url, kind: "linkedin" },
      })
      .select("id")
      .single();
    if (taskInsert.data?.id) taskId = taskInsert.data.id as string;

    let draftId: string | null = null;
    const draftInsert = await supabaseAdmin
      .from("growth_drafts")
      .insert({
        task_id: taskId,
        kind: "linkedin",
        url,
        title,
        body_md: caption,
        schema_json: { internalLinks, note: note || null },
        status: "pending",
      })
      .select("id")
      .single();
    if (draftInsert.data?.id) draftId = draftInsert.data.id as string;

    return { taskId, draftId };
  } catch {
    return { taskId: null, draftId: null };
  }
}