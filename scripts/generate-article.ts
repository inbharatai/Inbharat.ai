/**
 * InBharat Growth Agent — full-article generator (operator-driven, human-gated).
 *
 * This is the Growth Agent authoring a full SEO article (not just a LinkedIn
 * caption) using its OWN model-router: pickModel('draft') (gemini-flash) for the
 * body, pickModel('review') (openai gpt-4.1-mini) for an accuracy/voice critique
 * pass. Redaction runs LAST before every model call (project rule); withinBudget
 * gates both calls; logUsage records spend. Founder-voice + banned-term rules are
 * injected via loadGlobalRules when the DB is present.
 *
 * The agent GENERATES; the human (operator) gates placement + publish. This script
 * only writes the markdown body to content/articles/<slug>.md and prints the
 * ArticleMeta JSON + accuracy verdict for the operator to review before inserting
 * the meta entry and rebuilding. It never publishes and never touches the chat
 * backend.
 *
 * Run:  set -a && . ./.env && set +a && npx tsx scripts/generate-article.ts "<topic>"
 */
import { writeFileSync } from "node:fs";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost } from "../lib/growth/model-router.js";
import { redact } from "../lib/growth/redaction.js";
import { loadGlobalRules, formatRulesBlock } from "../lib/growth/rules.js";

const TOPIC = process.argv[2] ?? "Harness Engineering and How it's used";
const SLUG = (process.argv[3] ?? "harness-engineering").toLowerCase();
const EXAMPLE =
  "JAKSwarm.com — the evidence engine / agent-orchestration platform that runs AI agents behind the JAK Shield risk gate (evidence graph, agent execution, drift detection, risk gate). Use it as the concrete worked example of a production agent harness.";

interface GeneratedArticle {
  title: string;
  description: string;
  category: "AI Foundations" | "AI Tools" | "Engineering" | "DevOps" | "Security" | "InBharat";
  abstract: string;
  faq: { q: string; a: string }[];
  hashtags: string[];
  bodyMarkdown: string;
}
interface AccuracyVerdict {
  accurate: boolean;
  jakswarmAccurate: boolean;
  founderVoice: boolean;
  bannedTermsAbsent: boolean;
  issues: { severity: "critical" | "major" | "minor"; area: string; fix: string }[];
  summary: string;
}

async function callGemini(model: string, system: string, user: string, maxTokens: number, temp: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: temp, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("gemini empty response");
  return text;
}

async function callOpenAI(model: string, system: string, user: string, maxTokens: number, temp: number): Promise<string> {
  const key = process.env.GROWTH_OPENAI_API_KEY;
  if (!key) throw new Error("GROWTH_OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: temp,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`openai HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("openai empty response");
  return text;
}

function safeParse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { /* fall through */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

async function main() {
  const rules = await loadGlobalRules();
  const rulesBlock = formatRulesBlock(rules);

  // ─── Draft pass (gemini-flash, the agent's draft model) ───
  const draftChoice = pickModel("draft");
  if (!isModelConfigured(draftChoice)) { console.error("Draft model not configured (needs GEMINI_API_KEY)."); process.exit(1); }
  if (!(await withinBudget())) { console.error("Monthly growth budget exhausted."); process.exit(1); }

  const draftSystem =
    `You write full-length, practical, hype-free SEO articles for InBharat.ai's "Learn AI with Reeturaj" hub, in the FIRST-PERSON voice of Reeturaj Goswami (founder of InBharat.ai — building practical AI built in India, for India and the world). ` +
    `India-first framing where natural. Lead with user benefit. No hype, no jargon-as-filler. Ground every claim in the provided example; do not invent product features.` +
    (rulesBlock ? `\n\nFounder-authored rules:\n${rulesBlock}` : "") +
    `\n\nHard constraints: NEVER mention "UniGurus". For any healthcare reference use "Sahayaak Seva" (never "RHCF Seva"). Keep the example factual to its public description.` +
    `\n\nReturn ONLY compact JSON with these exact fields: ` +
    `{"title": string (<=70 chars, plain text, no quotes), "description": string (<=155 char meta description), "category": "AI Foundations"|"AI Tools"|"Engineering"|"DevOps"|"Security"|"InBharat", "abstract": string (40-60 word direct-answer paragraph), "faq": [{"q": string, "a": string}] (exactly 5 items), "hashtags": string[] (6-8, starting with #InBharat #DeshKaAI), "bodyMarkdown": string}. ` +
    `bodyMarkdown rules: start with a single leading "> " blockquote line containing the abstract; blank line; then prose + "## " H2 sections; include a concrete worked example using the provided example; include a comparison or "how it works" section; end with a "## Frequently Asked Questions" section containing 5 "**Q:** ...\\n**A:** ..." pairs, then a final "---" line, then an italic byline "*Reeturaj Goswami* is the founder of InBharat.ai, building AI built in India, for India...", then a hashtag line. ~1200-1500 words. Escape newlines inside bodyMarkdown as \\n.`;

  const draftUser = `Topic: ${TOPIC}\nGrounding example (use factually): ${EXAMPLE}\nWrite the full article now. JSON only.`;

  const draftRedacted = redact(`${draftSystem}\n\n${draftUser}`);
  if (draftRedacted.containedSecret) { console.error("ABORT: secret detected in draft prompt; no model call made."); process.exit(1); }

  console.log(`[generate] drafting with ${draftChoice.provider}/${draftChoice.model}...`);
  let draftRaw: string;
  try {
    draftRaw = await callGemini(draftChoice.model, draftSystem, draftUser, 8192, 0.7);
  } catch (e) {
    void logUsage({ model: draftChoice.model, task: "draft", promptTokens: Math.ceil((draftSystem.length + draftUser.length) / 4), completionTokens: 0, totalTokens: Math.ceil((draftSystem.length + draftUser.length) / 4), costUsd: 0, status: "model_error", contextUrl: null, provider: draftChoice.provider });
    console.error("Draft model call failed:", (e as Error).message); process.exit(1);
  }
  const article = safeParse<GeneratedArticle>(draftRaw);
  const draftTokens = Math.ceil((draftSystem.length + draftUser.length + draftRaw.length) / 4);
  const draftCost = estimateCost(draftChoice, draftTokens);
  void logUsage({ model: draftChoice.model, task: "draft", promptTokens: Math.ceil((draftSystem.length + draftUser.length) / 4), completionTokens: Math.ceil(draftRaw.length / 4), totalTokens: draftTokens, costUsd: draftCost, status: article ? "ok" : "parse_failed", contextUrl: null, provider: draftChoice.provider });
  if (!article || !article.bodyMarkdown || !article.title) {
    console.error("Draft parse failed. Raw (truncated):\n", draftRaw.slice(0, 800)); process.exit(1);
  }
  console.log(`[generate] draft ok — "${article.title}" (${article.bodyMarkdown.split(/\s+/).length} words, $${draftCost.toFixed(6)})`);

  // ─── Accuracy / critique pass (openai gpt-4.1-mini, the agent's review model) ───
  let verdict: AccuracyVerdict | null = null;
  const reviewChoice = pickModel("review");
  if (isModelConfigured(reviewChoice) && (await withinBudget())) {
    const reviewSystem =
      `You are a critical reviewer for an InBharat.ai "Learn AI with Reeturaj" article. Judge it on factual accuracy, accuracy of the JAKSwarm.com example (it is an evidence engine / agent-orchestration platform that runs AI agents behind the JAK Shield risk gate, with an evidence graph, agent execution, and drift detection — do not accept invented features), founder first-person voice, and absence of banned terms ("UniGurus" must NEVER appear; "RHCF Seva" must NEVER appear). ` +
      `Return ONLY JSON: {"accurate": boolean, "jakswarmAccurate": boolean, "founderVoice": boolean, "bannedTermsAbsent": boolean, "issues": [{"severity":"critical|major|minor","area": string,"fix": string}], "summary": string}.`;
    const reviewUser = `Title: ${article.title}\nAbstract: ${article.abstract}\n\nBody:\n"""\n${article.bodyMarkdown}\n"""`;
    const reviewRedacted = redact(`${reviewSystem}\n\n${reviewUser}`);
    if (reviewRedacted.containedSecret) {
      console.error("[review] ABORT: secret in review prompt; skipped critique.");
    } else {
      console.log(`[generate] critiquing with ${reviewChoice.provider}/${reviewChoice.model}...`);
      try {
        const reviewRaw = await callOpenAI(reviewChoice.model, reviewSystem, reviewUser, 1200, 0.3);
        verdict = safeParse<AccuracyVerdict>(reviewRaw);
        const rTokens = Math.ceil((reviewSystem.length + reviewUser.length + reviewRaw.length) / 4);
        void logUsage({ model: reviewChoice.model, task: "review", promptTokens: Math.ceil((reviewSystem.length + reviewUser.length) / 4), completionTokens: Math.ceil(reviewRaw.length / 4), totalTokens: rTokens, costUsd: estimateCost(reviewChoice, rTokens), status: verdict ? "ok" : "parse_failed", contextUrl: null, provider: reviewChoice.provider });
      } catch (e) {
        console.error("[review] critique call failed:", (e as Error).message);
      }
    }
  } else {
    console.log("[generate] review model not configured/budget — skipping critique pass.");
  }

  // ─── Write the markdown body (human gate: operator reviews before meta insert + rebuild) ───
  const outPath = `content/articles/${SLUG}.md`;
  writeFileSync(outPath, article.bodyMarkdown + "\n", "utf8");
  console.log(`\n[generate] WROTE ${outPath} (${article.bodyMarkdown.split(/\s+/).length} words)`);

  // Banned-term hard check (independent of the model verdict — never trust the model alone).
  const banned = /UniGuru|RHCF\s*Seva/i.test(article.bodyMarkdown + " " + article.title + " " + article.abstract);

  console.log("\n================ ARTICLE META (insert into content/articles.meta.ts ARTICLES) ================");
  const meta = {
    slug: SLUG,
    title: article.title,
    description: article.description,
    category: article.category,
    datePublished: "2026-06-27",
    readMinutes: Math.max(5, Math.round(article.bodyMarkdown.split(/\s+/).length / 200)),
    abstract: article.abstract,
    faq: article.faq,
    hashtags: article.hashtags,
  };
  console.log(JSON.stringify(meta, null, 2));

  console.log("\n================ ACCURACY VERDICT ================");
  if (verdict) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    console.log("(no model verdict — review the body manually)");
  }
  console.log(`\n[banned-term hard check] ${banned ? "FAIL — banned term present!" : "PASS — no UniGurus/RHCF-Seva"}`);
  console.log(`[word count] ${article.bodyMarkdown.split(/\s+/).length}`);
}

await main();