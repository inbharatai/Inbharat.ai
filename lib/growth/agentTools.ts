/**
 * InBharat Growth Agent — Phase C: tool registry the conversational agent can call.
 *
 * The founder chats with the CMO agent ("draft a punchier caption for the RAG
 * article", "make a cover for desh-ka-ai", "analyze this image and suggest a
 * cover inspired by it"). Gemini function-calling picks a tool; this module
 * executes it server-side and returns a JSON result the agent loop feeds back to
 * the model. Every tool produces a HUMAN-GATED draft in growth_drafts — the
 * agent NEVER publishes. The founder still approves + publishes in the Issues tab.
 *
 * Gemini-only (Growth Agent's own GEMINI_API_KEY + model-router). Never touches
 * the chat backend. Redacts before every model call; withinBudget fail-closed;
 * logUsage on every model call. The vision tool is the ONLY place raw image bytes
 * reach a model, and it stays inside the Growth Agent's Gemini key.
 *
 * Server-only.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini, callGeminiVision, type GeminiFunctionDeclaration } from "./gemini.js";
import { generateCoverDraft, generateCoverDraftFromFields, type CoverStyleSample } from "./cover.js";
import { draftArticle, draftVideoScript, slugifyTitle } from "./articleWriter.js";
import { promoteArticle, type ArticlePageMeta } from "./promoter.js";
import { loadInboxContext, formatInboxBlock, INBOX_BUCKET } from "./inbox.js";
import { loadRulesForUrl, loadGlobalRules, formatRulesBlock } from "./rules.js";
import { loadStrategy, formatStrategyBlock } from "./strategy.js";
import { critiqueAndRevise } from "./critique.js";
import { runAccuracyGates, type GateInput } from "./gates.js";
import {
  insertKnowledge,
  searchKnowledge,
  listKnowledge,
  findDuplicateKnowledge,
  type KnowledgeType,
} from "./knowledge.js";
import { groundedSearch } from "./search.js";
import { getAnalyticsSnapshot, syncAnalyticsToKB } from "./performance.js";
import { listAnalyticsInsights } from "./knowledge.js";
import { generateInsights, summarizeSnapshot, inferProduct, type Insight } from "./analyticsInsights.js";
import { discoverTopics, DISCOVERY_PRODUCTS, type ProductId } from "./topicDiscovery.js";
import { ARTICLES, ARTICLE_CATEGORIES, type ArticleCategory } from "../../content/articles.meta.js";
import { logInfo } from "./authorization.js";

/** Result every executor returns: a JSON-serializable object the agent loop
 *  feeds back to Gemini as a functionResponse part + persists to
 *  growth_agent_messages (role='tool'). `ok:false` means the tool ran but could
 *  not produce the artifact (model unconfigured / budget / not found); the agent
 *  narrates that to the founder instead of erroring the whole turn. */
export interface ToolResult {
  ok: boolean;
  /** Short human line the agent can relay verbatim ("Drafted a cover for X — review in Issues"). */
  message?: string;
  [k: string]: unknown;
}

/** Args the model passes are loosely typed; each executor validates its own. */
type Args = Record<string, unknown>;

const num = (v: unknown, def: number, max: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : def;
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Stage 2: max agent redrafts allowed per source draft (prevents a runaway
 *  "again, again" loop from spawning an unbounded trail of pending redrafts). */
const REDRAFT_CAP = 3;

/** Count existing drafts the agent already redrafted from a given source draft id
 *  (schema_json.agentRedraftOf === sourceId). Best-effort: 0 on any error / no
 *  Supabase (cap skipped → tool proceeds). Capped scan at 50 recent rows. */
async function countAgentRedrafts(sourceId: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("schema_json")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return 0;
    let n = 0;
    for (const row of data as Array<{ schema_json?: unknown }>) {
      const sj = (row.schema_json ?? null) as { agentRedraftOf?: unknown } | null;
      if (sj && typeof sj.agentRedraftOf === "string" && sj.agentRedraftOf === sourceId) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

// ─── Tool declarations (Gemini functionDeclarations) ─────────────────────────

export const AGENT_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "list_recent_drafts",
    description:
      "List the most recent Growth Agent drafts (LinkedIn captions, covers, inbox outlines, media candidates) so you can reference what's pending, approved, or published. Call this first when the founder asks 'what's in the queue' or before redrafting an existing caption.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many drafts to return (1–20).", minimum: 1, maximum: 20 } },
    },
  },
  {
    name: "redraft_caption",
    description:
      "Rewrite an EXISTING draft's caption (LinkedIn post / inbox outline) per the founder's instruction — e.g. 'make it punchier', 'add a question hook'. Requires the draft's id (from list_recent_drafts or the Issues tab). Creates a NEW pending draft (the original is untouched); the founder still approves + publishes. Never call this without a real draft id, and never use it for text the founder pastes directly — use review_text for that.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "The growth_drafts id of the draft to rewrite." },
        instruction: { type: "string", description: "The founder's edit instruction (what to change)." },
      },
      required: ["draftId", "instruction"],
    },
  },
  {
    name: "review_text",
    description:
      "Review and improve text the founder PASTES directly into the chat (an article, a caption, an outline) per their instruction — e.g. 'review and upgrade this article', 'make this sharper', 'tighten the intro'. USE THIS whenever the founder pastes raw text to improve; do NOT use redraft_caption (that needs an existing draft id and will fail with 'draft not found'). Returns a critique + a revised version, saved as a pending draft the founder approves in Issues. Long-form text (markdown headings / >800 chars) is saved as an 'article' draft that publishes to inbharat.ai/learn-ai-with-reeturaj; short text is saved as a 'linkedin' caption draft.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The full text the founder pasted (the article/caption/outline to improve)." },
        instruction: { type: "string", description: "What the founder wants done — e.g. 'review and upgrade', 'make it punchier', 'fix the hype'." },
      },
      required: ["text", "instruction"],
    },
  },
  {
    name: "generate_cover",
    description:
      "Draft an on-brand 1200x630 hero cover image for an article (gemini-2.5-flash-image). Creates a pending cover draft the founder approves in Issues. Pass EITHER a published article `slug` (e.g. 'desh-ka-ai') OR the `draftId` of an article draft you just created with write_article/review_text — the cover is generated from the draft's title/category/abstract so the founder can review the article + its image together before anything goes live. Optionally pass `sampleItemId` (an inbox IMAGE item id) to match that sample's visual style so every cover stays consistent — use this when the founder says 'use this as the cover style' or 'keep all covers like this sample'.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "A PUBLISHED article slug (from inbharat.ai/learn-ai-with-reeturaj)." },
        draftId: { type: "string", description: "The growth_drafts id of an article draft (kind='article') to make a cover for — use this right after write_article/review_text." },
        sampleItemId: { type: "string", description: "Optional: an inbox IMAGE item id to use as a style reference so the new cover matches the sample's palette/composition/motif language. The founder drops a sample cover in the inbox, then references it here." },
      },
    },
  },
  {
    name: "list_inbox_folder",
    description:
      "List the founder-fed inbox reference assets (text excerpts + media notes) the agent can draw on. Pass a folder to scope to that folder (+sub-folders); omit for everything fed. Use before drafting when the founder references dropped material.",
    parameters: {
      type: "object",
      properties: { folder: { type: "string", description: "Optional folder path to scope to." } },
    },
  },
  {
    name: "analyze_attachment",
    description:
      "Analyze an uploaded image or text attachment on command (gemini-2.5-flash vision). The founder says 'analyze this' / 'use this as a cover reference'. Returns the analysis text and stores it on the inbox item. Pass the inbox item id (the UI shows it).",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "The growth_inbox_items id of the attachment to analyze." },
        instruction: { type: "string", description: "Optional: what to analyze the attachment for (e.g. 'suggest a cover inspired by this')." },
      },
      required: ["itemId"],
    },
  },
  {
    name: "write_article",
    description:
      "Draft a full founder-voice tech article on a topic (markdown body + meta), ready to publish to inbharat.ai/learn-ai-with-reeturaj. Creates a pending 'article' draft the founder reviews + publishes in Issues. Pass the topic + optional instruction. Use this when the founder wants a full inbharat.ai article (long-form); use review_text when they paste existing text to improve.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The article topic / angle." },
        instruction: { type: "string", description: "Optional: specific guidance (length, angle, audience)." },
        slug: { type: "string", description: "Optional canonical URL slug to publish under (lowercase kebab, e.g. 'evals-for-ai-features'). The morning cron passes the calendar topic's slug so the content calendar advances one topic per day instead of re-drafting the same topic; when omitted, the slug is derived from the article title. Use the exact slug you're given." },
      },
      required: ["topic"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web (Google via Gemini google_search grounding) for current facts, recent news, dates, numbers, or to verify a claim before writing it. USE THIS whenever the founder asks about something current or factual, or you would otherwise guess a date/number/'latest' claim — search instead of guessing. Returns the top results with title, url, a short snippet, and a short grounded answer. One query per call; prefer a focused query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query (focused, e.g. 'Gemini 2.5 Flash release date')." },
      },
      required: ["query"],
    },
  },
  {
    name: "write_video_script",
    description:
      "Draft a short video script (60–180s) on a topic — hook, scene-by-scene narration, CTA. The agent cannot generate real video; this drafts a script the founder records. Creates a pending 'video-script' draft.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The video topic." },
        instruction: { type: "string", description: "Optional: length / angle / platform." },
      },
      required: ["topic"],
    },
  },
  {
    name: "promote_article",
    description:
      "Draft a human-gated LinkedIn caption for a 'Build with Reeturaj' article at the given URL — the article's eventual live URL (https://inbharat.ai/learn-ai-with-reeturaj/<slug>), whether the article is already published OR just drafted via write_article. Idempotent — skips URLs that already have a LinkedIn caption draft, so re-running the morning plan never duplicates. Call this right after write_article to create the companion LinkedIn post for the same article. Returns the linkedin draft id. Never publishes — the founder approves in Issues.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The article's full URL on inbharat.ai/learn-ai-with-reeturaj/<slug>." },
        title: { type: "string", description: "Optional: the article title (improves the caption; auto-loaded from the draft if omitted)." },
        description: { type: "string", description: "Optional: the article meta description (improves the caption; auto-loaded from the draft if omitted)." },
      },
      required: ["url"],
    },
  },
  {
    name: "save_knowledge",
    description:
      "Save a row to the knowledge base (the agent's memory layer): a source, topic, decision, note, or competitor gap you want to recall later. Dedupes by content hash — re-saving the same title+body is a no-op. Use after web_search to keep a source, or when the founder says 'remember this'. The KB is retrieved before every draft, so saving here shapes future drafts.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "Row type: source | topic | note | competitor_gap | decision | keyword." },
        title: { type: "string", description: "Short title (the recallable label)." },
        summary: { type: "string", description: "Optional 1–2 sentence summary." },
        sourceUrl: { type: "string", description: "Optional source URL (cite it)." },
        relatedProduct: { type: "string", description: "Optional product this relates to: inbharat | sahayaak-seva | jak-shield | unoone | uniassist | kathakitaab | testsprep." },
        keywords: { type: "array", items: { type: "string" }, description: "Optional keyword tags (≤12)." },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the knowledge base for what the agent already knows about a topic (FTS + token rerank). Call BEFORE drafting to avoid repeating an angle already covered, and to ground the draft in prior sources/notes. Returns ranked items with title, summary, source, and linked article.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query (a topic, angle, or keyword)." },
        product: { type: "string", description: "Optional: scope to a product (inbharat | sahayaak-seva | jak-shield | unoone | uniassist | kathakitaab | testsprep)." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_knowledge",
    description:
      "List recent knowledge-base rows, optionally filtered by product or status (e.g. list discovered topics for a product). Use when the founder asks 'what topics do we have', 'show pending research', or before picking a topic to draft.",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Optional: scope to a product." },
        status: { type: "string", description: "Optional: scope to a status (discovered | needs_review | approved | drafted | published | skipped | outdated | archived)." },
        limit: { type: "integer", description: "How many rows to return (1–50).", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "find_duplicate",
    description:
      "Check whether a topic is a near-duplicate of an existing knowledge-base entry OR a published article title (token Jaccard ≥ 0.8). Call before write_article to avoid re-drafting the same angle — if duplicate:true, pivot the angle, update the existing article, or skip instead of re-writing. Returns the matching entry when found.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The proposed article topic / angle." },
        product: { type: "string", description: "Optional: scope the duplicate check to a product." },
      },
      required: ["topic"],
    },
  },
  {
    name: "find_high_intent_topics",
    description:
      "Search the web for high-intent topic opportunities for an InBharat product (inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep), score each 0-100 across 12 dimensions (intent, product fit, SEO/GEO opportunity, lead potential, freshness, competition, risk), dedupe against existing KB + published articles, and save the survivors to the knowledge base as discovered topic rows. The founder reviews + approves them in the Knowledge UI before any draft. Honest: intent is estimated from result signals, NOT confirmed search volume. Regulated topics (medical/legal/patent/visa/finance) are flagged risk_level='high' + status='needs_review' for extra review. Requires GEMINI_API_KEY (uses Gemini google_search grounding — no Serper key needed).",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "The InBharat product to find topics for (inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep)." },
        count: { type: "number", description: "Optional: max queries to run per product (default 4, max 6)." },
      },
      required: ["product"],
    },
  },
  {
    name: "read_analytics",
    description:
      "Read the Growth Analytics inbox (Google Analytics 4 + Search Console, last 28 days by default) and the recommendations saved by the last sync. Use this for ANY analytics question: 'show analytics summary', 'show top pages', 'show top search queries', 'which articles need update', 'which pages have low CTR', 'which topics should we write next', 'show traffic for JAK Shield / Sahayaak / from India'. Pass `view` to scope the answer (summary | top_pages | top_queries | low_ctr | needs_update | recommendations), and optional `product` (inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep) / `country` to filter. Returns the live snapshot + stored insights. When analytics isn't configured, says so honestly — do not fabricate numbers.",
    parameters: {
      type: "object",
      properties: {
        view: { type: "string", description: "What to surface: summary | top_pages | top_queries | low_ctr | needs_update | recommendations. Default 'summary'." },
        product: { type: "string", description: "Optional: scope to a product (inbharat|sahayaak-seva|jak-shield|unoone|uniassist|kathakitaab|testsprep)." },
        country: { type: "string", description: "Optional: scope to a country name (e.g. 'India', 'US')." },
        days: { type: "integer", description: "Optional: lookback window in days (7–90, default 28).", minimum: 7, maximum: 90 },
      },
    },
  },
  {
    name: "sync_analytics",
    description:
      "Pull fresh GA4 + Search Console data for the last 28 days, generate actionable insights (low-CTR pages, rising/falling pages, top queries, follow-up article opportunities, product/country/device angles), and save them to the knowledge base so they're retrieved before every future draft. This is the 'Sync Analytics now' action. Returns the count of insights stored + a short summary. Requires the Google service-account credentials (GA4_PROPERTY_ID / GSC_SITE_URL + GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY) in env — when absent, returns configured:false honestly instead of failing.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Optional: lookback window in days (7–90, default 28).", minimum: 7, maximum: 90 },
      },
    },
  },
  {
    name: "run_accuracy_gates",
    description:
      "Re-run the 8 advisory accuracy gates (duplicate, source-quality, fact-check, brand-voice, product-naming, SEO/GEO, platform-format, claim-risk) on an existing draft by id, OR on text the founder pastes. Returns the per-gate pass/warn/fail verdict + findings. ADVISORY ONLY — never blocks approval; the founder still clicks Approve. Honest limits: source-quality + fact-check reuse the ORIGINAL grounding snippets only when re-running on a draft that stored them; on a re-run without snippets those gates skip-with-note. SEO/GEO is a static markdown pre-check (the full crawl audit runs post-publish). claim-risk is a regex flagger, not legal review.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "The growth_drafts id of the draft to gate-check." },
        text: { type: "string", description: "Optional: raw text to gate-check when the founder pastes (not a draft). Used when draftId is omitted." },
        kind: { type: "string", description: "Optional with `text`: 'article' | 'linkedin' | 'video-script'. Default 'article'." },
      },
    },
  },
];

// ─── Executors ──────────────────────────────────────────────────────────────

/** list_recent_drafts — recent growth_drafts with a body snippet. */
async function listRecentDrafts(args: Args): Promise<ToolResult> {
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const limit = num(args.limit, 10, 20);
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,status,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, message: `query failed: ${error.message}` };
    const drafts = (data || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      kind: r.kind,
      url: r.url,
      title: r.title,
      status: r.status,
      created: r.created_at,
      snippet: typeof r.body_md === "string" ? r.body_md.slice(0, 160) : null,
    }));
    return { ok: true, message: `${drafts.length} recent draft(s)`, drafts };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** redraft_caption — rewrite an existing draft's caption per instruction. */
async function redraftCaption(args: Args): Promise<ToolResult> {
  const draftId = str(args.draftId);
  const instruction = str(args.instruction);
  if (!draftId || !instruction) return { ok: false, message: "need draftId + instruction" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  // Load the source draft.
  const { data: src, error: qErr } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,url,title,body_md")
    .eq("id", draftId)
    .maybeSingle();
  if (qErr || !src) return { ok: false, message: "draft not found" };
  const srcRow = src as { id: string; kind: string; url: string | null; title: string | null; body_md: string | null };
  const original = srcRow.body_md ?? "";
  if (!original) return { ok: false, message: "that draft has no caption text to rewrite" };

  // Stage 2 guard: cap redrafts at REDRAFT_CAP per source draft so a runaway loop
  // (the founder saying "again, again") can't spawn an unbounded trail of pending
  // redrafts of the same caption. Counts existing drafts whose schema_json marks
  // them as an agent redraft OF this source. Best-effort: on any DB error the cap
  // is skipped (proceed) so a DB blip can't wedge the tool.
  const redraftCount = await countAgentRedrafts(srcRow.id);
  if (redraftCount >= REDRAFT_CAP) {
    return { ok: false, message: `that caption already has ${redraftCount} agent redraft${redraftCount === 1 ? "" : "s"} (cap is ${REDRAFT_CAP}). Approve/publish or reject the existing redrafts in Issues before redrafting again.` };
  }

  const task: GrowthTask = "draft";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { ok: false, message: "draft model not configured or monthly budget exhausted" };
  }

  const rulesBlock = srcRow.url ? formatRulesBlock(await loadRulesForUrl(srcRow.url)) : "";
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const inboxBlock = formatInboxBlock(await loadInboxContext());

  const system =
    "You are a B2B content editor for InBharat AI. Rewrite the founder's LinkedIn caption per their instruction. " +
    "Keep it 60–90 words, concise, hype-free, in the founder's voice. Respond ONLY with compact JSON: {\"caption\": string}." +
    (strategyBlock ? `\n\n${strategyBlock}` : "") +
    (rulesBlock ? `\n\n${rulesBlock}` : "") +
    (inboxBlock ? `\n\n${inboxBlock}` : "");
  const user =
    `Original caption:\n${original}\n\n` +
    `Founder's edit instruction:\n${instruction}\n\n` +
    `Return the rewritten caption as JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) return { ok: false, message: "redacted secret in prompt; aborted" };

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.6, maxOutputTokens: 320 });
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: srcRow.url ?? null, provider: choice.provider });
    return { ok: false, message: `model call failed: ${(e as Error).message}` };
  }
  const parsed = safeJsonCaption(raw);
  const caption = typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null;
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: caption ? "ok" : "parse_failed", contextUrl: srcRow.url ?? null, provider: choice.provider,
  });
  if (!caption) return { ok: false, message: "model returned no usable caption" };

  // Self-critique + revision (keeps the candidate when critique is unavailable).
  const crit = await critiqueAndRevise({
    draftBody: caption,
    context: { url: srcRow.url, kind: srcRow.kind, title: srcRow.title },
    rulesBlock, inboxBlock, strategyBlock,
  });
  const finalCaption = crit.revised ?? caption;

  // Persist a NEW pending draft (original untouched). kind = source kind so the
  // Issues tab routes it correctly; schema_json marks it as an agent redraft.
  const { data: ins, error: insErr } = await supabaseAdmin
    .from("growth_drafts")
    .insert({
      kind: srcRow.kind || "linkedin",
      url: srcRow.url,
      title: srcRow.title ? `${srcRow.title} (redraft)` : "Agent redraft",
      body_md: finalCaption,
      schema_json: {
        agentRedraftOf: srcRow.id,
        instruction,
        critique: { weaknesses: crit.weaknesses, revised: crit.revised !== null, status: crit.status, note: crit.note },
      },
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !ins) return { ok: false, message: `persist failed: ${insErr?.message ?? "unknown"}` };
  const newId = ins.id as string;
  // Best-effort critique log (full candidate+revised text only here).
  await supabaseAdmin
    .from("growth_critique_log")
    .insert({
      draft_id: newId, task: "review", candidate: caption, revised: crit.revised,
      weaknesses: crit.weaknesses, model: crit.model, provider: crit.provider, cost_usd: crit.costUsd,
      status: crit.status, note: crit.note,
    })
    .then(() => undefined, () => undefined);
  return { ok: true, message: `Redrafted caption — new pending draft ${newId} (review in Issues).`, draftId: newId, caption: finalCaption };
}

/** generate_cover — draft an on-brand cover for a published article (slug) OR
 *  a not-yet-published article draft (draftId). The draft path lets the founder
 *  review an article + its cover together before anything ships. An optional
 *  `sampleItemId` (an inbox image) is sent as a style reference so every cover
 *  matches the founder's sample. */
async function generateCover(args: Args): Promise<ToolResult> {
  const slug = str(args.slug);
  const draftId = str(args.draftId);
  const sampleItemId = str(args.sampleItemId);
  if (!slug && !draftId) return { ok: false, message: "need an article slug OR a draftId (an article draft)" };

  // Optional style sample: load + base64 an inbox image item to match its style.
  // If the requested sampleItemId is missing/not-an-image/unreadable, DON'T abort —
  // fall back to the auto style sample (fetchStyleSample inside the generator) so the
  // cover still drafts. Previously a hallucinated/typo sampleItemId (e.g.
  // "65415-sample-cover-image") hard-aborted the whole cover, leaving the article
  // with no image. The cover is too important to skip on a bad reference id.
  let sample: CoverStyleSample | undefined;
  let sampleNote = "";
  if (sampleItemId) {
    const loaded = await loadStyleSample(sampleItemId);
    if (typeof loaded === "string") {
      sampleNote = ` (requested sampleItemId not usable: ${loaded}; used the default cover style instead)`;
    } else {
      sample = loaded;
    }
  }

  // Published-article path.
  if (slug) {
    const meta = ARTICLES.find((a) => a.slug === slug);
    if (meta) {
      try {
        const result = await generateCoverDraft(meta, sample);
        if (result.status !== "pending") return { ok: false, message: result.note ?? "cover not drafted (skipped — a cover may already exist)" };
        return { ok: true, message: `Cover drafted for "${meta.title}"${sample ? " matching your sample style" : ""}${sampleNote} — review in Issues, then Publish to ship it.`, draftId: result.draftId, filename: result.filename };
      } catch (e) {
        return { ok: false, message: `cover draft failed: ${(e as Error).message}` };
      }
    }
    // slug given but not a published article → maybe it's a draft slug; need a draftId to load it.
    if (!draftId) return { ok: false, message: `no published article found for slug "${slug}". Pass the article draftId instead (from write_article/review_text).` };
  }

  // Draft-article path: load the draft, derive fields, generate the cover.
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const { data: row, error } = await supabaseAdmin
    .from("growth_drafts")
    .select("id,kind,title,body_md,schema_json")
    .eq("id", draftId)
    .maybeSingle();
  if (error || !row) return { ok: false, message: "draft not found" };
  const r = row as { id: string; kind: string; title: string | null; body_md: string | null; schema_json: Record<string, unknown> | null };
  if (r.kind !== "article") return { ok: false, message: `that draft is a ${r.kind}, not an article — covers are for articles` };

  const sj = r.schema_json ?? {};
  const aSlug = typeof sj.slug === "string" && sj.slug ? sj.slug : (slug || slugifyTitle(r.title || "draft"));
  const aTitle = typeof sj.title === "string" && sj.title ? sj.title : (r.title || "Untitled article");
  const aCategory = typeof sj.category === "string" && sj.category ? sj.category : "AI Foundations";
  const aAbstract = typeof sj.abstract === "string" && sj.abstract ? sj.abstract : (r.body_md ?? "").slice(0, 400);
  try {
    const result = await generateCoverDraftFromFields({ slug: aSlug, title: aTitle, category: aCategory, abstract: aAbstract }, sample);
    if (result.status !== "pending") return { ok: false, message: result.note ?? "cover not drafted (skipped — a cover may already exist for this article)" };
    return { ok: true, message: `Cover drafted for article "${aTitle}"${sample ? " matching your sample style" : ""}${sampleNote} — review in Issues, then approve to ship the cover + article together.`, draftId: result.draftId, filename: result.filename };
  } catch (e) {
    return { ok: false, message: `cover draft failed: ${(e as Error).message}` };
  }
}

/** Load an inbox IMAGE item as a style-sample for cover generation. Returns
 *  the base64+mime (and records the source for audit) or an error string. */
async function loadStyleSample(itemId: string): Promise<CoverStyleSample | string> {
  if (!supabaseAdmin) return "database not configured";
  const { data: row, error } = await supabaseAdmin
    .from("growth_inbox_items")
    .select("id,storage_path,kind,original_name")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !row) return "sample not found";
  const item = row as { id: string; storage_path: string; kind: string; original_name: string | null };
  if (item.kind !== "image") return `that inbox item is a ${item.kind}, not an image — pick an image sample`;
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(INBOX_BUCKET).download(item.storage_path);
  if (dlErr || !blob) return `sample download failed: ${dlErr?.message ?? "no blob"}`;
  const ab = await blob.arrayBuffer();
  const base64 = Buffer.from(ab).toString("base64");
  const mimeType = guessMime(item.storage_path);
  return { base64, mimeType, source: `inbox:${item.id} (${item.original_name ?? item.storage_path})` };
}

/** web_search — Google via Gemini google_search grounding (reuses GEMINI_API_KEY,
 *  no separate Serper key). One focused query; returns top results with
 *  title/url/snippet so the agent can ground claims in current facts instead of
 *  guessing. IS a Gemini model call (token-billed + per-query grounding fee,
 *  logged in lib/growth/search.ts); results re-enter the model context via the
 *  tool result, where the agent loop's backstop redact scan catches anything
 *  sensitive. */
async function webSearch(args: Args): Promise<ToolResult> {
  const query = str(args.query).slice(0, 500).trim();
  if (!query) return { ok: false, message: "need a search query" };
  const res = await groundedSearch(query);
  if (!res) return { ok: false, message: "web search not configured or returned nothing (GEMINI_API_KEY not set, call failed, or no grounding chunks)" };
  const results = res.results.slice(0, 6).map((o) => ({
    title: (o.title ?? "").slice(0, 200),
    url: o.url ?? "",
    snippet: (o.snippet ?? "").slice(0, 300),
  }));
  if (results.length === 0) return { ok: true, message: `no web results for "${query}"`, query, results: [], answer: res.answer.slice(0, 500) || undefined };
  // Best-effort: persist each result to the knowledge base so future drafts can
  // retrieve + cite these sources (dedupes by content hash). Never blocks/throws.
  for (const r of results) {
    void insertKnowledge({
      type: "source",
      title: r.title || r.url || query,
      summary: r.snippet || null,
      sourceUrl: r.url || null,
      sourceType: "web",
      topicCluster: query.slice(0, 80),
      keywords: tokenizeLite(query),
    }).catch(() => undefined);
  }
  return { ok: true, message: `${results.length} web result(s) for "${query}"`, query, results, answer: res.answer.slice(0, 500) || undefined };
}

/** Tiny tokenizer for keyword extraction from a query (mirrors knowledge.ts tokenize). */
function tokenizeLite(s: string): string[] {
  const m = (s ?? "").toLowerCase().match(/[a-z0-9]+/g);
  return (m ? Array.from(m) : []).filter((t) => t.length >= 2).slice(0, 8);
}

/** save_knowledge — persist a KB row (dedupes by content hash). */
async function saveKnowledgeTool(args: Args): Promise<ToolResult> {
  const type = str(args.type) as KnowledgeType;
  const title = str(args.title);
  if (!title) return { ok: false, message: "need a title" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const item = await insertKnowledge({
    type,
    title,
    summary: typeof args.summary === "string" ? args.summary : null,
    sourceUrl: typeof args.sourceUrl === "string" ? args.sourceUrl : null,
    sourceType: "web",
    relatedProduct: typeof args.relatedProduct === "string" ? args.relatedProduct : null,
    keywords: Array.isArray(args.keywords) ? (args.keywords as unknown[]).filter((k): k is string => typeof k === "string") : [],
  });
  if (!item) return { ok: false, message: "save failed (DB error or duplicate)" };
  return { ok: true, message: `Saved to knowledge base: "${item.title}" (${item.type}). It'll be retrieved before future drafts.`, id: item.id };
}

/** search_knowledge — FTS + token-rerank retrieval of what the agent already knows. */
async function searchKnowledgeTool(args: Args): Promise<ToolResult> {
  const query = str(args.query);
  if (!query) return { ok: false, message: "need a search query" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const items = await searchKnowledge(query, { product: typeof args.product === "string" ? args.product : null, limit: 8 });
  if (items.length === 0) return { ok: true, message: `no knowledge-base matches for "${query}"`, query, results: [] };
  return {
    ok: true,
    message: `${items.length} knowledge-base match(es) for "${query}" — build on these; do NOT repeat an angle already covered.`,
    query,
    results: items.map((it) => ({ id: it.id, type: it.type, title: it.title, summary: it.summary, sourceUrl: it.sourceUrl, linkedArticleId: it.linkedArticleId, status: it.status })),
  };
}

/** list_knowledge — recent KB rows, optionally filtered by product/status. */
async function listKnowledgeTool(args: Args): Promise<ToolResult> {
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };
  const limit = num(args.limit, 20, 50);
  const items = await listKnowledge({
    product: typeof args.product === "string" ? args.product : null,
    status: typeof args.status === "string" ? (args.status as KnowledgeStatus2) : null,
    limit,
  });
  if (items.length === 0) return { ok: true, message: "no knowledge-base rows match", results: [] };
  return {
    ok: true,
    message: `${items.length} knowledge-base row(s)`,
    results: items.map((it) => ({ id: it.id, type: it.type, title: it.title, status: it.status, relatedProduct: it.relatedProduct, intentScore: it.intentScore, linkedArticleId: it.linkedArticleId })),
  };
}

type KnowledgeStatus2 = "discovered" | "needs_review" | "approved" | "drafted" | "published" | "skipped" | "update_existing" | "outdated" | "archived";

/** find_high_intent_topics — Gemini google_search-grounded topic discovery.
 *  Scores topics 0-100 across 12 dimensions, dedupes, saves survivors as KB
 *  topic rows (status='discovered' or 'needs_review' for high-risk). Uses the
 *  Growth Agent's own GEMINI_API_KEY (no Serper key) — the Serper→Gemini swap
 *  landed 2026-07-05. Never auto-drafts. */
async function findHighIntentTopicsTool(args: Args): Promise<ToolResult> {
  const product = str(args.product) as ProductId;
  if (!DISCOVERY_PRODUCTS.includes(product)) {
    return { ok: false, message: `unknown product "${product}" — valid: ${DISCOVERY_PRODUCTS.join(", ")}` };
  }
  const count = num(args.count, 4, 6);
  const result = await discoverTopics(product, count);
  if (result.notConfigured) {
    return { ok: false, message: "web search not configured (GEMINI_API_KEY not set, call failed, or no grounding) — topic discovery needs Gemini google_search" };
  }
  if (result.discovered === 0) {
    return { ok: true, message: `no topics discovered for ${product} (search returned no results)`, product, discovered: 0, topics: [] };
  }
  return {
    ok: true,
    message: `${result.discovered} topic(s) discovered for ${product} — ${result.saved} new, ${result.duplicates} duplicate (skipped). Saved to the knowledge base (status='discovered' or 'needs_review'); the founder reviews + approves in the Knowledge UI before any draft. Intent is estimated, NOT confirmed volume.`,
    product,
    discovered: result.discovered,
    saved: result.saved,
    duplicates: result.duplicates,
    topics: result.topics.map((t) => ({
      title: t.suggestedArticleTitle,
      query: t.query,
      priority: t.priority,
      riskLevel: t.riskLevel,
      recommendedAction: t.recommendedAction,
      duplicate: t.duplicate,
      searchIntent: t.searchIntent,
      sourceLinks: t.sourceLinks,
    })),
  };
}

/** read_analytics — Growth Analytics inbox (GA4 + GSC snapshot + stored insights).
 *  Never fabricates numbers; says so honestly when not configured. */
async function readAnalyticsTool(args: Args): Promise<ToolResult> {
  const days = clampDaysArg(args.days, 28);
  const view = (str(args.view) || "summary") as
    | "summary" | "top_pages" | "top_queries" | "low_ctr" | "needs_update" | "recommendations";
  const product = str(args.product) || undefined;
  const country = str(args.country) || undefined;
  const snapshot = await getAnalyticsSnapshot(days);
  if (!snapshot.configured) {
    return {
      ok: false,
      message: "Analytics isn't configured yet — add the Google service-account credentials (GA4_PROPERTY_ID / GSC_SITE_URL + GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY) in the Vercel env, then say 'sync analytics'. I won't guess traffic numbers.",
      configured: false,
    };
  }
  const stored = await listAnalyticsInsights(30);
  // Re-derive live insights (no previous-period fetch on read — rising/falling
  // come from the last sync's stored rows to keep reads cheap). For low_ctr /
  // top_pages / top_queries we use the live snapshot directly.
  const liveInsights = generateInsights({ snapshot, now: Date.now() });
  const filterInsights = (arr: Insight[]) => {
    let out = arr;
    if (product) out = out.filter((i) => !i.relatedProduct || i.relatedProduct === product);
    if (country) out = out.filter((i) => (i.country ?? "").toLowerCase().includes(country.toLowerCase()));
    return out;
  };
  const payload: Record<string, unknown> = { configured: true, days, summary: summarizeSnapshot(snapshot) };
  // Product / country filters scope the views the system prompt promises they
  // scope ("show traffic for JAK Shield / from India"). Without these the tool
  // would return ALL pages/queries/countries regardless of the filter and the
  // model would either misreport or call the tool a liar. Product matches via
  // inferProduct on the page path / query text; country matches by name.
  const matchesProduct = (text: string) => !product || inferProduct(text) === product;
  const matchesCountry = (name: string) => !country || name.toLowerCase().includes(country.toLowerCase());
  if (snapshot.gsc) {
    payload.gscTotals = snapshot.gsc.totals;
    payload.topQueries = snapshot.gsc.topQueries.filter((r) => matchesProduct(r.keys[0] ?? "")).slice(0, 10).map((r) => ({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position }));
    payload.topPages = snapshot.gsc.topPages.filter((r) => matchesProduct(r.keys[0] ?? "")).slice(0, 10).map((r) => ({ page: r.keys[0], impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position }));
  }
  if (snapshot.ga4) {
    payload.ga4Totals = snapshot.ga4.totals;
    payload.topPagesGa4 = snapshot.ga4.topPages.filter((p) => matchesProduct(p.path)).slice(0, 10).map((p) => ({ path: p.path, views: p.screenPageViews, sessions: p.sessions, users: p.users }));
    payload.countries = snapshot.ga4.byCountry.filter((c) => matchesCountry(c.key)).slice(0, 8);
    payload.devices = snapshot.ga4.byDevice;
    payload.sources = snapshot.ga4.bySource.slice(0, 8);
  }
  if (snapshot.error) payload.note = `partial — ${snapshot.error}`;

  const lowCtr = filterInsights(liveInsights.filter((i) => i.type === "low_ctr_page"));
  const needsUpdate = filterInsights([
    ...liveInsights.filter((i) => i.type === "no_traffic_page"),
    ...liveInsights.filter((i) => i.type === "falling_page"),
    ...stored.filter((s) => s.type === "performance" && /refresh|archive|update/i.test(s.summary ?? "")).slice(0, 8).map((s) => ({ type: "no_traffic_page" as const, source: "Search Console" as const, page: s.sourceUrl ?? undefined, summary: s.title, recommendedAction: s.summary ?? "", priority: s.intentScore ?? 0, metrics: {}, linkedArticleSlug: s.linkedArticleId ?? undefined, relatedProduct: s.relatedProduct ?? undefined })),
  ]);
  const recs = filterInsights(liveInsights.slice(0, 12));

  let message = summarizeSnapshot(snapshot);
  if (view === "top_pages") {
    message = snapshot.gsc
      ? `Top ${(payload.topPages as unknown[] | undefined)?.length ?? 0} pages by clicks (last ${days}d).`
      : "No Search Console page data in this window.";
  } else if (view === "top_queries") {
    message = snapshot.gsc ? `Top search queries by impressions (last ${days}d).` : "No Search Console query data in this window.";
  } else if (view === "low_ctr") {
    message = lowCtr.length ? `${lowCtr.length} page(s) with high impressions but low CTR — improve their titles/meta.` : "No low-CTR opportunities above the noise threshold right now.";
    payload.lowCtr = lowCtr.map(insightToLight);
  } else if (view === "needs_update") {
    message = needsUpdate.length ? `${needsUpdate.length} article(s) need a refresh or archive.` : "No articles flagged for refresh right now.";
    payload.needsUpdate = needsUpdate.map(insightToLight);
  } else if (view === "recommendations") {
    message = recs.length ? `${recs.length} content recommendations from the live snapshot.` : "No recommendations yet — try 'sync analytics' first.";
    payload.recommendations = recs.map(insightToLight);
  }
  return { ok: true, message, view, ...payload };
}

/** sync_analytics — manual sync (pull snapshot → generate insights → store to KB). */
async function syncAnalyticsTool(args: Args): Promise<ToolResult> {
  const days = clampDaysArg(args.days, 28);
  const result = await syncAnalyticsToKB(days);
  if (!result.configured) {
    return {
      ok: false,
      message: "Analytics isn't configured — add GA4_PROPERTY_ID / GSC_SITE_URL + GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY in the Vercel env, then retry. Nothing was synced.",
      configured: false,
    };
  }
  return {
    ok: true,
    configured: true,
    days,
    insights: result.insights,
    synced: result.synced,
    errors: result.errors,
    summary: result.summary,
    message: `Synced analytics for the last ${days}d — ${result.insights} insights generated, ${result.synced} saved to the knowledge base (${result.errors} errors). ${result.summary}${result.error ? ` (partial: ${result.error})` : ""}`,
    top: result.top.map(insightToLight),
  };
}

/** run_accuracy_gates — re-run the 8 advisory gates on a draft (by id) or pasted
 *  text. Loads the draft's stored critique (gate 4 reuses it — NO new model call)
 *  + title/body/slug/description/abstract from schema_json. Honest: grounding
 *  snippets are NOT persisted per-draft, so on a re-run gates 2/3 skip-with-note
 *  (the original grounding lived upstream at draft time). Advisory — never blocks. */
async function runAccuracyGatesTool(args: Args): Promise<ToolResult> {
  const draftId = str(args.draftId);
  const text = str(args.text);
  if (!draftId && !text) return { ok: false, message: "need a draftId (to gate-check a draft) or text (to gate-check pasted text)" };

  if (draftId) {
    if (!supabaseAdmin) return { ok: false, message: "database not configured" };
    const { data: row, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,schema_json")
      .eq("id", draftId)
      .maybeSingle();
    if (error || !row) return { ok: false, message: "draft not found" };
    const r = row as { id: string; kind: string; url: string | null; title: string | null; body_md: string | null; schema_json: Record<string, unknown> | null };
    const sj = (r.schema_json ?? {}) as {
      slug?: string; description?: string; abstract?: string;
      critique?: { weaknesses?: { severity: string; area: string; fix: string }[]; status?: string; revised?: string | null } | null;
    };
    const kind = (r.kind === "linkedin" || r.kind === "video-script" ? r.kind : "article") as GateInput["kind"];
    const platform = kind === "linkedin" ? "linkedin" : kind === "article" ? "inbharat" : "inbharat";
    const slug = typeof sj.slug === "string" ? sj.slug : (r.url ? (r.url.split("/learn-ai-with-reeturaj/")[1] ?? "").split(/[/?#]/)[0] : "");
    const input: GateInput = {
      kind,
      slug,
      title: r.title ?? "",
      description: typeof sj.description === "string" ? sj.description : undefined,
      abstract: typeof sj.abstract === "string" ? sj.abstract : undefined,
      bodyMd: r.body_md ?? "",
      platform,
      critique: sj.critique && Array.isArray(sj.critique.weaknesses) ? { weaknesses: sj.critique.weaknesses, status: sj.critique.status ?? "ok", revised: sj.critique.revised ?? null } : null,
      snippets: [],
    };
    const run = await runAccuracyGates(input);
    return {
      ok: true,
      message: `Accuracy gates on draft ${draftId}: ${run.summary}`,
      draftId,
      overall: run.overall,
      summary: run.summary,
      gates: run.gates,
    };
  }

  // Pasted-text path: gate-check raw text directly (no draft row).
  const kind = (str(args.kind) === "linkedin" || str(args.kind) === "video-script" ? str(args.kind) : "article") as GateInput["kind"];
  const platform = kind === "linkedin" ? "linkedin" : "inbharat";
  const input: GateInput = {
    kind,
    slug: "",
    title: text.split(/\n/)[0]?.slice(0, 120) || "Pasted text",
    bodyMd: text,
    platform,
    snippets: [],
  };
  const run = await runAccuracyGates(input);
  return { ok: true, message: `Accuracy gates on pasted ${kind}: ${run.summary}`, overall: run.overall, summary: run.summary, gates: run.gates };
}

function clampDaysArg(v: unknown, def: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : def;
  if (!Number.isFinite(n) || n < 7) return def;
  return Math.min(Math.round(n), 90);
}

function insightToLight(i: Insight): Record<string, unknown> {
  return {
    type: i.type,
    source: i.source,
    page: i.page,
    query: i.query,
    country: i.country,
    device: i.device,
    product: i.relatedProduct,
    summary: i.summary,
    action: i.recommendedAction,
    priority: i.priority,
    articleSlug: i.linkedArticleSlug,
  };
}

/** find_duplicate — cross-source near-duplicate check before drafting. */
async function findDuplicateTool(args: Args): Promise<ToolResult> {
  const topic = str(args.topic);
  if (!topic) return { ok: false, message: "need a topic" };
  const dup = await findDuplicateKnowledge(topic, typeof args.product === "string" ? args.product : null);
  if (!dup.duplicate) return { ok: true, message: `No duplicate found for "${topic}" — safe to draft a new article.`, duplicate: false };
  return {
    ok: true,
    message: `Duplicate found for "${topic}" — ${dup.reason ?? "matches existing work"}. Pivot the angle, update the existing article, or skip instead of re-writing.`,
    duplicate: true,
    reason: dup.reason ?? null,
    existing: dup.existing ? { id: dup.existing.id, type: dup.existing.type, title: dup.existing.title, status: dup.existing.status } : null,
  };
}

/** list_inbox_folder — fed reference assets summary. */
async function listInboxFolder(args: Args): Promise<ToolResult> {
  const folder = str(args.folder);
  const items = await loadInboxContext(folder || undefined);
  if (items.length === 0) return { ok: true, message: "no fed inbox assets", items: [] };
  const block = formatInboxBlock(items);
  return {
    ok: true,
    message: `${items.length} fed asset(s) in ${folder || "all folders"}`,
    items: items.map((it) => ({ id: it.id, folder: it.folder, kind: it.kind, name: it.originalName, excerpt: it.excerpt, mediaNote: it.mediaNote })),
    block,
  };
}

/** analyze_attachment — vision/text analysis of an inbox item on command. */
async function analyzeAttachment(args: Args): Promise<ToolResult> {
  const itemId = str(args.itemId);
  const instruction = str(args.instruction) || "Describe this image and note anything useful for InBharat's content (style, palette, motif, text).";
  if (!itemId) return { ok: false, message: "need an itemId" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  const { data: row, error: qErr } = await supabaseAdmin
    .from("growth_inbox_items")
    .select("id,storage_path,kind,original_name")
    .eq("id", itemId)
    .maybeSingle();
  if (qErr || !row) return { ok: false, message: "attachment not found" };
  const item = row as { id: string; storage_path: string; kind: string; original_name: string | null };

  // Download the object (service_role).
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(INBOX_BUCKET).download(item.storage_path);
  if (dlErr || !blob) return { ok: false, message: `download failed: ${dlErr?.message ?? "no blob"}` };

  if (item.kind === "image") {
    return analyzeImage(item, blob, instruction);
  }
  if (item.kind === "md" || item.kind === "txt") {
    const text = await blobToText(blob);
    const excerpt = text.slice(0, 1500);
    await saveAnalysis(itemId, { kind: "text", excerpt, instruction });
    return { ok: true, message: `Read ${item.original_name ?? "text file"} (${text.length} chars).`, excerpt };
  }
  // video / other — no frame extraction (would need ffmpeg); return metadata.
  await saveAnalysis(itemId, { kind: item.kind, note: "video/non-image attachment — metadata only; frame analysis not supported." });
  return { ok: false, message: `cannot deeply analyze a ${item.kind} attachment yet — use an image or text file` };
}

async function analyzeImage(
  item: { id: string; storage_path: string; kind: string; original_name: string | null },
  blob: Blob,
  instruction: string,
): Promise<ToolResult> {
  const task: GrowthTask = "vision";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { ok: false, message: "vision model not configured or monthly budget exhausted" };
  }
  const ab = await blob.arrayBuffer();
  const buf = Buffer.from(ab);
  const mimeType = guessMime(item.storage_path);
  const imageBase64 = buf.toString("base64");

  const redacted = redact(instruction);
  if (redacted.containedSecret) return { ok: false, message: "redacted secret in instruction; aborted" };

  let analysis: string;
  try {
    analysis = await callGeminiVision(choice, instruction, imageBase64, mimeType);
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: item.storage_path, provider: choice.provider });
    return { ok: false, message: `vision call failed: ${(e as Error).message}` };
  }
  // Post-scan the model's text output for secrets. The image bytes themselves
  // can't be pre-scanned without OCR, but if the founder uploaded a screenshot
  // of an .env / service-account JSON / DB URL, the vision model transcribes
  // the secret into `analysis` — catch it BEFORE persisting to the inbox + chat
  // so the secret never lands in the DB or the transcript.
  const redactedAnalysis = redact(analysis);
  if (redactedAnalysis.containedSecret) {
    void logUsage({ model: choice.model, task, promptTokens: Math.ceil(instruction.length / 4), completionTokens: Math.ceil(analysis.length / 4), totalTokens: Math.ceil((instruction.length + analysis.length) / 4) + Math.ceil(buf.length / 4), costUsd: estimateCost(choice, Math.ceil((instruction.length + analysis.length) / 4)), status: "ok", contextUrl: item.storage_path, provider: choice.provider });
    await logInfo("agent-analyze-image-secret-blocked", item.storage_path, "vision output contained a secret; aborted before save").catch(() => undefined);
    return { ok: false, message: "I caught what looks like a secret in the image (the vision model transcribed it). I did NOT save the analysis. Remove the secret from the image and re-upload." };
  }
  const totalTokens = Math.ceil((instruction.length + analysis.length) / 4) + Math.ceil(buf.length / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil(instruction.length / 4),
    completionTokens: Math.ceil(analysis.length / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: "ok", contextUrl: item.storage_path, provider: choice.provider,
  });
  await saveAnalysis(item.id, { kind: "image", instruction, analysis });
  await logInfo("agent-analyze-image", item.storage_path, analysis.slice(0, 200)).catch(() => undefined);
  return { ok: true, message: `Analyzed image (${item.original_name ?? "untitled"}).`, analysis };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safeJsonCaption(raw: string): { caption?: unknown } | null {
  try {
    return JSON.parse(raw) as { caption?: unknown };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { caption?: unknown };
    } catch {
      return null;
    }
  }
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

async function blobToText(blob: Blob): Promise<string> {
  try {
    return await blob.text();
  } catch {
    return new TextDecoder().decode(await blob.arrayBuffer());
  }
}

async function saveAnalysis(itemId: string, analysis: Record<string, unknown>): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_inbox_items")
    .update({ analysis })
    .eq("id", itemId)
    .then(() => undefined, () => undefined);
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/** Map tool name → executor. The agent loop calls this with the model's args. */
export async function dispatchTool(name: string, args: Args): Promise<ToolResult> {
  switch (name) {
    case "list_recent_drafts": return listRecentDrafts(args);
    case "redraft_caption": return redraftCaption(args);
    case "generate_cover": return generateCover(args);
    case "list_inbox_folder": return listInboxFolder(args);
    case "analyze_attachment": return analyzeAttachment(args);
    case "write_article": return writeArticle(args);
    case "write_video_script": return writeVideoScript(args);
    case "promote_article": return promoteArticleTool(args);
    case "review_text": return reviewText(args);
    case "web_search": return webSearch(args);
    case "save_knowledge": return saveKnowledgeTool(args);
    case "search_knowledge": return searchKnowledgeTool(args);
    case "list_knowledge": return listKnowledgeTool(args);
    case "find_duplicate": return findDuplicateTool(args);
    case "find_high_intent_topics": return findHighIntentTopicsTool(args);
    case "read_analytics": return readAnalyticsTool(args);
    case "sync_analytics": return syncAnalyticsTool(args);
    case "run_accuracy_gates": return runAccuracyGatesTool(args);
    default: return { ok: false, message: `unknown tool: ${name}` };
  }
}

/** write_article — draft a full article on a topic. */
async function writeArticle(args: Args): Promise<ToolResult> {
  const topic = str(args.topic);
  const instruction = str(args.instruction);
  const slug = str(args.slug);
  if (!topic) return { ok: false, message: "need a topic" };
  try {
    const r = await draftArticle(topic, instruction || undefined, slug || undefined);
    if (r.status !== "pending" || !r.article) return { ok: false, message: r.note ?? "article not drafted" };
    const a = r.article;
    return {
      ok: true,
      message: `Drafted article "${a.title}" (${a.category}, ~${a.readMinutes} min) — review in Issues, then publish to ship it live.`,
      draftId: r.draftId, slug: a.slug, title: a.title, category: a.category, readMinutes: a.readMinutes,
      preview: a.bodyMd.slice(0, 400),
    };
  } catch (e) {
    return { ok: false, message: `article draft failed: ${(e as Error).message}` };
  }
}

/** write_video_script — draft a short video script. */
async function writeVideoScript(args: Args): Promise<ToolResult> {
  const topic = str(args.topic);
  const instruction = str(args.instruction);
  if (!topic) return { ok: false, message: "need a topic" };
  try {
    const r = await draftVideoScript(topic, instruction || undefined);
    if (r.status !== "pending" || !r.script) return { ok: false, message: r.note ?? "script not drafted" };
    const v = r.script;
    return {
      ok: true,
      message: `Drafted video script "${v.title}" (~${v.durationMinutes} min) — review in Issues, then publish to commit it to the repo.`,
      draftId: r.draftId, slug: v.slug, title: v.title, durationMinutes: v.durationMinutes,
      preview: v.bodyMd.slice(0, 400),
    };
  } catch (e) {
    return { ok: false, message: `video script draft failed: ${(e as Error).message}` };
  }
}

/** promote_article — draft a human-gated LinkedIn caption for a "Build with
 *  Reeturaj" article (published OR just-drafted). Wraps the idempotent
 *  promoteArticle lib fn. Enriches the caption context from the article draft's
 *  stored title/description/abstract when the caller omits them — so a caption
 *  for an UNPUBLISHED draft (whose live page 404s) is still generated from real
 *  article content, not a bare URL. Never publishes. */
async function promoteArticleTool(args: Args): Promise<ToolResult> {
  const url = str(args.url);
  if (!url) return { ok: false, message: "need the article url" };
  // Reject anything that isn't a clean http(s) URL on an inbharat.ai host. The
  // host check prevents a prompt-injected URL like evil.com/learn-ai-with-
  // reeturaj/foo from passing the path-only check and producing a caption that
  // links the founder to an attacker-controlled domain.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "invalid url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "url must be http/https" };
  }
  if (!parsed.hostname.endsWith("inbharat.ai")) {
    return { ok: false, message: "url must point to inbharat.ai/learn-ai-with-reeturaj/<slug>" };
  }
  if (!url.includes("/learn-ai-with-reeturaj/")) {
    return { ok: false, message: "url must point to inbharat.ai/learn-ai-with-reeturaj/<slug>" };
  }
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  // Derive the slug from the URL to load the article draft's stored context.
  const slug = url.split("/learn-ai-with-reeturaj/")[1]?.split(/[/?#]/)[0] ?? "";

  // Caller-supplied context wins; otherwise auto-load from the latest article
  // draft for this slug, then fall back to a published ARTICLES entry.
  let meta: ArticlePageMeta = {
    title: str(args.title) || undefined,
    description: str(args.description) || undefined,
  };
  if (!meta.title) {
    try {
      const { data, error } = await supabaseAdmin
        .from("growth_drafts")
        .select("title,kind,schema_json")
        .eq("kind", "article")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error && Array.isArray(data)) {
        const row = data.find((r: Record<string, unknown>) => {
          const sj = r.schema_json as { slug?: string } | null;
          return sj && typeof sj.slug === "string" && sj.slug === slug;
        }) as { title: string | null; schema_json: { description?: string; abstract?: string } | null } | undefined;
        if (row) {
          meta = {
            title: row.title ?? undefined,
            description: row.schema_json?.description ?? undefined,
            abstract: row.schema_json?.abstract ?? undefined,
          };
        }
      }
    } catch {
      // non-fatal — fall through to the published-articles lookup below
    }
  }
  if (!meta.title) {
    const published = ARTICLES.find((a) => a.slug === slug);
    if (published) {
      meta = { title: published.title, description: published.description, abstract: published.abstract };
    }
  }

  try {
    const r = await promoteArticle(url, meta);
    if (r.status === "skipped") {
      return { ok: true, message: `LinkedIn caption for ${slug} already drafted — review it in Issues (no duplicate created).`, draftId: r.draftId, slug, status: "skipped" };
    }
    return {
      ok: true,
      message: `Drafted a LinkedIn caption for "${meta.title || slug}" — review in Issues, then publish to get the share link.`,
      draftId: r.draftId, slug, status: "pending", captionPreview: r.caption ? r.caption.slice(0, 200) : null,
    };
  } catch (e) {
    return { ok: false, message: `promote_article failed: ${(e as Error).message}` };
  }
}

/** review_text — review + revise text the founder pastes (NOT critiqueAndRevise,
 *  which is hardcoded to 60–90-word LinkedIn captions and would truncate a full
 *  article). This has its own length-aware prompt: long-form articles get an
 *  article-editor prompt + 8k output tokens (preserves length); short text gets a
 *  caption prompt. Long-form is saved as an 'article' draft (publishes to the
 *  Learn AI hub); short text as a 'linkedin' draft. */
async function reviewText(args: Args): Promise<ToolResult> {
  const text = str(args.text).slice(0, 12000);
  const instruction = str(args.instruction);
  if (!text) return { ok: false, message: "need the text to review (pass the founder's pasted text in `text`)" };
  if (!instruction) return { ok: false, message: "need an instruction (e.g. 'review and upgrade')" };
  if (!supabaseAdmin) return { ok: false, message: "database not configured" };

  const longForm = text.length > 800 || /\n#{1,2}\s|\n#{1,2}\s*[^#\n]/.test("\n" + text) || /^#{1,2}\s/.test(text);
  const kind: "article" | "linkedin" = longForm ? "article" : "linkedin";

  const task: GrowthTask = "review";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { ok: false, message: "review model not configured or monthly budget exhausted" };
  }

  const rulesBlock = formatRulesBlock(await loadGlobalRulesForReview());
  const strategyBlock = formatStrategyBlock(await loadStrategy());
  const inboxBlock = formatInboxBlock(await loadInboxContext());

  const system =
    kind === "article"
      ? "You are a critical editor for an InBharat.ai 'Learn AI with Reeturaj' article in the FIRST-PERSON voice of Reeturaj Goswami (founder of InBharat AI — practical AI built in India, for India and the world). India-first framing where natural; hype-free; no jargon-as-filler. "
        + "Banned terms: NEVER 'UniGurus'; for any healthcare reference use 'Sahayaak Seva' (never 'RHCF Seva'). "
        + "Return the FULL revised article in markdown — keep it the same length ballpark, do NOT summarize or shorten it. Also return a title (<=70 chars), a <=155-char meta description, an abstract (40-60 words), a category, and a short weaknesses list. "
        + "category must be one of: " + ARTICLE_CATEGORIES.join(" | ") + ". "
        + "Respond ONLY with compact JSON: {\"revised\": string, \"title\": string, \"description\": string, \"abstract\": string, \"category\": string, \"weaknesses\": [{\"severity\":\"critical|major|minor\",\"area\": string,\"fix\": string}]}."
        + (strategyBlock ? `\n\n${strategyBlock}` : "") + (rulesBlock ? `\n\n${rulesBlock}` : "") + (inboxBlock ? `\n\n${inboxBlock}` : "")
      : "You are a critical editor for InBharat AI LinkedIn drafts in the founder's voice. Fix hype, jargon, off-brand positioning, weak hooks, missing CTAs; keep it 60–90 words. "
        + "Banned terms: NEVER 'UniGurus'; for healthcare use 'Sahayaak Seva' (never 'RHCF Seva'). "
        + "Respond ONLY with compact JSON: {\"revised\": string, \"title\": string, \"weaknesses\": [{\"severity\":\"critical|major|minor\",\"area\": string,\"fix\": string}]}."
        + (strategyBlock ? `\n\n${strategyBlock}` : "") + (rulesBlock ? `\n\n${rulesBlock}` : "") + (inboxBlock ? `\n\n${inboxBlock}` : "");

  const user = `Original text:\n"""\n${text}\n"""\n\nFounder's instruction: ${instruction}\n\nReturn the revised ${kind === "article" ? "article + title + description + abstract + category " : "text + title "}+ weaknesses. JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) return { ok: false, message: "redacted secret in prompt; aborted" };

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.4, maxOutputTokens: kind === "article" ? 8192 : 700 });
  } catch (e) {
    void logUsage({ model: choice.model, task, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider });
    return { ok: false, message: `review model call failed: ${(e as Error).message}` };
  }
  const parsed = safeParseReview(raw);
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd: estimateCost(choice, totalTokens),
    status: parsed?.revised ? "ok" : "parse_failed", contextUrl: null, provider: choice.provider,
  });
  if (!parsed || typeof parsed.revised !== "string" || !parsed.revised.trim()) {
    return { ok: false, message: "review model returned no usable revision; try again or paste a shorter excerpt" };
  }
  const revised = parsed.revised.trim();

  // Derive meta for the article publish path (readArticleMeta needs slug + body).
  let title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : deriveTitle(text);
  title = title.slice(0, 120);
  const slug = slugifyTitle(title);
  const description = typeof parsed.description === "string" ? parsed.description.slice(0, 160) : "";
  const abstract = typeof parsed.abstract === "string" ? parsed.abstract.slice(0, 400) : "";
  const rawCat = typeof parsed.category === "string" ? parsed.category : "";
  const category: ArticleCategory = (ARTICLE_CATEGORIES as readonly string[]).includes(rawCat) ? (rawCat as ArticleCategory) : "AI Foundations";
  const readMinutes = Math.max(3, Math.round(revised.split(/\s+/).length / 200));
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(coerceWeakness).filter(Boolean) : [];

  const schemaJson =
    kind === "article"
      ? { reviewText: true, instruction, slug, title, description, abstract, category, readMinutes }
      : { reviewText: true, instruction };

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("growth_drafts")
    .insert({
      kind,
      url: kind === "article" ? `https://inbharat.ai/learn-ai-with-reeturaj/${slug}` : null,
      title: kind === "article" ? title : (title + " (review)"),
      body_md: revised,
      schema_json: schemaJson,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !ins) return { ok: false, message: `persist failed: ${insErr?.message ?? "unknown"}` };
  const newId = ins.id as string;

  // Best-effort critique log (full candidate + revised text only here).
  await supabaseAdmin
    .from("growth_critique_log")
    .insert({
      draft_id: newId, task: "review", candidate: text, revised,
      weaknesses, model: choice.model, provider: choice.provider,
      cost_usd: estimateCost(choice, totalTokens), status: "ok", note: `review_text (${kind})`,
    })
    .then(() => undefined, () => undefined);

  const message =
    kind === "article"
      ? `Reviewed + upgraded the article — saved as pending draft "${title}" (review in Issues, then Publish to ship it to inbharat.ai/learn-ai-with-reeturaj/${slug}).`
      : `Reviewed + upgraded the text — saved as a pending caption draft "${title}" (review in Issues, then Publish to get the LinkedIn share link).`;
  return { ok: true, message, draftId: newId, kind, slug: kind === "article" ? slug : undefined, title, revised, weaknesses };
}

// review_text helpers ──────────────────────────────────────────────────────────
function safeParseReview(raw: string): { revised?: unknown; title?: unknown; description?: unknown; abstract?: unknown; category?: unknown; weaknesses?: unknown } | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  }
}

function deriveTitle(text: string): string {
  // First markdown heading line, else first non-empty line, else fallback.
  const heading = text.match(/^\s*#{1,6}\s+(.+)$/m);
  if (heading && heading[1]) return heading[1].replace(/[#*`]/g, "").trim().slice(0, 120);
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  return (line || "Reviewed text").slice(0, 120);
}

function coerceWeakness(w: unknown): { severity: "critical" | "major" | "minor"; area: string; fix: string } | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const severity = o.severity === "critical" || o.severity === "major" || o.severity === "minor" ? o.severity : "minor";
  const area = typeof o.area === "string" ? o.area : "";
  const fix = typeof o.fix === "string" ? o.fix : "";
  if (!area && !fix) return null;
  return { severity, area, fix };
}

// Pasted-text review has no URL scope, so the founder's GLOBAL rules shape it
// (same as inbox.ts:draftFromText, which reviews inbox drops with no URL).
async function loadGlobalRulesForReview(): Promise<ReturnType<typeof loadGlobalRules>> {
  return loadGlobalRules();
}