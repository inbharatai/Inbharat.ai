/**
 * InBharat Growth Agent — Phase E: agent-authored article + video-script drafts.
 *
 * The founder commands the agent ("write an article on X", "draft a video script
 * for Y"). This module drafts a FULL founder-voice article (markdown body + meta)
 * or a video script, and persists a HUMAN-GATED draft in growth_drafts (kind
 * 'article' / 'video-script'). The founder reviews in Issues and clicks Publish —
 * which commits the markdown + the articles.meta.ts entry to GitHub (Vercel
 * auto-rebuilds so it ships live). The agent NEVER publishes; nothing is auto.
 *
 * Gemini-only (Growth Agent's own key + 'article' task). Redacts before the model
 * call; withinBudget fail-closed; logUsage on every model call. Pulls STRATEGY +
 * RULES + INBOX + sibling-article context so the draft is on-brand and cross-links
 * siblings. Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini } from "./gemini.js";
import { loadGlobalRules, formatRulesBlock } from "./rules.js";
import { loadStrategy, formatStrategyBlock } from "./strategy.js";
import { loadInboxContext, formatInboxBlock } from "./inbox.js";
import { critiqueAndRevise } from "./critique.js";
import { sanitizeMermaidFences } from "./mermaid-validate.js";
import { stripCitationMarkers } from "./citations.js";
import { gatherGrounding, formatGroundingBlock } from "./retrieval.js";
import { retrieveForTopic, formatKnowledgeBlock, markUsed, findDuplicateKnowledge } from "./knowledge.js";
import { runAccuracyGates, type GateRun } from "./gates.js";
import { ARTICLES, ARTICLE_CATEGORIES, articlePath, type ArticleCategory } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";

export interface DraftedArticle {
  slug: string;
  title: string;
  description: string;
  category: ArticleCategory;
  datePublished: string;
  readMinutes: number;
  abstract: string;
  bodyMd: string;
  faq: { q: string; a: string }[];
  hashtags: string[];
  note?: string;
  critique?: {
    revised: string | null;
    weaknesses: { severity: string; area: string; fix: string }[];
    status: string;
    note: string;
  } | null;
  /** Advisory 8-gate pre-approval verdict (run post-critique, pre-persist). Null
   *  if the gates couldn't run. NEVER blocks — approval stays a human click. */
  gates?: GateRun | null;
}

export interface ArticleDraftResult {
  draftId: string | null;
  status: "pending" | "skipped";
  article?: DraftedArticle;
  note?: string;
}

const CATEGORY_SET = new Set<string>(ARTICLE_CATEGORIES);

/** Derive a slug from a title: lowercase, kebab, trimmed, fallback to 'article'.
 *  Pure + hermetically testable. */
export function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "article";
}

/** Estimate read minutes from word count (~200 wpm). Pure. */
export function estimateReadMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 200));
}

/** Resolve the publish slug for an article draft. Pure + hermetic.
 *
 *  Precedence: a clean caller-supplied `suggestedSlug` (the morning cron passes the
 *  calendar topic's slug so the content calendar advances — without this the model's
 *  own slug never matches the calendar slug and the picker re-drafts the same topic
 *  every morning) → the model's own slug (when clean) → slugifyTitle(title). "Clean"
 *  means a non-empty lowercase-kebab string; anything else is ignored so a bad
 *  caller/model value can never produce an invalid URL slug. */
export function resolveArticleSlug(suggestedSlug: string | undefined, modelSlug: string, title: string): string {
  const isClean = (s: string): boolean => !!s && /^[a-z0-9-]+$/.test(s);
  if (isClean(suggestedSlug ?? "")) return suggestedSlug as string;
  if (isClean(modelSlug)) return modelSlug;
  return slugifyTitle(title);
}

/**
 * Draft a full article from a topic + optional instruction. Persists a pending
 * 'article' draft (the founder reviews + publishes). Never throws; returns
 * status 'skipped' with a note when the model is unavailable / budget exhausted /
 * redacted / parse fails. The body is run through critiqueAndRevise (kept when
 * critique is unavailable).
 */
export async function draftArticle(topic: string, instruction?: string, suggestedSlug?: string): Promise<ArticleDraftResult> {
  const task: GrowthTask = "article";
  const choice = pickModel(task);
  const skip = (note: string): ArticleDraftResult => ({ draftId: null, status: "skipped", note });
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return skip("article model not configured or monthly budget exhausted");
  }

  // Structural duplicate backstop: even when the NL router forgets to call
  // find_duplicate first (the free-plan / direct write_article path), refuse to
  // draft a near-duplicate of a published article, a pending draft, or an
  // existing KB entry. Best-effort (DB down → proceed, never breaks the pipeline).
  const dup = await findDuplicateKnowledge(topic);
  if (dup.duplicate) {
    return skip(`duplicate topic — ${dup.reason ?? "matches existing content"}. Pivot the angle or update the existing article instead.`);
  }

  // Sibling context: titles + slugs + categories so the draft can cross-link.
  const siblings = ARTICLES.slice(0, 12)
    .map((a) => `- ${a.title} → ${SITE.url}${articlePath(a.slug)} (${a.category})`)
    .join("\n");

  // Stage 2 grounding: one focused web_search for the topic BEFORE the draft model
  // call, so the article cites real sources instead of inventing dates/numbers/API
  // names. Best-effort (no SERPER_API_KEY / no results → empty block → ungrounded,
  // the prior behavior). Never throws; never blocks drafting.
  const groundingSnippets = await gatherGrounding(topic);
  const groundingBlock = formatGroundingBlock(groundingSnippets);

  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const rulesBlock = formatRulesBlock(await loadGlobalRules());
  const inboxBlock = formatInboxBlock(await loadInboxContext());
  // Knowledge base retrieval: what the agent already knows about this topic (prior
  // sources, articles, posts, notes). Build on it; do NOT repeat a covered angle.
  // Best-effort (no DB / no matches → empty block → unchanged prompt). Never throws.
  const knowledgeItems = await retrieveForTopic(topic);
  const knowledgeBlock = formatKnowledgeBlock(knowledgeItems);
  // Best-effort: stamp the retrieved KB items as used (bumps use_count + last_used_at)
  // so the Knowledge UI + learning signals reflect what fed this draft. Never throws.
  for (const it of knowledgeItems) void markUsed(it.id).catch(() => undefined);

  const system =
    "You are a B2B content writer for InBharat AI, an Indian AI product studio founded by Reeturaj Goswami. " +
    "You write full founder-authored-style tech articles (practical, hype-free, concrete, Indian-engineering context). " +
    "The article body is markdown: start with a `> ` blockquote direct-answer paragraph, then `## ` section headings and prose. " +
    "Use ```mermaid fences for architecture/flow diagrams and ```code fences for code ONLY when they genuinely aid explanation — keep every diagram and code block well-formed and accurate (valid mermaid syntax that renders, real runnable code, correct language tag). Do NOT pad the article with decorative diagrams. " +
    "Respond ONLY with compact JSON: " +
    "{\"title\": string, \"description\": string (<=160 chars meta description), \"category\": one of [AI Foundations, AI Tools, Engineering, DevOps, Security, InBharat], \"abstract\": string (40–60 word direct answer), \"bodyMd\": string (full markdown, starts with `> ` blockquote then ## headings, 800–1500 words; ```mermaid diagrams and ```code fences allowed when they aid explanation, kept accurate and well-formed), \"faq\": [{\"q\": string, \"a\": string}] (2–4 pairs), \"hashtags\": string[]}." +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "") +
    (knowledgeBlock ? `\n\n${knowledgeBlock}` : "") +
    (groundingBlock ? `\n\n${groundingBlock}` : "");
  const user =
    `Topic: ${topic}\n` +
    (instruction ? `Founder instruction: ${instruction}\n` : "") +
    `Author voice: Reeturaj Goswami, founder of InBharat.ai.\n` +
    `Sibling articles to cross-link where relevant:\n${siblings}\n\n` +
    `Write the full article. Return JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) return skip("redacted secret in article prompt; aborted model call");

  let raw: string;
  try {
    // 16384 output tokens: a full 800–1500-word article as JSON (bodyMd alone is
    // ~2000–3000 tokens once escaped) plus title/description/abstract/faq/hashtags
    // + JSON overhead + table/mermaid/code-heavy bodies need real headroom. 4096
    // truncated mid-body (unusable); 8192 was right at the ceiling for table-heavy
    // articles like the Gemini routing piece. gemini-2.5-flash supports up to
    // 65536 output tokens, so 16384 is safe and removes the truncation failure
    // mode without extra cost (billed per generated token, not per cap).
    raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 16384 });
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider });
    return skip(`article model call failed: ${(e as Error).message}`);
  }

  let result = safeParseArticle(raw);
  let rawOut = raw;

  // One-shot retry on stub-failure. With responseMimeType=application/json the
  // response is always syntactically valid JSON, so a `missing_fields` result
  // means the model returned a metadata stub (title/description/category) with no
  // bodyMd/abstract — NOT a parse error. Re-prompt ONCE with a sharper instruction
  // before skipping, so the morning run drafts an article instead of stalling on
  // a stub (the 2026-07-07 morning run failed exactly this way on the Gemini
  // routing topic). Bounded: a single retry, re-checks withinBudget, only on
  // missing_fields (a hard no_json parse failure is not retried — that's
  // truncation/prose, a different cause). Best-effort: any retry error falls
  // through to the honest skip note below. The extra call is logged via logUsage.
  const stubMissing = result.reason === "missing_fields" ? result.missing : null;
  if (stubMissing && (await withinBudget())) {
    const retryUser =
      `Topic: ${topic}\n` +
      (instruction ? `Founder instruction: ${instruction}\n` : "") +
      `Your previous response was JSON with these required fields missing or empty: ${stubMissing.join(", ")}.\n` +
      `That means you returned a metadata stub, not the full article. Return the COMPLETE article now as compact JSON with EVERY field populated: title, description (<=160 chars), category, abstract (40-60 word direct answer), bodyMd (the FULL markdown body, 800-1500 words, starting with a > blockquote then ## headings; mermaid fences and code fences allowed when they aid explanation), faq (2-4 {q,a} pairs), hashtags. JSON only — no prose, no stub.`;
    try {
      rawOut = await callGemini(choice, system, retryUser, { temperature: 0.6, maxOutputTokens: 16384 });
      result = safeParseArticle(rawOut);
    } catch {
      // retry call itself failed — fall through to the honest skip note below
    }
  }

  const parsed = result.parsed;
  const totalTokens = Math.ceil((system.length + user.length + (rawOut?.length ?? 0)) / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((rawOut?.length ?? 0) / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: parsed ? "ok" : "parse_failed", contextUrl: null, provider: choice.provider,
  });
  if (!parsed) {
    // Honest, diagnosable skip note. The two failure modes look different and
    // must not be conflated: `missing_fields` = JSON parsed but the model returned
    // a stub (and the one-shot retry above already failed to recover); `no_json` =
    // the output didn't parse at all (truncation or prose-wrapping). The old
    // "article model returned no usable JSON" message lied for the missing-fields
    // case — it IS usable JSON, just incomplete. Capped preview keeps the note
    // readable; the full raw is already logged via logUsage above.
    const preview = rawOut.replace(/\s+/g, " ").slice(0, 280);
    const diag = result.reason === "missing_fields"
      ? `article JSON parsed but required field(s) missing/empty: ${result.missing.join(", ")} — the model returned a metadata stub, not a full article (one retry already failed to recover)`
      : `article model output did not parse as JSON (likely truncated or prose-wrapped)`;
    return skip(`${diag}. Nothing drafted. Raw (first 280 chars): ${preview}`);
  }

  // Self-critique + revision on the body (kept when critique unavailable). The
  // grounding block is forwarded so the critique pass can fact-check numeric/date/
  // version claims against the same sources (Stage 2).
  const crit = await critiqueAndRevise({
    draftBody: parsed.bodyMd,
    context: { url: null, kind: "article", title: parsed.title },
    rulesBlock, inboxBlock, strategyBlock, groundingBlock,
  });
  const revisedBody = crit.revised ?? parsed.bodyMd;

  // Mermaid sanitize: strip any ```mermaid fence that doesn't parse so the draft that
  // lands in Issues is already publishable (the publish path also strips as a backstop,
  // but a clean draft means the founder never reviews a diagram that would render as
  // "Syntax error" live, and publish never blocks on mermaid). Best-effort + never
  // blocks: on any error the revised body is kept as-is (the publish path is the final
  // gate). The stripped count is surfaced in the draft note so the founder knows a
  // diagram was dropped and can re-draft it if they want the visual.
  let finalBody = revisedBody;
  let mermaidStripped = 0;
  try {
    const ms = await sanitizeMermaidFences(revisedBody);
    if (ms.stripped.length > 0) {
      finalBody = ms.cleaned;
      mermaidStripped = ms.stripped.length;
    }
  } catch {
    // sanitizeMermaidFences degrades gracefully and shouldn't throw, but never let a
    // sanitizer failure block drafting — keep the revised body.
  }

  // Citation-marker strip: the Stage 2 grounding prompt tells the model to cite
  // numbered web_search sources, so it emits inline `[1] [2]` markers next to
  // claims. Those aren't real footnotes (no `[^N]: <url>` block) and remark-gfm
  // has no footnote plugin, so bare `[N]` renders as literal junk mid-sentence.
  // The grounding's value is upstream (preventing invented facts); the reader-
  // facing badges are leakage, so strip them. The publish path strips again as a
  // backstop. Pure (see lib/growth/citations.ts + its unit tests).
  finalBody = stripCitationMarkers(finalBody);

  // Resolve the publish slug: a caller-supplied canonical slug (the morning cron
  // passes the calendar topic's slug so the content calendar advances one topic
  // per day — without this the model's own slug never matches the calendar slug and
  // the picker re-drafts the same topic every morning) takes precedence when clean;
  // otherwise fall back to the model's slug, then slugify the title. Pure + hermetic
  // (see resolveArticleSlug + its unit tests).
  const baseSlug = resolveArticleSlug(suggestedSlug, parsed.slug, parsed.title);
  // Stage 2 slug-collision guard: dedup the base slug against published
  // ARTICLES + pending/approved article drafts so two drafts never target the same
  // URL (which would make the second publish overwrite the first's .md on GitHub).
  // Best-effort: no DB → only the in-memory ARTICLES set is checked.
  const uniqueSlug = await ensureUniqueArticleSlug(baseSlug);

  // 8 accuracy gates — advisory pre-approval verdict, run AFTER the final slug +
  // final body (post-critique, post-mermaid-strip, post-citation-strip) so the
  // gates see exactly what the founder will review. Reuses the critique already
  // computed (gate 4) + the grounding snippets already gathered (gates 2/3) —
  // NO new model call, NO new retrieval. Best-effort + never throws: on any
  // error the gates are set to null and drafting proceeds (approval is still a
  // human click). Stored on schema_json.gates so the cockpit inspector surfaces
  // it; the API can re-run via POST /api/growth/gates.
  let gates: GateRun | null = null;
  try {
    gates = await runAccuracyGates({
      kind: "article",
      slug: uniqueSlug,
      title: parsed.title,
      description: parsed.description,
      abstract: parsed.abstract,
      bodyMd: finalBody,
      platform: "inbharat",
      hashtags: parsed.hashtags,
      critique: { weaknesses: crit.weaknesses, status: crit.status, revised: crit.revised, note: crit.note },
      snippets: groundingSnippets,
    });
  } catch {
    // A gate failure never blocks the draft — the founder reviews regardless.
  }

  const article: DraftedArticle = {
    slug: uniqueSlug,
    title: parsed.title,
    description: parsed.description,
    category: parsed.category,
    datePublished: todayIso(),
    readMinutes: estimateReadMinutes(finalBody),
    abstract: parsed.abstract,
    bodyMd: finalBody,
    faq: parsed.faq,
    hashtags: parsed.hashtags,
    critique: { revised: crit.revised, weaknesses: crit.weaknesses, status: crit.status, note: crit.note },
    gates,
  };

  const draftId = await persistArticleDraft(topic, instruction, article);
  const note = draftId
    ? `Article drafted — review in Issues, then publish to ship it live.${mermaidStripped ? ` (${mermaidStripped} broken mermaid diagram(s) stripped — re-draft if you want the visual)` : ""}`
    : "drafted but DB persist failed (see logs)";
  return { draftId, status: "pending", article, note };
}

interface ParsedArticle {
  slug: string;
  title: string;
  description: string;
  category: ArticleCategory;
  abstract: string;
  bodyMd: string;
  faq: { q: string; a: string }[];
  hashtags: string[];
}

interface ArticleParseResult {
  /** The parsed article when reason === "ok"; null otherwise. */
  parsed: ParsedArticle | null;
  /** "ok" = full article parsed; "no_json" = output didn't parse (truncated/prose);
   *  "missing_fields" = JSON parsed but a required field was empty/absent (a stub). */
  reason: "ok" | "no_json" | "missing_fields";
  /** Which required fields were empty/absent (only meaningful for missing_fields). */
  missing: string[];
  raw: string;
}

/** Parse the model's article JSON. Returns a flat result so the caller can give
 *  an HONEST skip note: `no_json` (didn't parse — truncated or prose-wrapped) vs
 *  `missing_fields` (parsed fine but a required field was empty/absent — the
 *  model returned a metadata stub, not a full article). The old `null` return
 *  forced both cases into the misleading "no usable JSON" message, which is
 *  especially wrong here because callGemini uses responseMimeType=application/
 *  json — the response is ALWAYS syntactically valid JSON, so a failure was
 *  almost always "missing fields", never a parse failure. Tolerates common
 *  schema-key drift (body under `body`/`content`/`markdown`, abstract under
 *  `summary`/`tldr`) so a usable article isn't discarded over a wrong key name. */
function safeParseArticle(raw: string): ArticleParseResult {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Model may wrap JSON in prose / fences. Extract the outermost {...} block.
    // NOTE: this regex is GREEDY (\{[\s\S]*\}) — it spans from the first "{" to
    // the LAST "}" in the raw text, NOT a balanced pair. That is intentional and
    // safe here: when the model wraps one JSON object in prose, the last "}" is
    // that object's closing brace, so the greedy match captures the whole object.
    // It would mis-capture if trailing prose contained extra "}" after the JSON;
    // in that rare case JSON.parse fails and we return no_json (honest), no
    // corruption. Not "balanced" extraction — do not label it as such. (This
    // branch is unreachable when responseMimeType=application/json is set, but
    // kept for the non-JSON call sites that share this parser.)
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { parsed: null, reason: "no_json", missing: [], raw };
    try {
      obj = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return { parsed: null, reason: "no_json", missing: [], raw };
    }
  }
  // Tolerate schema-key drift: the model occasionally emits the body under
  // `body`/`content`/`markdown` or the abstract under `summary`/`tldr` despite
  // the prompt's schema. Accept the aliases (first non-empty wins) so a usable
  // article isn't discarded as "missing bodyMd" over a wrong key name.
  const firstNonEmpty = (...keys: string[]): string => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const title = firstNonEmpty("title");
  const bodyMd = firstNonEmpty("bodyMd", "body", "content", "markdown", "articleBody");
  const description = firstNonEmpty("description", "metaDescription", "desc");
  const abstract = firstNonEmpty("abstract", "summary", "tldr", "tl;dr", "dek");
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!bodyMd) missing.push("bodyMd");
  if (!abstract) missing.push("abstract");
  if (missing.length > 0) return { parsed: null, reason: "missing_fields", missing, raw };
  const rawCategory = firstNonEmpty("category");
  const category = (CATEGORY_SET.has(rawCategory) ? rawCategory : "AI Foundations") as ArticleCategory;
  // Prefer an explicit slug if the model gave a clean one; else slugify the title.
  const rawSlug = firstNonEmpty("slug");
  const slug = /^[a-z0-9-]+$/.test(rawSlug) ? rawSlug : slugifyTitle(title);
  const faq = Array.isArray(obj?.faq)
    ? (obj.faq as Array<Record<string, unknown>>)
        .filter((f) => typeof f?.q === "string" && typeof f?.a === "string")
        .slice(0, 6)
        .map((f) => ({ q: String(f.q), a: String(f.a) }))
    : [];
  const hashtags = Array.isArray(obj?.hashtags)
    ? (obj.hashtags as unknown[]).filter((h) => typeof h === "string").map(String).slice(0, 12)
    : [];
  return { parsed: { slug, title, description: description.slice(0, 160), category, abstract, bodyMd, faq, hashtags }, reason: "ok", missing: [], raw };
}

/** Today's ISO date (YYYY-MM-DD). Server runtime only (Date is fine here —
 *  this is NOT a workflow script). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Stage 2 slug-collision guard. Returns a slug unique across (a) published
 * ARTICLES and (b) pending/approved 'article' drafts in growth_drafts, appending
 * `-2`, `-3`, … when the model-chosen slug is already taken. This prevents two
 * drafts from targeting the same inbharat.ai/learn-ai-with-reeturaj/<slug> URL —
 * the second publish would otherwise overwrite the first's committed markdown.
 *
 * Best-effort + graceful: on any DB error / no Supabase, only the in-memory
 * ARTICLES set is consulted (the common published-slugs case). Caps the draft
 * scan at 200 rows (same window as the morning cron). Never throws; never returns
 * an empty slug. Pure-ish (one optional DB read); the suffix logic is hermetic.
 */
export async function ensureUniqueArticleSlug(slug: string): Promise<string> {
  const base = slug || "article";
  const taken = new Set<string>(ARTICLES.map((a) => a.slug));
  // Only pending/approved drafts can still collide — a published/rejected draft's
  // slug is either already in ARTICLES (published) or abandoned (rejected).
  const draftSlugs = await loadPendingArticleSlugs();
  for (const s of draftSlugs) taken.add(s);
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 50; n++) {
    const cand = `${base}-${n}`;
    if (!taken.has(cand)) return cand;
  }
  // 50 collisions is unreachable in practice; fall back to a timestamp suffix so
  // we never return a colliding slug.
  return `${base}-${Date.now().toString(36)}`;
}

/** Slugs of pending/approved 'article' drafts (the ones that can still collide with
 *  a fresh draft). Best-effort: [] on any error / no Supabase. Capped at 200 rows. */
async function loadPendingArticleSlugs(): Promise<string[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("schema_json")
      .eq("kind", "article")
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return [];
    const slugs: string[] = [];
    for (const row of data as Array<{ schema_json?: unknown }>) {
      const sj = row.schema_json as { slug?: unknown } | null;
      if (sj && typeof sj.slug === "string" && sj.slug) slugs.push(sj.slug);
    }
    return slugs;
  } catch {
    return [];
  }
}

/** Persist a pending 'article' draft. Best-effort; never throws. */
async function persistArticleDraft(topic: string, instruction: string | undefined, a: DraftedArticle): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .insert({
        kind: "article",
        url: `${SITE.url}${articlePath(a.slug)}`,
        title: a.title,
        body_md: a.bodyMd,
        schema_json: {
          slug: a.slug,
          description: a.description,
          category: a.category,
          datePublished: a.datePublished,
          readMinutes: a.readMinutes,
          abstract: a.abstract,
          faq: a.faq,
          hashtags: a.hashtags,
          topic,
          instruction: instruction ?? null,
          critique: a.critique ? { weaknesses: a.critique.weaknesses, revised: a.critique.revised !== null, status: a.critique.status, note: a.critique.note } : null,
          // Advisory 8-gate verdict (never blocks). Stored so the cockpit
          // inspector + POST /api/growth/gates "re-run" can show it without a
          // model call. Null when gates couldn't run.
          gates: a.gates ?? null,
        },
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return null;
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

// ─── Video script ──────────────────────────────────────────────────────────────

export interface DraftedVideoScript {
  slug: string;
  title: string;
  topic: string;
  durationMinutes: number;
  hook: string;
  bodyMd: string;
  note?: string;
}

export interface VideoScriptResult {
  draftId: string | null;
  status: "pending" | "skipped";
  script?: DraftedVideoScript;
  note?: string;
}

/**
 * Draft a video script (the agent cannot generate real video; it drafts a script +
 * thumbnail direction the founder records/uploads). Persists a pending 'video-script'
 * draft. Publish commits the script markdown to the repo as a reference artifact —
 * no site wiring (videos aren't rendered on inbharat.ai today). Never throws.
 */
export async function draftVideoScript(topic: string, instruction?: string): Promise<VideoScriptResult> {
  const task: GrowthTask = "article";
  const choice = pickModel(task);
  const skip = (note: string): VideoScriptResult => ({ draftId: null, status: "skipped", note });
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return skip("model not configured or monthly budget exhausted");
  }
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const rulesBlock = formatRulesBlock(await loadGlobalRules());
  const inboxBlock = formatInboxBlock(await loadInboxContext());
  const system =
    "You are a B2B video scriptwriter for InBharat AI. Write a short, punchy founder-voice video script " +
    "(60–180 seconds): a hook, scene-by-scene narration, and a CTA. Hype-free, concrete, Indian-engineering context. " +
    "Respond ONLY with compact JSON: {\"title\": string, \"durationMinutes\": number, \"hook\": string, \"bodyMd\": string (full script markdown: hook, scenes with narration + on-screen text, CTA)}." +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "");
  const user = `Topic: ${topic}\n${instruction ? `Instruction: ${instruction}\n` : ""}Write the script. JSON only.`;
  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) return skip("redacted secret in script prompt; aborted model call");

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 2048 });
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider });
    return skip(`model call failed: ${(e as Error).message}`);
  }
  const result = safeParseScript(raw);
  const parsed = result.parsed;
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: parsed ? "ok" : "parse_failed", contextUrl: null, provider: choice.provider,
  });
  if (!parsed) {
    // Honest, diagnosable skip note (see safeParseArticle for the rationale —
    // responseMimeType=application/json means a failure here is almost always
    // missing_fields, not a parse error). Capped preview keeps the note readable.
    const preview = raw.replace(/\s+/g, " ").slice(0, 280);
    const diag = result.reason === "missing_fields"
      ? `script JSON parsed but required field(s) missing/empty: ${result.missing.join(", ")} — the model returned a stub, not a full script`
      : `script model output did not parse as JSON (likely truncated or prose-wrapped)`;
    return skip(`${diag}. Nothing drafted. Raw (first 280 chars): ${preview}`);
  }
  const script: DraftedVideoScript = { ...parsed, topic, slug: parsed.slug };
  const draftId = await persistScriptDraft(topic, instruction, script);
  return { draftId, status: "pending", script, note: draftId ? "Video script drafted — review in Issues, then publish to commit it to the repo." : "drafted but DB persist failed" };
}

interface ScriptParseResult {
  parsed: Omit<DraftedVideoScript, "topic"> | null;
  reason: "ok" | "no_json" | "missing_fields";
  missing: string[];
  raw: string;
}

/** Parse the model's video-script JSON. Flat result (see safeParseArticle):
 *  distinguishes `no_json` (truncated/prose) from `missing_fields` (parsed but a
 *  required field was empty — a stub) so the skip note is honest. Tolerates
 *  body-key drift (body/content/markdown). */
function safeParseScript(raw: string): ScriptParseResult {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { parsed: null, reason: "no_json", missing: [], raw };
    try { obj = JSON.parse(m[0]) as Record<string, unknown>; } catch { return { parsed: null, reason: "no_json", missing: [], raw }; }
  }
  const firstNonEmpty = (...keys: string[]): string => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const title = firstNonEmpty("title");
  const bodyMd = firstNonEmpty("bodyMd", "body", "content", "markdown", "script");
  const hook = firstNonEmpty("hook");
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!bodyMd) missing.push("bodyMd");
  if (missing.length > 0) return { parsed: null, reason: "missing_fields", missing, raw };
  const durationMinutes = Math.max(1, Math.min(10, Number(obj?.durationMinutes) || 2));
  const rawSlug = firstNonEmpty("slug");
  const slug = /^[a-z0-9-]+$/.test(rawSlug) ? rawSlug : slugifyTitle(title);
  return { parsed: { slug, title, durationMinutes, hook: hook || title, bodyMd }, reason: "ok", missing: [], raw };
}

async function persistScriptDraft(topic: string, instruction: string | undefined, v: DraftedVideoScript): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .insert({
        kind: "video-script",
        url: null,
        title: v.title,
        body_md: v.bodyMd,
        schema_json: { slug: v.slug, topic, instruction: instruction ?? null, durationMinutes: v.durationMinutes, hook: v.hook },
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return null;
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}