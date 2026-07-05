/**
 * InBharat Growth Agent — hermetic unit checks.
 * Run: npm run test:growth  (tsx scripts/test-growth.ts)
 *
 * No network, no DB. Asserts: authorization deny-by-default + allow-listed
 * allow; redaction catches each secret class; parsePage + scoreSeo + scoreGeo
 * run against fixture HTML strings. Exits non-zero on any failure.
 */
import { canPerform, isDomainAuthorized, isRepoAuthorized, normalizeDomain } from "../lib/growth/authorization.js";
import { containsSecret, redact, isForbiddenPath } from "../lib/growth/redaction.js";
import { parsePage, extractInternalLinks, fetchSitemapUrls } from "../lib/growth/crawler.js";
import { scoreSeo } from "../lib/growth/seo-auditor.js";
import { scoreGeo } from "../lib/growth/geo-auditor.js";
import { promoteArticle } from "../lib/growth/promoter.js";
import { inboxPath, sanitizeFolder, formatInboxBlock, type InboxContextItem } from "../lib/growth/inbox.js";
import { formatStrategyBlock, type Strategy } from "../lib/growth/strategy.js";
import { monthlyBudgetUsd, bustBudgetCache, logUsage } from "../lib/growth/model-router.js";
import { authorizeCron, isCronAuthErr } from "../api/lib/requireAdmin.js";
import type { VercelRequest } from "@vercel/node";
import { assemblePipeline } from "../api/growth/pipeline.js";
import { buildDraftThreadMap, bodySchema } from "../api/growth/draft-threads.js";
import { statusChip } from "../lib/growth/pipelineStatus.js";
import { istStartOfDayIso } from "../lib/growth/spend.js";
import { slugFromArticleUrl, ARTICLE_PATH_PREFIX } from "../lib/growth/articleSlug.js";
import { mapResults, formatGroundingBlock } from "../lib/growth/retrieval.js";
import { extractResults } from "../lib/growth/search.js";
import { extractMermaidFences, detectUnclosedFences, validateMermaidFences, sanitizeMermaidFences } from "../lib/growth/mermaid-validate.js";
import { stripCitationMarkers } from "../lib/growth/citations.js";
import { isParaphraseOf } from "../lib/growth/learning.js";
import { ensureUniqueArticleSlug } from "../lib/growth/articleWriter.js";
import { ARTICLES } from "../content/articles.meta.js";
import {
  canonicalForSlug,
  buildDevtoTagsString,
  buildHashnodeTags,
  buildDevtoArticlePayload,
  buildHashnodeRequest,
  buildMediumImportHelper,
  MEDIUM_IMPORT_URL,
  mediumInstructions,
  platformCredentialEnv,
  platformLabel,
  syndicateArticle,
} from "../lib/growth/syndication/index.js";
import { publishToDevto } from "../lib/growth/syndication/devto.js";
import { publishToHashnode } from "../lib/growth/syndication/hashnode.js";
import type { SyndicationStatus } from "../lib/growth/syndication/types.js";
import { formatKnowledgeBlock, findDuplicateKnowledge, type KnowledgeItem, type KnowledgeType } from "../lib/growth/knowledge.js";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function approx(actual: number, expected: number, tol = 1) {
  return Math.abs(actual - expected) <= tol;
}

console.log("\nAuthorization (deny by default):");
check("unknown domain denied crawl", isDomainAuthorized("https://evil.example.com") === false);
check("unknown domain denied audit", canPerform("audit", "evil.example.com").allowed === false);
check("authorized domain allowed audit", canPerform("audit", "inbharat.ai").allowed === true);
check("publish always denied even if flag set", canPerform("publish", "inbharat.ai").allowed === false);
check("planned asset denied crawl but allowed audit path", canPerform("crawl", "sahayaakseva.in").allowed === false);
check("normalizeDomain strips www + path", normalizeDomain("https://www.jakswarm.com/some/path") === "jakswarm.com");
check("do_not_use repo denied read", isRepoAuthorized("inbharatai/RHCF-Seva") === false);

console.log("\nRedaction:");
check("catches AWS-style key", containsSecret("AKIAIOSFODNN7EXAMPLE"));
check("catches generic api key line", containsSecret("api_key=sk_live_1234567890abcdef"));
check("catches private key block", containsSecret("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggJjAgEAAoGB\n-----END PRIVATE KEY-----"));
check("catches JWT bearer token", containsSecret("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"));
check("catches password assignment", containsSecret("password=supersecret-hunter2-9988abc"));
check("flags .env.production as forbidden path", isForbiddenPath("config/.env.production") === true);
check("flags *.pem as forbidden path", isForbiddenPath("keys/server.pem") === true);
check("does not flag plain prose", containsSecret("The quick brown fox jumps over the lazy dog.") === false);
check("does not flag normal source path", isForbiddenPath("src/components/Button.tsx") === false);
const r = redact("OPENAI_API_KEY=sk-proj-1234567890abcdef my token");
check("redact masks secret value", !r.redacted.includes("sk-proj-1234567890abcdef"));
check("redact reports a match", r.containedSecret === true && r.matches.length > 0);

const FIXTURE = `<!doctype html><html><head>
<title>JAK Swarm — Evidence Engine for AI agents</title>
<meta name="description" content="JAK Swarm is the closed-loop company OS: evidence graph, agent execution, drift detection, and the JAK Shield risk gate. Built for Indian small businesses.">
<link rel="canonical" href="https://jakswarm.com/">
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
</head><body>
<h1>JAK Swarm: Evidence-Backed Agent Orchestration</h1>
<h2>What it is</h2>
<p>JAK Swarm is for Indian small businesses who need audited AI agents. It builds an evidence graph from your sources, plans agent work, runs agents behind the JAK Shield, and writes an audit trail. Who this is for: operations teams.</p>
<h2>FAQ</h2><p>What is JAK Swarm? It is the closed-loop company OS.</p>
<h2>Compare</h2><p>JAK Swarm vs alternatives: it adds drift detection and a risk gate.</p>
<p>Try the live demo and see screenshots of agent work and proof of output.</p>
<a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="https://github.com/inbharatai/jak-swarm">Source</a>
<img src="/hero.png" alt="JAK Swarm dashboard screenshot">
<button class="cta">Book a demo</button>
</body></html>`;

console.log("\nCrawler (parsePage):");
const meta = parsePage(FIXTURE, "https://jakswarm.com/");
check("title captured", meta.title?.startsWith("JAK Swarm") === true);
check("meta description captured", (meta.metaDescription?.length ?? 0) > 20);
check("canonical captured", meta.canonical === "https://jakswarm.com/");
check("h1 captured", meta.h1?.includes("Evidence-Backed") === true);
check("h2 count = 3", meta.h2Count === 3, `got ${meta.h2Count}`);
check("internal links counted", (meta.internalLinks ?? 0) >= 2);
check("image alt coverage tracked", meta.imagesTotal === 1 && meta.imagesWithoutAlt === 0);
check("word count > 50", (meta.wordCount ?? 0) > 50);
check("schema types include FAQPage", meta.schemaTypes?.some((t) => /faq/i.test(t)) === true);
check("hasCta true", meta.hasCta === true);
check("faqPresent true", meta.faqPresent === true);
check("comparisonPresent true", meta.comparisonPresent === true);
check("proofPresent true", meta.proofPresent === true);
check("audienceSignal true", meta.audienceSignal === true);

// wordCount must EXCLUDE inline <script>/<style>/<noscript> text — cheerio's
// .text() would otherwise count JS source / CSS as visible words (inflating
// the count and risking thin-content false negatives → false positives).
{
  const withScript = `<html><head><title>T</title>
<style>body { color: red; font-family: arial; padding: 0; }</style></head>
<body><h1>Hello World Article</h1><p>This real body has exactly eight words here now.</p>
<script>var x = "this script text should not count as words at all here"; var y = 42; const z = ["faq","demo","versus","screenshot"];</script>
<noscript>enable javascript to see faq demo versus screenshot</noscript></body></html>`;
  const m2 = parsePage(withScript, "https://example.com/");
  // Real visible body = "Hello World Article This real body has exactly eight words here now." (12 words).
  check("wordCount excludes script/style/noscript text", (m2.wordCount ?? 0) <= 13, `got ${m2.wordCount}`);
  // GEO signals must come from visible body, not script/noscript text. The
  // visible body has no faq/demo/versus/screenshot, so those signals must be false.
  check("faqPresent not polluted by script text", m2.faqPresent === false);
  check("proofPresent not polluted by script text", m2.proofPresent === false);
  check("comparisonPresent not polluted by script text", m2.comparisonPresent === false);
}

const links = extractInternalLinks(FIXTURE, "https://jakswarm.com/");
check("extractInternalLinks finds /pricing + /docs", links.includes("https://jakswarm.com/pricing") && links.includes("https://jakswarm.com/docs"));
check("extractInternalLinks excludes external", links.includes("https://github.com/inbharatai/jak-swarm") === false);

console.log("\nSEO auditor:");
const seo = scoreSeo(meta);
check("SEO score 70-100 (healthy page)", seo.score >= 70 && seo.score <= 100, `got ${seo.score}`);
const thin = scoreSeo({ ...meta, wordCount: 50, metaDescription: undefined, canonical: undefined, h1: undefined, internalLinks: 0 });
check("thin page scores low (<55)", thin.score < 55, `got ${thin.score}`);
check("SEO issues sorted by severity", thin.issues[0]?.severity === "critical" || thin.issues[0]?.severity === "high");

console.log("\nGEO auditor:");
const geo = scoreGeo(meta);
check("GEO score 70-100 (answerable page)", geo.score >= 70 && geo.score <= 100, `got ${geo.score}`);
const thinGeo = scoreGeo({ ...meta, wordCount: 50, h1: undefined, metaDescription: "short", faqPresent: false, proofPresent: false, audienceSignal: false, schemaTypes: [] });
check("thin GEO scores low (<55)", thinGeo.score < 55, `got ${thinGeo.score}`);

// ─── fetchSitemapUrls (network mocked; no real I/O) ───
console.log("\nCrawler (fetchSitemapUrls, mocked fetch):");
const origFetch = globalThis.fetch;
type FakeRes = { ok: boolean; status: number; text: () => Promise<string> };
function fakeRes(body: string, ok = true, status = 200): FakeRes {
  return { ok, status, text: () => Promise.resolve(body) };
}
try {
  // Case 1: plain urlset with article slugs + one external URL.
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : (input as Request).url;
    if (u.endsWith("/sitemap.xml")) {
      return Promise.resolve(
        fakeRes(
          '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            "<url><loc>https://inbharat.ai/</loc></url>" +
            "<url><loc>https://inbharat.ai/learn-ai-with-reeturaj/rag</loc></url>" +
            "<url><loc>https://inbharat.ai/learn-ai-with-reeturaj/cicd</loc></url>" +
            "<url><loc>https://example.com/external</loc></url>" +
            "</urlset>",
        ),
      );
    }
    return Promise.resolve(fakeRes("", false, 404));
  }) as typeof globalThis.fetch;

  const urls = await fetchSitemapUrls("https://inbharat.ai/sitemap.xml");
  check("returns all <loc> entries", urls.length === 4, `got ${urls.length}`);
  check("includes article slug", urls.includes("https://inbharat.ai/learn-ai-with-reeturaj/rag"));
  check("includes external loc verbatim (caller filters same-origin)", urls.includes("https://example.com/external"));

  // Unreachable sitemap → empty list (callers treat as "no extra targets").
  globalThis.fetch = ((_i: RequestInfo | URL) => Promise.resolve(fakeRes("", false, 500))) as typeof globalThis.fetch;
  check("unreachable sitemap → []", (await fetchSitemapUrls("https://inbharat.ai/")).length === 0);

  // Case 2: sitemap index → nested child sitemap (one level of recursion).
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : (input as Request).url;
    if (u.endsWith("/sitemap.xml")) {
      return Promise.resolve(
        fakeRes(
          '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            "<sitemap><loc>https://inbharat.ai/sitemap-articles.xml</loc></sitemap>" +
            "</sitemapindex>",
        ),
      );
    }
    if (u.endsWith("/sitemap-articles.xml")) {
      return Promise.resolve(
        fakeRes(
          '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            "<url><loc>https://inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai</loc></url>" +
            "</urlset>",
        ),
      );
    }
    return Promise.resolve(fakeRes("", false, 404));
  }) as typeof globalThis.fetch;
  const nested = await fetchSitemapUrls("https://inbharat.ai/");
  check("follows sitemap index to child urls", nested.includes("https://inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai"), `got ${JSON.stringify(nested)}`);
} finally {
  globalThis.fetch = origFetch;
}

// ─── Promoter (model + DB mocked; no real network or Supabase) ───
console.log("\nPromoter (mocked model, no DB):");
const origFetch2 = globalThis.fetch;
const origGeminiKey = process.env.GEMINI_API_KEY;
try {
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : (input as Request).url;
    if (u.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(
        fakeJson({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"caption":"RAG lets an LLM cite your own docs instead of guessing. Read the full breakdown.","internalLinks":["https://inbharat.ai/learn-ai-with-reeturaj/rag","https://inbharat.ai/learn-ai-with-reeturaj/vibe-coding"]}',
                  },
                ],
              },
            },
          ],
        }),
      );
    }
    return Promise.resolve(fakeJson({}, false, 404));
  }) as typeof globalThis.fetch;

  const draft = await promoteArticle("https://inbharat.ai/learn-ai-with-reeturaj/rag", {
    title: "RAG: How Indian AI Teams Make LLMs Actually Useful",
    description: "Retrieval-augmented generation explained.",
  });
  check("promoter returns pending status", draft.status === "pending", `got ${draft.status}`);
  check("promoter returns a caption", typeof draft.caption === "string" && draft.caption.length > 0, `got ${String(draft.caption)}`);
  check("promoter returns 1–3 internal links", draft.internalLinks.length >= 1 && draft.internalLinks.length <= 3, `got ${draft.internalLinks.length}`);
  check("promoter internal links are http(s) URLs", draft.internalLinks.every((l) => /^https?:\/\//.test(l)));

  // Redaction gate: a secret in the article title aborts BEFORE the model call.
  // (Runs with the key still set + fetch mocked, so the only abort reason is redaction.)
  const secretDraft = await promoteArticle("https://inbharat.ai/learn-ai-with-reeturaj/rag", {
    title: "RAG config leak: AKIAIOSFODNN7EXAMPLE found in logs",
    description: "Retrieval-augmented generation explained.",
  });
  check("redaction aborts model call on secret in title", secretDraft.caption === null, `got ${String(secretDraft.caption)}`);
  check("redaction note explains abort", typeof secretDraft.note === "string" && /redact/i.test(secretDraft.note), `got ${String(secretDraft.note)}`);

  // Unauthorized domain: assertAuthorized throws before any model/DB work.
  let threwAuthz = false;
  try {
    await promoteArticle("https://evil.example.com/learn-ai-with-reeturaj/rag", { title: "x" });
  } catch (e) {
    threwAuthz = (e as Error).constructor.name === "AuthorizationError" || /not authorized/i.test((e as Error).message);
  }
  check("unauthorized domain throws before model call", threwAuthz);

  // No model configured → caption null, note set, still pending (task + draft still created).
  process.env.GEMINI_API_KEY = "";
  const draft2 = await promoteArticle("https://inbharat.ai/learn-ai-with-reeturaj/cicd", { title: "CI/CD" });
  check("no model → null caption", draft2.caption === null);
  check("no model → still pending status", draft2.status === "pending");
  check("no model → note explains why", typeof draft2.note === "string" && draft2.note.length > 0, `got ${String(draft2.note)}`);
} finally {
  globalThis.fetch = origFetch2;
  if (origGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = origGeminiKey;
}

// ─── authorizeCron (Vercel signature | CRON_SECRET | admin | local-dev) ───
// Pure, hermetic: requireAdmin returns early (no network) when supabaseAdmin is
// null (no SUPABASE env in the test process), so the admin/local-dev branches
// are exercised without any real Supabase call.
console.log("\nCron auth (authorizeCron):");
function fakeReq(headers: Record<string, string>): VercelRequest {
  return { method: "GET", headers } as unknown as VercelRequest;
}
const origCronSecret = process.env.CRON_SECRET;
const origLocalPort = process.env.LOCAL_API_PORT;
const origNodeEnv = process.env.NODE_ENV;
try {
  // 1. Vercel scheduled cron identifies itself via the vercel-cron user-agent.
  let r = await authorizeCron(fakeReq({ "user-agent": "vercel-cron/1.0" }));
  check("vercel-cron UA allowed", r.ok === true && !isCronAuthErr(r) && r.source === "vercel-cron", JSON.stringify(r));

  // 2. … or via the x-vercel-cron-schedule header.
  r = await authorizeCron(fakeReq({ "x-vercel-cron-schedule": "0 6 * * *" }));
  check("x-vercel-cron-schedule header allowed", r.ok === true && !isCronAuthErr(r) && r.source === "vercel-cron");

  // 3. External scheduler carrying the shared CRON_SECRET (x-cron-secret).
  process.env.CRON_SECRET = "topsecret";
  r = await authorizeCron(fakeReq({ "x-cron-secret": "topsecret" }));
  check("CRON_SECRET via x-cron-secret allowed", r.ok === true && !isCronAuthErr(r) && r.source === "cron-secret");

  // 4. Same secret via Authorization: Bearer.
  r = await authorizeCron(fakeReq({ authorization: "Bearer topsecret" }));
  check("CRON_SECRET via Bearer allowed", r.ok === true && !isCronAuthErr(r) && r.source === "cron-secret");

  // 5. Wrong secret → not cron-secret → requireAdmin (supabaseAdmin null, not
  //    local dev) → 500. Denied.
  r = await authorizeCron(fakeReq({ "x-cron-secret": "wrong" }));
  check("wrong CRON_SECRET denied", r.ok === false, JSON.stringify(r));

  // 6. Bare external request (no signature, no secret) → denied.
  r = await authorizeCron(fakeReq({ "user-agent": "Mozilla/5.0" }));
  check("bare external request denied", r.ok === false, JSON.stringify(r));

  // 7. Local dev (LOCAL_API_PORT set, not production) → allowed as local-dev.
  process.env.LOCAL_API_PORT = "3001";
  process.env.NODE_ENV = "development";
  r = await authorizeCron(fakeReq({ "user-agent": "Mozilla/5.0" }));
  // In local dev the admin branch short-circuits (requireAdmin allow-through),
  // so the source is "admin" (userId local-dev) — either way it must be allowed.
  check("local dev allowed without secret", r.ok === true && !isCronAuthErr(r), JSON.stringify(r));
} finally {
  if (origCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = origCronSecret;
  if (origLocalPort === undefined) delete process.env.LOCAL_API_PORT;
  else process.env.LOCAL_API_PORT = origLocalPort;
  if (origNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = origNodeEnv;
}

// ─── Monthly budget cap (env fallback + default + cache bust) ───
// supabaseAdmin is null in the test process (no SUPABASE env), so monthlyBudgetUsd
// exercises the env → default fallback path (the DB path is covered by the
// local manual run + e2e, since supabaseAdmin is a build-time singleton that
// can't be re-pointed at runtime without a refactor).
console.log("\nMonthly budget cap (monthlyBudgetUsd):");
const origBudgetEnv = process.env.GROWTH_MONTHLY_BUDGET_USD;
try {
  bustBudgetCache();
  delete process.env.GROWTH_MONTHLY_BUDGET_USD;
  let b = await monthlyBudgetUsd();
  check("no env → default $20", b.cap === 20 && b.source === "default", JSON.stringify(b));

  process.env.GROWTH_MONTHLY_BUDGET_USD = "7";
  bustBudgetCache();
  b = await monthlyBudgetUsd();
  check("env $7 → cap 7, source env", b.cap === 7 && b.source === "env", JSON.stringify(b));

  // Cache: a second read without busting returns the same (env) value even if
  // the env var changes underneath — proves the cache is honored this month.
  process.env.GROWTH_MONTHLY_BUDGET_USD = "99";
  b = await monthlyBudgetUsd();
  check("cached cap honored (still 7, not 99)", b.cap === 7, JSON.stringify(b));

  // bustBudgetCache forces a re-read of the new env value.
  bustBudgetCache();
  b = await monthlyBudgetUsd();
  check("bustBudgetCache re-reads env (99)", b.cap === 99 && b.source === "env", JSON.stringify(b));

  // Non-numeric / zero / negative env → default 20, source default.
  process.env.GROWTH_MONTHLY_BUDGET_USD = "not-a-number";
  bustBudgetCache();
  b = await monthlyBudgetUsd();
  check("non-numeric env → default $20", b.cap === 20 && b.source === "default", JSON.stringify(b));
} finally {
  if (origBudgetEnv === undefined) delete process.env.GROWTH_MONTHLY_BUDGET_USD;
  else process.env.GROWTH_MONTHLY_BUDGET_USD = origBudgetEnv;
  bustBudgetCache();
}

// ─── logUsage (no-throw with supabaseAdmin null) ───
// With supabaseAdmin null, logUsage falls through to a console.info log of the
// record and never throws. The context_url/provider write into growth_model_usage
// is verified by the build + local manual run (the columns exist via the
// 20260625000001 migration and model-router writes them — read-verified).
console.log("\nlogUsage (no Supabase → no-throw):");
try {
  await logUsage({
    model: "gemini-flash-latest",
    task: "draft",
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.00002,
    status: "ok",
    contextUrl: "https://inbharat.ai/learn-ai-with-reeturaj/rag",
    provider: "gemini",
  });
  check("logUsage resolves (no throw) when Supabase unset", true);
} catch (e) {
  check("logUsage resolves (no throw) when Supabase unset", false, (e as Error).message);
}

// ─── Agent rules (no DB → empty; formatter groups by kind) ───
// With supabaseAdmin null, loadRulesForUrl returns [] (pre-migration / DB
// absent), so the promoter's rules block is "" and its prompt is unchanged.
// The formatter is pure and verified directly here.
const { loadRulesForUrl, formatRulesBlock, bustRulesCache } = await import("../lib/growth/rules.js");
console.log("\nAgent rules (no Supabase → empty, formatter pure):");
{
  const rules = await loadRulesForUrl("https://inbharat.ai/learn-ai-with-reeturaj/rag");
  check("loadRulesForUrl returns [] with no DB", Array.isArray(rules) && rules.length === 0);
  check("formatRulesBlock([]) is empty string", formatRulesBlock([]) === "");
  const block = formatRulesBlock([
    { id: "1", scope: "global", scopeKey: null, kind: "dont", ruleText: "Never mention UniGurus.", enabled: true },
    { id: "2", scope: "global", scopeKey: null, kind: "voice", ruleText: "Founder first-person voice.", enabled: true },
    { id: "3", scope: "global", scopeKey: null, kind: "do", ruleText: "Lead with user benefit.", enabled: true },
  ]);
  check("rules block labels each kind", block.includes("DON'T:") && block.includes("VOICE:") && block.includes("DO:"));
  check("rules block orders dont before do", block.indexOf("DON'T:") < block.indexOf("DO:"));
  check("rules block includes the founder instruction text", block.includes("Never mention UniGurus."));
  bustRulesCache();
}

// ─── GitHub deny gate (hermetic: gate runs before token/network) ───
// The per-repo deny gate is enforced before GITHUB_TOKEN is checked, so with no
// token + no network we can assert: RHCF-Seva is refused (denied:true), while
// the canonical Sahayaak Seva repo passes the gate (fails only on missing token).
const { verifyRepo, fetchReadme } = await import("../lib/growth/github.js");
console.log("\nGitHub deny gate (no token / no network):");
{
  const denied = await verifyRepo("inbharatai/RHCF-Seva");
  check("RHCF-Seva verify refused by gate", denied.ok === false && denied.denied === true);
  const deniedRm = await fetchReadme("inbharatai/RHCF-Seva");
  check("RHCF-Seva readme refused by gate", deniedRm.ok === false && deniedRm.denied === true);
  const allowed = await verifyRepo("inbharatai/sahayaak-Seva");
  check("Sahayaak Seva passes gate (fails on missing token, not denied)", allowed.ok === false && allowed.denied === undefined && /GITHUB_TOKEN/.test(allowed.error || ""));
}

// ─── Critique + revision (Phase 2) — hermetic: review model mocked via fetch ───
// critique.ts is Gemini-only now: pickModel('review') → gemini-2.5-flash, gated on
// GEMINI_API_KEY. withinBudget + logUsage hit no fetch when supabaseAdmin is null
// (budget=env/default, spent=0/queryOk=true, logUsage=console.info). So the ONLY
// fetch is callGemini — letting us assert ok / parse_failed / skipped / redacted
// branches with a call counter. Mocks return Gemini-shaped responses.
const { critiqueAndRevise } = await import("../lib/growth/critique.js");
console.log("\nCritique + revision (mocked review model):");
const origFetchCrit = globalThis.fetch;
const origGeminiKeyCrit = process.env.GEMINI_API_KEY;
try {
  // ok: model returns a revised draft + a weakness → status ok, revised differs, cost>0.
  let critCalls = 0;
  globalThis.fetch = ((_i: RequestInfo | URL) => {
    critCalls++;
    return Promise.resolve(
      fakeJson({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ revised: "RAG lets your team cite real docs, not guesses — here's the 90-second version.", weaknesses: [{ severity: "major", area: "hook", fix: "lead with the user benefit, not the acronym" }] }),
                },
              ],
            },
          },
        ],
      }),
    );
  }) as typeof globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  const ok = await critiqueAndRevise({ draftBody: "RAG is retrieval-augmented generation.", context: { url: "https://inbharat.ai/learn-ai-with-reeturaj/rag", kind: "linkedin", title: "RAG" } });
  check("critique ok → status ok", ok.status === "ok", `got ${ok.status}`);
  check("critique ok → revised differs from candidate", typeof ok.revised === "string" && ok.revised !== "RAG is retrieval-augmented generation.", `got ${String(ok.revised)}`);
  check("critique ok → weaknesses populated", ok.weaknesses.length >= 1, `got ${ok.weaknesses.length}`);
  check("critique ok → costUsd > 0", ok.costUsd > 0, `got ${ok.costUsd}`);
  check("critique ok → model populated", typeof ok.model === "string" && ok.model.length > 0, `got ${String(ok.model)}`);
  check("critique ok → fetch was called once", critCalls === 1, `got ${critCalls}`);

  // parse_failed: model returns non-JSON text → keep candidate, status parse_failed.
  critCalls = 0;
  globalThis.fetch = ((_i: RequestInfo | URL) => {
    critCalls++;
    return Promise.resolve(fakeJson({ candidates: [{ content: { parts: [{ text: "sorry, I cannot help with that." }] } }] }));
  }) as typeof globalThis.fetch;
  const pf = await critiqueAndRevise({ draftBody: "Some draft.", context: { url: "https://inbharat.ai/x", kind: "linkedin" } });
  check("critique parse_failed → status parse_failed", pf.status === "parse_failed", `got ${pf.status}`);
  check("critique parse_failed → keeps candidate (revised null)", pf.revised === null);

  // skipped: review model unconfigured (no key) → status skipped, no fetch.
  critCalls = 0;
  delete process.env.GEMINI_API_KEY;
  const sk = await critiqueAndRevise({ draftBody: "Some draft.", context: { url: "https://inbharat.ai/x", kind: "linkedin" } });
  check("critique unconfigured → status skipped", sk.status === "skipped", `got ${sk.status}`);
  check("critique unconfigured → no fetch", critCalls === 0, `got ${critCalls}`);

  // redacted: secret in the draft body → status redacted, no fetch (even with key set).
  process.env.GEMINI_API_KEY = "test-key";
  critCalls = 0;
  globalThis.fetch = ((_i: RequestInfo | URL) => {
    critCalls++;
    return Promise.resolve(fakeJson({ candidates: [{ content: { parts: [{ text: '{"revised":"x","weaknesses":[]}' }] } }] }));
  }) as typeof globalThis.fetch;
  const rd = await critiqueAndRevise({ draftBody: "Leaked key: AKIAIOSFODNN7EXAMPLE in the config.", context: { url: "https://inbharat.ai/x", kind: "linkedin" } });
  check("critique secret in body → status redacted", rd.status === "redacted", `got ${rd.status}`);
  check("critique secret in body → no fetch (aborted before call)", critCalls === 0, `got ${critCalls}`);
  check("critique secret in body → keeps candidate (revised null)", rd.revised === null);
} finally {
  globalThis.fetch = origFetchCrit;
  if (origGeminiKeyCrit === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = origGeminiKeyCrit;
}

// ─── Cover drafting (auto-cover via gemini-2.5-flash-image) — hermetic ───
// generateCoverDraft is Gemini-only (pickModel('cover')), gated on GEMINI_API_KEY.
// supabaseAdmin is null here → hasExistingCoverDraft returns false (no idempotency
// skip), withinBudget passes (spent=0/queryOk=true), persistCoverDraft is a no-op
// (returns null ids). So we can assert the happy path + the prompt is text-free +
// graceful skip when unconfigured, with the image model mocked via fetch.
const { generateCoverDraft } = await import("../lib/growth/cover.js");
import type { ArticleMeta } from "../content/articles.meta.js";
console.log("\nCover drafting (mocked image model):");
const origFetchCover = globalThis.fetch;
const origGeminiKeyCover = process.env.GEMINI_API_KEY;
try {
  const fakeMeta = {
    slug: "harness-engineering",
    title: "Harness Engineering: Building Safe and Reliable AI Agent Systems",
    description: "x",
    category: "Engineering",
    datePublished: "2026-06-27",
    readMinutes: 7,
    abstract: "Harness engineering wraps autonomous AI agents in deterministic software wrappers.",
    faq: [],
  } as ArticleMeta;

  // ok: image model returns inlineData PNG → status pending, filename <slug>.png.
  let coverCalls = 0;
  let capturedPrompt = "";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    coverCalls++;
    const u = typeof input === "string" ? input : (input as Request).url;
    if (u.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(
        fakeJson({
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAwCBMWQAA" }, mimeType: "image/png" },
                ],
              },
            },
          ],
        }),
      );
    }
    return Promise.resolve(fakeJson({}, false, 404));
  }) as typeof globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  const cov = await generateCoverDraft(fakeMeta);
  check("cover ok → status pending", cov.status === "pending", `got ${cov.status}`);
  check("cover ok → filename is <slug>.png", cov.filename === "harness-engineering.png", `got ${cov.filename}`);
  check("cover ok → image model called once", coverCalls === 1, `got ${coverCalls}`);

  // unconfigured: no GEMINI_API_KEY → status skipped, no fetch.
  coverCalls = 0;
  delete process.env.GEMINI_API_KEY;
  const covSkip = await generateCoverDraft(fakeMeta);
  check("cover unconfigured → status skipped", covSkip.status === "skipped", `got ${covSkip.status}`);
  check("cover unconfigured → no fetch", coverCalls === 0, `got ${coverCalls}`);

  // prompt is text-free: buildCoverPrompt is exported but pure (no model call),
  // so assert via a second mock that captures the request body text and checks
  // it forbids text.
  process.env.GEMINI_API_KEY = "test-key";
  coverCalls = 0;
  capturedPrompt = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    coverCalls++;
    if (init?.body && typeof init.body === "string") {
      try {
        const parsed = JSON.parse(init.body) as { contents?: { parts?: { text?: string }[] }[] };
        capturedPrompt = parsed.contents?.[0]?.parts?.[0]?.text ?? "";
      } catch { /* ignore */ }
    }
    return Promise.resolve(
      fakeJson({
        candidates: [{ content: { parts: [{ inlineData: { data: "iVBORw0KGgo=", mimeType: "image/png" } }] } }],
      }),
    );
  }) as typeof globalThis.fetch;
  await generateCoverDraft(fakeMeta);
  check("cover prompt → forbids text in image", /NO TEXT/i.test(capturedPrompt), "prompt should forbid text in the image");
  check("cover prompt → includes the topic title", /Harness Engineering/i.test(capturedPrompt), "prompt should name the topic");
  check("cover prompt → specifies 1200x630", /1200x630/i.test(capturedPrompt), "prompt should specify dimensions");
} finally {
  globalThis.fetch = origFetchCover;
  if (origGeminiKeyCover === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = origGeminiKeyCover;
}

// ─── Inbox folders (Phase B) — pure path/sanitize/block-formatter checks ───
console.log("\nInbox folders (sanitize/path/block, no DB):");
{
  check("sanitizeFolder strips unsafe chars", sanitizeFolder("campaigns/launch!") === "campaigns/launch");
  check("sanitizeFolder root → ''", sanitizeFolder("") === "");
  check("sanitizeFolder collapses empty segments", sanitizeFolder("a//b") === "a/b");
  check("inboxPath root → <sha>/<file>", inboxPath("abc123", "my file.md") === "abc123/my_file.md");
  check("inboxPath folder → <folder>/<sha>/<file>", inboxPath("abc123", "img.png", "campaigns/launch") === "campaigns/launch/abc123/img.png");
  check("inboxPath folder is sanitized", inboxPath("abc123", "f.txt", "../evil") === "evil/abc123/f.txt");
  check("formatInboxBlock empty → ''", formatInboxBlock([]) === "");
  const items: InboxContextItem[] = [
    { id: "1", folder: "campaigns/launch", kind: "md", originalName: "brief.md", excerpt: "Position InBharat as the  AI infra partner.", mediaNote: null },
    { id: "2", folder: "campaigns/launch", kind: "image", originalName: "ref.png", excerpt: null, mediaNote: "image asset (ref.png) — available for the vision/cover task to analyze on command" },
    { id: "3", folder: "", kind: "txt", originalName: "notes.txt", excerpt: "Reeturaj founded InBharat.ai.", mediaNote: null },
  ];
  const block = formatInboxBlock(items);
  check("formatInboxBlock has INBOX ASSETS header", /^INBOX ASSETS/.test(block));
  check("formatInboxBlock groups by folder label", block.includes("Folder: campaigns/launch") && block.includes("Folder: (root)"));
  check("formatInboxBlock labels text excerpt", block.includes("[text/md] brief.md"));
  check("formatInboxBlock labels media asset", block.includes("[media/image]"));
  check("formatInboxBlock cites founder-fed guidance", /review and use wisely/i.test(block));
}

// ─── Strategy block (Phase D) — pure formatter checks ───
console.log("\nStrategy block (formatStrategyBlock, no DB):");
{
  const empty: Strategy = { positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null, pillars: null, productPlan: null, cadence: null, kpis: null };
  check("formatStrategyBlock empty → ''", formatStrategyBlock(empty) === "");
  const s: Strategy = { positioning: "India's AI infra studio.", icp: "Indian SMB engineering teams.", audience: "Hands-on builders.", voice: "Concise, hype-free.", competitiveDiff: null, goals: "Ship 3 reference articles/qtr.", pillars: null, productPlan: null, cadence: null, kpis: null };
  const block = formatStrategyBlock(s);
  check("formatStrategyBlock has STRATEGY header", /^STRATEGY/.test(block));
  check("formatStrategyBlock includes positioning", block.includes("POSITIONING:\nIndia's AI infra studio."));
  check("formatStrategyBlock omits empty competitiveDiff", !block.includes("COMPETITIVE DIFFERENCE"));
  check("formatStrategyBlock labels ICP/audience/voice", block.includes("ICP (ideal customer profile)") && block.includes("AUDIENCE") && block.includes("VOICE"));
  check("formatStrategyBlock obeys-on-brand guidance present", /on-brand/i.test(block));

  // Phase C expansion: structured system fields (pillars/productPlan/cadence/kpis)
  // are woven into the prompt alongside the base fields, and omitted when empty.
  const sys: Strategy = { ...empty, pillars: "1. SEO\n2. Content", productPlan: "InBharat.ai — SEO.", cadence: "Mon: SEO.", kpis: "5 articles/week." };
  const sysBlock = formatStrategyBlock(sys);
  check("formatStrategyBlock includes GROWTH PILLARS label", sysBlock.includes("GROWTH PILLARS:\n1. SEO\n2. Content"));
  check("formatStrategyBlock includes PER-PRODUCT plan label", sysBlock.includes("PER-PRODUCT VISIBILITY PLAN:\nInBharat.ai — SEO."));
  check("formatStrategyBlock includes CADENCE label", sysBlock.includes("90-DAY CADENCE"));
  check("formatStrategyBlock includes KPIs label", sysBlock.includes("KPIs + TARGETS:\n5 articles/week."));
  check("formatStrategyBlock omits empty base fields in system-only block", !sysBlock.includes("POSITIONING"));
}

// ─── Phase C: conversational agent tools + vision + Auto Mode (no DB / no key) ───
console.log("\nPhase C agent (tools registry, dispatch, vision, auto-mode, no DB/key):");
{
  const { AGENT_TOOLS, dispatchTool } = await import("../lib/growth/agentTools.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  check("agent tools registry has 15 tools (10 base + 4 KB + 1 topic discovery)", AGENT_TOOLS.length === 15, `got ${names.join(",")}`);
  check("agent tools include the CMO command set",
    ["list_recent_drafts", "redraft_caption", "review_text", "generate_cover", "list_inbox_folder", "analyze_attachment", "write_article", "web_search", "write_video_script", "promote_article"].every((n) => names.includes(n)),
    JSON.stringify(names));
  check("agent tools include the knowledge-base set (Phase 2)",
    ["save_knowledge", "search_knowledge", "list_knowledge", "find_duplicate"].every((n) => names.includes(n)),
    JSON.stringify(names));
  check("agent tools include find_high_intent_topics (Phase 3)", names.includes("find_high_intent_topics"), JSON.stringify(names));
  check("every agent tool has a name + description", AGENT_TOOLS.every((t) => typeof t.name === "string" && typeof t.description === "string" && t.description.length > 20));

  // dispatchTool: unknown tool → ok:false (never throws).
  const unknown = await dispatchTool("does_not_exist", {});
  check("dispatchTool unknown tool → ok:false", unknown.ok === false, JSON.stringify(unknown));

  // dispatchTool: list_recent_drafts on no-DB → graceful ok:false.
  const lrd = await dispatchTool("list_recent_drafts", { limit: 5 });
  check("list_recent_drafts no-DB → ok:false", lrd.ok === false, JSON.stringify(lrd));

  // dispatchTool: generate_cover with a fake slug (no draftId) → ok:false "no article found" (pure, no DB).
  const badSlug = await dispatchTool("generate_cover", { slug: "this-slug-does-not-exist-xyz" });
  check("generate_cover bad slug → ok:false", badSlug.ok === false && /no.*article found/i.test(badSlug.message ?? ""), JSON.stringify(badSlug));

  // dispatchTool: generate_cover with a real slug but no key → ok:false skipped (no model).
  const realSlug = await dispatchTool("generate_cover", { slug: "rag" });
  check("generate_cover real slug no-key → ok:false (skipped)", realSlug.ok === false, JSON.stringify(realSlug));

  // dispatchTool: generate_cover with neither slug nor draftId → ok:false (arg guard).
  const noArgs = await dispatchTool("generate_cover", {});
  check("generate_cover no args → ok:false", noArgs.ok === false && /slug OR a draftId/i.test(noArgs.message ?? ""), JSON.stringify(noArgs));

  // dispatchTool: generate_cover with a draftId but no DB → ok:false "database not configured"
  // (the draft-article path must not crash before the DB check). Hermetic — no network/key.
  const draftPath = await dispatchTool("generate_cover", { draftId: "00000000-0000-0000-0000-000000000000" });
  check("generate_cover draftId no-DB → ok:false", draftPath.ok === false && /not configured|not found/i.test(draftPath.message ?? ""), JSON.stringify(draftPath));

  // dispatchTool: review_text validates args before any model/DB work (pure, hermetic).
  const rtNoText = await dispatchTool("review_text", { instruction: "review and upgrade" });
  check("review_text no text → ok:false", rtNoText.ok === false && /need the text/i.test(rtNoText.message ?? ""), JSON.stringify(rtNoText));
  const rtNoInstr = await dispatchTool("review_text", { text: "Some text to review." });
  check("review_text no instruction → ok:false", rtNoInstr.ok === false && /need an instruction/i.test(rtNoInstr.message ?? ""), JSON.stringify(rtNoInstr));
  // review_text with both args but no DB → ok:false "database not configured" (graceful, no model call).
  const rtNoDb = await dispatchTool("review_text", { text: "# Heading\n\nLong enough body text here.", instruction: "review and upgrade" });
  check("review_text no-DB → ok:false", rtNoDb.ok === false && /not configured/i.test(rtNoDb.message ?? ""), JSON.stringify(rtNoDb));

  // dispatchTool: web_search validates the query before any network call (pure, hermetic).
  const wsNoQuery = await dispatchTool("web_search", {});
  check("web_search no query → ok:false", wsNoQuery.ok === false && /need a search query/i.test(wsNoQuery.message ?? ""), JSON.stringify(wsNoQuery));
  const wsBlank = await dispatchTool("web_search", { query: "   " });
  check("web_search blank query → ok:false", wsBlank.ok === false && /need a search query/i.test(wsBlank.message ?? ""), JSON.stringify(wsBlank));

  // dispatchTool: promote_article validates args before any DB/model work (pure, hermetic).
  const paNoUrl = await dispatchTool("promote_article", {});
  check("promote_article no url → ok:false", paNoUrl.ok === false && /need the article url/i.test(paNoUrl.message ?? ""), JSON.stringify(paNoUrl));
  const paBadUrl = await dispatchTool("promote_article", { url: "https://example.com/some-other-path" });
  check("promote_article non-article url → ok:false", paBadUrl.ok === false && /learn-ai-with-reeturaj/i.test(paBadUrl.message ?? ""), JSON.stringify(paBadUrl));
  const paNotUrl = await dispatchTool("promote_article", { url: "not a url at all" });
  check("promote_article malformed url → ok:false", paNotUrl.ok === false && /invalid url/i.test(paNotUrl.message ?? ""), JSON.stringify(paNotUrl));
  // Valid article URL but no DB → ok:false "database not configured" (graceful, no promote call).
  const paNoDb = await dispatchTool("promote_article", { url: "https://inbharat.ai/learn-ai-with-reeturaj/rag" });
  check("promote_article valid url no-DB → ok:false", paNoDb.ok === false && /not configured/i.test(paNoDb.message ?? ""), JSON.stringify(paNoDb));

  // dispatchTool: list_inbox_folder no-DB → ok:true with empty items (never throws).
  const lif = await dispatchTool("list_inbox_folder", {});
  check("list_inbox_folder no-DB → ok:true empty", lif.ok === true && Array.isArray(lif.items) && lif.items.length === 0, JSON.stringify(lif));

  // pickNextCalendarTopic (morning cron topic-picker) + calendar integrity — pure, hermetic.
  const { pickNextCalendarTopic } = await import("../lib/growth/calendar.js");
  const { BUILD_WITH_REETURAJ_CALENDAR } = await import("../content/build-with-reeturaj-calendar.js");
  const { slugifyTitle } = await import("../lib/growth/articleWriter.js");
  const { ARTICLES: CAL_ARTICLES } = await import("../content/articles.meta.js");
  check("content calendar has ≥17 topics", BUILD_WITH_REETURAJ_CALENDAR.length >= 17, `got ${BUILD_WITH_REETURAJ_CALENDAR.length}`);
  check("every calendar topic has a topic + category", BUILD_WITH_REETURAJ_CALENDAR.every((c) => typeof c.topic === "string" && c.topic.trim().length > 0 && typeof c.category === "string"));
  const calSlugs = BUILD_WITH_REETURAJ_CALENDAR.map((c) => slugifyTitle(c.topic));
  check("calendar topics have unique slugs", new Set(calSlugs).size === calSlugs.length, `dupes: ${[...new Set(calSlugs.filter((s, i) => calSlugs.indexOf(s) !== i))].join(",")}`);
  // No calendar topic may slug-collide with a published slug — else the morning run
  // would skip it forever as "already published", or risk re-drafting a live article.
  const calPublishedSlugs = new Set(CAL_ARTICLES.map((a) => a.slug));
  const calCollisions = BUILD_WITH_REETURAJ_CALENDAR.filter((c) => calPublishedSlugs.has(slugifyTitle(c.topic)));
  check("no calendar topic slug-collides with a published slug", calCollisions.length === 0, `colliding: ${calCollisions.map((c) => c.topic).join(",")}`);
  // First entry is picked when nothing is published/drafted.
  const pkClean = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, new Set(), []);
  check("pickNextCalendarTopic clean → first entry", pkClean && pkClean.topic === BUILD_WITH_REETURAJ_CALENDAR[0].topic, JSON.stringify(pkClean?.topic));
  // Skip a published slug → returns the second entry.
  const pkSkipPub = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, new Set([slugifyTitle(BUILD_WITH_REETURAJ_CALENDAR[0].topic)]), []);
  check("pickNextCalendarTopic skips a published slug", pkSkipPub && pkSkipPub.topic === BUILD_WITH_REETURAJ_CALENDAR[1].topic, JSON.stringify(pkSkipPub?.topic));
  // Skip a drafted slug too → returns the third entry.
  const pkSkipDraft = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, new Set([slugifyTitle(BUILD_WITH_REETURAJ_CALENDAR[0].topic)]), [slugifyTitle(BUILD_WITH_REETURAJ_CALENDAR[1].topic)]);
  check("pickNextCalendarTopic skips a drafted slug", pkSkipDraft && pkSkipDraft.topic === BUILD_WITH_REETURAJ_CALENDAR[2].topic, JSON.stringify(pkSkipDraft?.topic));
  // Empty calendar → null.
  check("pickNextCalendarTopic empty calendar → null", pickNextCalendarTopic([], new Set(), []) === null);
  // Every entry either published or drafted → null (calendar exhausted → free-plan).
  const half = Math.ceil(calSlugs.length / 2);
  const allPublished = new Set(calSlugs.slice(0, half));
  const allDrafted = calSlugs.slice(half);
  check("pickNextCalendarTopic all built → null", pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, allPublished, allDrafted) === null);
  // Substantive-duplicate guard (the real fine-tuning-vs-RAG stall): a published
  // slug that is a LONGER, more-specific version of a calendar topic — published
  // starts with `<calSlug>-` — must be skipped. Otherwise the agent refuses to
  // re-write it as a duplicate and the morning cron stalls on that entry every
  // day (pick → refuse → zero drafts). Calendar slug is the broad version; the
  // reverse direction (calendar longer than published) is a legit follow-up, NOT skipped.
  const cal0Slug = slugifyTitle(BUILD_WITH_REETURAJ_CALENDAR[0].topic);
  const cal1Slug = slugifyTitle(BUILD_WITH_REETURAJ_CALENDAR[1].topic);
  const supersetPublished = new Set([cal0Slug + "-for-your-indian-ai-product"]);
  const pkSuperset = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, supersetPublished, []);
  check("pickNextCalendarTopic skips a published superset slug (prefix guard)", pkSuperset && pkSuperset.topic === BUILD_WITH_REETURAJ_CALENDAR[1].topic, JSON.stringify(pkSuperset?.topic));
  // Reverse direction must NOT skip: a calendar topic LONGER than a published broad
  // slug is a legitimate deeper follow-up and must still be picked.
  const pkReverse = pickNextCalendarTopic(BUILD_WITH_REETURAJ_CALENDAR, new Set([cal1Slug.slice(0, 6)]), []);
  check("pickNextCalendarTopic does NOT skip when published slug is shorter (reverse)", pkReverse && pkReverse.topic === BUILD_WITH_REETURAJ_CALENDAR[0].topic, JSON.stringify(pkReverse?.topic));

  // detectNarratedToolCall — the narration-as-text recovery detector. The model
  // sometimes writes "Called tool write_article(...)" in prose instead of emitting
  // a real Gemini functionCall; the agent loop corrects + retries when this fires.
  const { detectNarratedToolCall } = await import("../lib/growth/agent.js");
  const NARR_TOOLS = ["write_article", "promote_article", "generate_cover", "review_text", "web_search"];
  check("narration: 'Called tool write_article({...})' → write_article", detectNarratedToolCall('Called tool write_article({"topic":"Evals","instruction":"..."}).', NARR_TOOLS) === "write_article");
  check("narration: 'I'll call promote_article(...)' → promote_article", detectNarratedToolCall("I'll call promote_article({\"url\":\"https://inbharat.ai/x\"}).", NARR_TOOLS) === "promote_article");
  check("narration: 'let me run web_search(...)' → web_search", detectNarratedToolCall("Let me run web_search({\"query\":\"trending ai india\"}).", NARR_TOOLS) === "web_search");
  check("narration: 'I will use generate_cover(...)' → generate_cover", detectNarratedToolCall("I will use generate_cover({\"draftId\":\"abc\"}).", NARR_TOOLS) === "generate_cover");
  // False positives must NOT fire — these are normal text answers, not narrations.
  check("narration: doc-style 'write_article(topic, instruction) creates a draft' → null", detectNarratedToolCall("The write_article(topic, instruction) tool creates a long-form article draft you review in Issues.", NARR_TOOLS) === null);
  check("narration: normal closing 'Drafted the article — review in Issues' → null", detectNarratedToolCall("Done. I drafted the article and its LinkedIn caption — review both in Issues, then approve to publish.", NARR_TOOLS) === null);
  check("narration: empty text → null", detectNarratedToolCall("", NARR_TOOLS) === null);
  check("narration: no tool names in text → null", detectNarratedToolCall("I'll call the thingamajig tool now.", NARR_TOOLS) === null);

  // summarizeToolResult (history replay) — MUST preserve the draftId the model
  // produced in an earlier turn, even when the result carries a long preview that
  // the old JSON.stringify+slice(0,240) truncated BEFORE the draftId field. This
  // is the cross-turn memory-retention fix for "generate_cover → draft not found".
  const { summarizeToolResult } = await import("../lib/growth/agent.js");
  const longPreview = "x".repeat(600);
  const writeRes = { ok: true, message: `Drafted article "Neural Networks" — review in Issues.`, draftId: "abc-123-uuid", slug: "neural-networks", title: "Neural Networks", category: "AI Foundations", readMinutes: 5, preview: longPreview };
  const summary = summarizeToolResult("write_article", writeRes);
  check("summarizeToolResult preserves draftId past a long preview", summary.includes("draftId=abc-123-uuid"), summary);
  check("summarizeToolResult preserves slug", summary.includes("slug=neural-networks"), summary);
  check("summarizeToolResult includes ok + tool name", summary.includes("ok=true") && summary.includes("write_article"), summary);
  check("summarizeToolResult does NOT dump the full 600-char preview", !summary.includes("x".repeat(200)), `preview leaked: ${summary.length} chars`);
  const nullRes = summarizeToolResult("generate_cover", null);
  check("summarizeToolResult null result → safe placeholder", nullRes.includes("no result"), nullRes);
  const failRes = summarizeToolResult("generate_cover", { ok: false, message: "draft not found", draftId: "zzz" });
  check("summarizeToolResult failure keeps ok=false + message + id", failRes.includes("ok=false") && failRes.includes("draft not found") && failRes.includes("draftId=zzz"), failRes);

  // Gemini agent + vision helpers fail fast + clearly when the key is absent
  // (the only model-touching path that's safe to assert hermetically — it throws
  // before any fetch). This guards the Gemini-only constraint: no key → no call.
  const { callGeminiAgent, callGeminiVision } = await import("../lib/growth/gemini.js");
  const choice = { provider: "gemini" as const, model: "gemini-2.5-flash", usdPer1k: 0.00015 };
  let agentThrew = false;
  try { await callGeminiAgent(choice, "sys", [], [], { temperature: 0.5, maxOutputTokens: 10 }); } catch (e) { agentThrew = (e as Error).message.includes("GEMINI_API_KEY not set"); }
  check("callGeminiAgent throws when GEMINI_API_KEY absent", agentThrew);
  let visionThrew = false;
  try { await callGeminiVision(choice, "describe", "AAAA", "image/png"); } catch (e) { visionThrew = (e as Error).message.includes("GEMINI_API_KEY not set"); }
  check("callGeminiVision throws when GEMINI_API_KEY absent", visionThrew);

  // Auto Mode: no-DB load → DEFAULTS (OFF); runAutoLoop → no-op "disabled".
  const { loadAutoMode, runAutoLoop } = await import("../lib/growth/autoMode.js");
  const mode = await loadAutoMode();
  check("loadAutoMode no-DB → enabled false", mode.enabled === false, JSON.stringify(mode));
  check("loadAutoMode no-DB → autoApprove false (default off)", mode.autoApprove === false, JSON.stringify(mode));
  check("loadAutoMode no-DB → cadence 30 / cap 5 defaults", mode.cadenceMinutes === 30 && mode.maxTasksPerRun === 5, JSON.stringify(mode));
  const run = await runAutoLoop();
  check("runAutoLoop disabled → ran false", run.ran === false && run.reason === "disabled", JSON.stringify(run));
}

// ─── Outcomes (Phase 1) — pure diff math + no-DB graceful no-throw ───
const { diffOutcomes, seedOutcomeOnPublish, measureOutcomes, bustOutcomesCache } = await import("../lib/growth/outcomes.js");
console.log("\nOutcomes (diffOutcomes math + no-DB no-throw):");
{
  const a = (s: string, f: string, m: string) => ({ severity: s, field: f, message: m }) as unknown as import("../lib/growth/types.js").AuditIssue;
  const delta = diffOutcomes(
    { seo: 60, geo: 50, issues: [a("high", "title", "x"), a("low", "desc", "y"), a("high", "h1", "z")] },
    { seo: 72, geo: 50, issues: [a("high", "title", "x")] },
  );
  check("diffOutcomes seoDelta = +12", delta.seoDelta === 12, `got ${delta.seoDelta}`);
  check("diffOutcomes geoDelta = 0", delta.geoDelta === 0, `got ${delta.geoDelta}`);
  check("diffOutcomes issuesResolved = 2", delta.issuesResolved === 2, `got ${delta.issuesResolved}`);
  check("diffOutcomes issuesNew = 0", delta.issuesNew === 0, `got ${delta.issuesNew}`);

  // null side → null deltas, issue counts still computed from present side.
  const nullBase = diffOutcomes({ seo: null, geo: null, issues: null }, { seo: 80, geo: 70, issues: [a("high", "t", "m")] });
  check("diffOutcomes null baseline → seoDelta null", nullBase.seoDelta === null);
  check("diffOutcomes null baseline → issuesNew counts measured side", nullBase.issuesNew === 1, `got ${nullBase.issuesNew}`);

  // No DB (supabaseAdmin null in the test process) → seed + measure never throw.
  let seedThrew = false;
  try {
    await seedOutcomeOnPublish("draft-1", "https://inbharat.ai/learn-ai-with-reeturaj/rag", "linkedin");
  } catch (e) {
    seedThrew = true;
    void e;
  }
  check("seedOutcomeOnPublish no-throw when Supabase unset", seedThrew === false);

  const measured = await measureOutcomes();
  check("measureOutcomes returns {0,0} when Supabase unset", measured.measured === 0 && measured.errors === 0, JSON.stringify(measured));
  bustOutcomesCache();
}

// ─── Learning (Phase 1) — no-DB graceful path ───
// distillLearnings early-returns {proposed:0} when supabaseAdmin is null (before
// any model call), so it is asserted here on the no-DB path. The insert path
// (enabled=false, source='learned', evidence jsonb) is verified by the build +
// local manual run — same framing the monthlyBudgetUsd/logUsage checks above use,
// since supabaseAdmin is a build-time singleton that can't be re-pointed at runtime.
const { distillLearnings } = await import("../lib/growth/learning.js");
console.log("\nLearning (distillLearnings no-DB graceful):");
{
  const r = await distillLearnings();
  check("distillLearnings no-DB → proposed 0", r.proposed === 0, JSON.stringify(r));
  check("distillLearnings no-DB → no error field", r.error === undefined, JSON.stringify(r));
}

// ─── Discovery (Phase 3) — pure diffSitePages on fixtures ───
const { diffSitePages } = await import("../lib/growth/discovery.js");
console.log("\nDiscovery (diffSitePages pure fixtures):");
{
  const A = "https://inbharat.ai/a", B = "https://inbharat.ai/b", C = "https://inbharat.ai/c";
  // new: sitemap [a,b,c] vs known [a] → new [b,c]
  const dNew = diffSitePages([A, B, C], [{ url: A, wordCount: 200, seoScore: 80, title: "A", internalLinks: 2 }]);
  check("discovery new = [b,c]", dNew.new.length === 2 && dNew.new.includes(B) && dNew.new.includes(C), JSON.stringify(dNew.new));
  check("discovery discovered echoes sitemap", dNew.discovered.length === 3);

  // orphaned: known [a,b] not in sitemap [a] → orphaned [{b, "not in sitemap"}]
  const dOrph = diffSitePages([A], [{ url: A, wordCount: 200, seoScore: 80, title: "A", internalLinks: 2 }, { url: B, wordCount: 100, seoScore: 70, title: "B", internalLinks: 1 }]);
  check("discovery orphaned-not-in-sitemap = [{b, 'not in sitemap'}]", dOrph.orphaned.length === 1 && dOrph.orphaned[0].url === B && dOrph.orphaned[0].reason === "not in sitemap", JSON.stringify(dOrph.orphaned));

  // orphaned: known c in sitemap but internalLinks 0 → [{c, "no internal links"}]
  const dOrph2 = diffSitePages([C], [{ url: C, wordCount: 300, seoScore: 90, title: "C", internalLinks: 0 }]);
  check("discovery orphaned-no-internal-links = [{c, 'no internal links'}]", dOrph2.orphaned.length === 1 && dOrph2.orphaned[0].url === C && dOrph2.orphaned[0].reason === "no internal links", JSON.stringify(dOrph2.orphaned));

  // changed: known word_count 200 vs fresh 400 (delta 200 > 50) → changed [{field:'word_count',before:200,after:400}]
  const dChg = diffSitePages(
    [A],
    [{ url: A, wordCount: 200, seoScore: 80, title: "A", internalLinks: 2 }],
    [{ url: A, wordCount: 400, seoScore: null, title: "A" }],
  );
  check("discovery changed word_count = [{field,before:200,after:400}]", dChg.changed.length === 1 && dChg.changed[0].field === "word_count" && dChg.changed[0].before === 200 && dChg.changed[0].after === 400, JSON.stringify(dChg.changed));

  // small word_count delta (10) + same score/title → NOT changed
  const dNoChg = diffSitePages(
    [A],
    [{ url: A, wordCount: 200, seoScore: 80, title: "A", internalLinks: 2 }],
    [{ url: A, wordCount: 210, seoScore: 80, title: "A" }],
  );
  check("discovery small word_count delta → not changed", dNoChg.changed.length === 0, JSON.stringify(dNoChg.changed));
}

// ─── Phase E: article writer + publish helpers (pure, no DB/network) ───
const { slugifyTitle, estimateReadMinutes } = await import("../lib/growth/articleWriter.js");
const { formatArticleEntry, insertArticleMeta } = await import("../api/growth/publish.js");
console.log("\nPhase E (article writer + publish helpers, pure):");
{
  // slugifyTitle: lowercase, kebab, strip apostrophes, trim, fallback.
  check("slugifyTitle kebab-cases", slugifyTitle("Build AI With Reeturaj") === "build-ai-with-reeturaj");
  check("slugifyTitle strips apostrophes", slugifyTitle("Founder's Guide to RAG") === "founders-guide-to-rag");
  check("slugifyTitle collapses non-alnum", slugifyTitle("AI / ML: the 2026 guide!") === "ai-ml-the-2026-guide");
  check("slugifyTitle caps at 60 chars", slugifyTitle("a".repeat(80)).length === 60);
  check("slugifyTitle empty → fallback 'article'", slugifyTitle("!!!///***") === "article");

  // estimateReadMinutes: ~200 wpm, min 3.
  check("estimateReadMinutes min 3 for short text", estimateReadMinutes("one two three") === 3);
  const long = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
  check("estimateReadMinutes ~200wpm (600 words → 3)", estimateReadMinutes(long) === 3, `got ${estimateReadMinutes(long)}`);
  const veryLong = Array.from({ length: 1200 }, (_, i) => `word${i}`).join(" ");
  check("estimateReadMinutes 1200 words → 6", estimateReadMinutes(veryLong) === 6, `got ${estimateReadMinutes(veryLong)}`);

  // formatArticleEntry: shape + escaping + numeric field unquoted.
  const entry = formatArticleEntry({
    slug: "rag-guide", title: "What's RAG?", description: "A guide", category: "AI Foundations",
    datePublished: "2026-06-27", readMinutes: 7, abstract: "Short answer.",
    faq: [{ q: "What is RAG?", a: "Retrieval-augmented generation." }], hashtags: ["rag", "ai"],
  });
  check("formatArticleEntry opens with 2-space brace", entry.startsWith("  {") && entry.endsWith("  },"));
  check("formatArticleEntry quotes slug+title", entry.includes("slug: 'rag-guide',") && entry.includes("title: 'What\\'s RAG?',"));
  check("formatArticleEntry leaves readMinutes numeric (unquoted)", /readMinutes: 7,/.test(entry));
  check("formatArticleEntry escapes the apostrophe in title", entry.includes("\\'"));
  check("formatArticleEntry renders faq array entries", entry.includes("q: 'What is RAG?'") && entry.includes("a: 'Retrieval-augmented generation.'"));
  check("formatArticleEntry renders hashtags inline", /hashtags: \['rag', 'ai'\],/.test(entry));

  // formatArticleEntry: empty faq + hashtags → [].
  const emptyEntry = formatArticleEntry({
    slug: "s", title: "T", description: "D", category: "InBharat", datePublished: "2026-01-01",
    readMinutes: 3, abstract: "A", faq: [], hashtags: [],
  });
  check("formatArticleEntry empty faq → []", /faq: \[\],/.test(emptyEntry));
  check("formatArticleEntry empty hashtags → []", /hashtags: \[\],/.test(emptyEntry));

  // insertArticleMeta: inserts before the marker, idempotent on duplicate slug, null on missing marker.
  const SRC = `export const ARTICLES: ArticleMeta[] = [
  { slug: 'old', title: 'Old' },
];

export function getArticleBySlug(slug: string) { return ARTICLES.find((a) => a.slug === slug); }
`;
  const inserted = insertArticleMeta(SRC, "new-article", "  { slug: 'new-article', title: 'New' },");
  check("insertArticleMeta inserts before ]; marker", inserted !== null && inserted.includes("  { slug: 'new-article', title: 'New' },\n];"));
  check("insertArticleMeta preserves old entries", inserted !== null && inserted.includes("slug: 'old'"));

  // Idempotent: re-inserting an existing slug → null (no duplicate).
  const dup = insertArticleMeta(inserted ?? SRC, "new-article", "  { slug: 'new-article', title: 'Dup' },");
  check("insertArticleMeta idempotent on existing slug → null", dup === null);
  const existingSlug = insertArticleMeta(SRC, "old", "  { slug: 'old', title: 'Dup' },");
  check("insertArticleMeta no-op when slug already present", existingSlug === null);

  // Missing marker → null (can't safely locate close).
  const noMarker = insertArticleMeta("no marker here", "x", "  { slug: 'x' },");
  check("insertArticleMeta null when marker absent", noMarker === null);

  // Round-trip: formatArticleEntry output feeds insertArticleMeta cleanly.
  const rt = insertArticleMeta(SRC, "rag-guide", entry);
  check("insertArticleMeta accepts formatArticleEntry output", rt !== null && rt.includes("slug: 'rag-guide'"), rt ?? "");
}

// ─── Agent↔Issues alignment: pipeline assembly + draft→thread reverse-lookup ──
console.log("\nPipeline assembly (assemblePipeline):");
const A_ID = "11111111-1111-1111-1111-111111111111";
const LI_ID = "22222222-2222-2222-2222-222222222222";
const CO_ID = "33333333-3333-3333-3333-333333333333";
const ARTICLE_URL = "https://inbharat.ai/learn-ai-with-reeturaj/s";
const THREAD = { id: "t-1", title: "Build with Reeturaj — Daily Plan", updatedAt: "2026-06-28T02:30:00.000Z" };

function draft(id: string, kind: string, opts: { url?: string | null; title?: string | null; slug?: string | null; filename?: string | null; status?: string; created_at?: string } = {}): {
  id: string; kind: string; url: string | null; title: string | null; schema_json: { slug?: string; filename?: string } | null; status: string; created_at: string;
} {
  const schema_json: { slug?: string; filename?: string } = {};
  if (opts.slug !== undefined && opts.slug !== null) schema_json.slug = opts.slug;
  if (opts.filename !== undefined && opts.filename !== null) schema_json.filename = opts.filename;
  return {
    id,
    kind,
    url: opts.url === undefined ? null : opts.url,
    title: opts.title === undefined ? null : opts.title,
    schema_json: Object.keys(schema_json).length ? schema_json : null,
    status: opts.status ?? "pending",
    created_at: opts.created_at ?? "2026-06-28T03:00:00.000Z",
  };
}

{
  const drafts = [
    draft(A_ID, "article", { slug: "s", title: "RAG for Indian startups", url: ARTICLE_URL, status: "pending" }),
    draft(LI_ID, "linkedin", { url: ARTICLE_URL, status: "approved" }),
    draft(CO_ID, "cover", { filename: "s.png", status: "pending" }),
  ];
  const b = assemblePipeline(drafts, THREAD);
  check("article picked from kind=article", b.article?.draftId === A_ID, `got ${b.article?.draftId}`);
  check("article slug surfaced", b.article?.slug === "s");
  check("topic = article title", b.topic === "RAG for Indian startups");
  check("linkedin matched by url to article", b.linkedin?.draftId === LI_ID, `got ${b.linkedin?.draftId}`);
  check("cover matched by <slug>.png filename", b.cover?.draftId === CO_ID, `got ${b.cover?.draftId}`);
  check("cover filename surfaced", b.cover?.filename === "s.png");
  check("thread carried through", b.thread?.id === "t-1");
}

{
  // LinkedIn with NO matching url → falls back to most-recent linkedin.
  const drafts = [
    draft(A_ID, "article", { slug: "s", title: "T", url: ARTICLE_URL }),
    draft(LI_ID, "linkedin", { url: "https://inbharat.ai/other", created_at: "2026-06-28T03:00:00.000Z" }),
  ];
  const b = assemblePipeline(drafts, THREAD);
  check("linkedin fallback to most-recent when url mismatch", b.linkedin?.draftId === LI_ID, `got ${b.linkedin?.draftId}`);
}

{
  // Cover with wrong filename → falls back to most-recent cover.
  const drafts = [
    draft(A_ID, "article", { slug: "s", title: "T", url: ARTICLE_URL }),
    draft(CO_ID, "cover", { filename: "other.png" }),
  ];
  const b = assemblePipeline(drafts, THREAD);
  check("cover fallback to most-recent when filename mismatch", b.cover?.draftId === CO_ID, `got ${b.cover?.draftId}`);
}

{
  // Empty drafts today → all null, topic null.
  const b = assemblePipeline([], null);
  check("empty drafts → no article", b.article === null);
  check("empty drafts → no linkedin", b.linkedin === null);
  check("empty drafts → no cover", b.cover === null);
  check("empty drafts → topic null", b.topic === null);
  check("empty drafts → thread null", b.thread === null);
}

console.log("\nDraft→thread reverse-lookup (buildDraftThreadMap):");
{
  const rows = [
    { thread_id: "t-2", tool_result: { draftId: "d-1" } },
    { thread_id: "t-3", tool_result: { draftId: "d-2" } },
    { thread_id: "t-4", tool_result: { draftId: null } },          // no draftId → ignored
    { thread_id: "t-5", tool_result: null },                        // null tool_result → ignored
    { thread_id: "t-6", tool_result: { draftId: "d-3" } },          // not wanted → skipped
  ];
  const wanted = new Set(["d-1", "d-2"]);
  const map = buildDraftThreadMap(rows as never, wanted);
  check("maps draftId → thread_id", map["d-1"] === "t-2" && map["d-2"] === "t-3", JSON.stringify(map));
  check("ignores rows without string draftId", !("d-4" in map) && Object.keys(map).length === 2);
  check("omits non-wanted draftId", !("d-3" in map));
}
{
  // First-wins: newest row (first in desc order) takes precedence.
  const rows = [
    { thread_id: "newer", tool_result: { draftId: "d-1" } },
    { thread_id: "older", tool_result: { draftId: "d-1" } },
  ];
  const map = buildDraftThreadMap(rows as never, new Set(["d-1"]));
  check("first (newest) wins on duplicate draftId", map["d-1"] === "newer", JSON.stringify(map));
}
{
  const map = buildDraftThreadMap([], new Set(["d-1"]));
  check("empty rows → empty map", Object.keys(map).length === 0);
}
{
  const UUID = "00000000-0000-1000-8000-000000000000";
  check("bodySchema accepts 200 uuids", (() => { try { bodySchema.parse({ draftIds: Array(200).fill(UUID) }); return true; } catch { return false; } })());
  check("bodySchema rejects 201 uuids (.max(200) cap)", (() => { try { bodySchema.parse({ draftIds: Array(201).fill(UUID) }); return false; } catch { return true; } })());
  check("bodySchema accepts missing draftIds (default [])", (() => { try { const p = bodySchema.parse({}); return Array.isArray(p.draftIds) && p.draftIds.length === 0; } catch { return false; } })());
}

console.log("\nPipelineStrip status→chip (statusChip):");
check("pending → amber", statusChip("pending").cls.includes("amber"));
check("approved → emerald", statusChip("approved").cls.includes("emerald"));
check("rejected → rose", statusChip("rejected").cls.includes("rose"));
check("published → sky", statusChip("published").cls.includes("sky"));
check("missing → muted default", statusChip(undefined).cls.includes("text-[#7a9ab8]"));
check("missing label is dash", statusChip(null).label === "—");

console.log("\nIST start-of-day (istStartOfDayIso):");
{
  const iso = istStartOfDayIso();
  const d = new Date(iso).getTime();
  const now = Date.now();
  check("istStartOfDayIso is valid ISO", /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(iso), iso);
  check("istStartOfDayIso is at-or-before now", d <= now, `${iso} > now`);
  // IST is UTC+5:30, so an IST-calendar midnight maps to 18:30 UTC the previous
  // day (minutes = 30, the half-hour offset). So the boundary lands on seconds=0
  // and minutes ∈ {0, 30} — never mid-minute.
  check("istStartOfDayIso lands on a midnight boundary (sec=0, min∈{0,30})", new Date(iso).getUTCSeconds() === 0 && (new Date(iso).getUTCMinutes() === 0 || new Date(iso).getUTCMinutes() === 30), iso);
}

console.log("\nArticle slug extraction (slugFromArticleUrl):");
{
  const FULL = "https://inbharat.ai" + ARTICLE_PATH_PREFIX + "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ";
  check("extracts slug from absolute article URL", slugFromArticleUrl(FULL) === "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ", FULL);
  check("extracts slug from www + trailing slash", slugFromArticleUrl("https://www.inbharat.ai" + ARTICLE_PATH_PREFIX + "rag/") === "rag");
  check("extracts slug from root-relative URL", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "cicd") === "cicd");
  check("strips query string + fragment", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "rag?utm_source=li#x") === "rag");
  check("takes only the first path segment", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "rag/extra/seg") === "rag");
  check("null when prefix absent (non-article URL)", slugFromArticleUrl("https://inbharat.ai/about") === null);
  check("null on empty / undefined", slugFromArticleUrl("") === null && slugFromArticleUrl(undefined) === null && slugFromArticleUrl(null) === null);
  check("null on prefix-only URL (no slug)", slugFromArticleUrl(ARTICLE_PATH_PREFIX) === null);
  check("null on trailing-slash-only after prefix", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "/") === null);
  // A slug with uppercase or dots is not a valid registry slug → null (defensive:
  // a malformed URL must NOT yield a garbage slug that would miss the registry
  // and render a bare, context-less card).
  check("null on uppercase slug (invalid)", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "Rag") === null);
  check("null on dotted slug (invalid)", slugFromArticleUrl(ARTICLE_PATH_PREFIX + "rag.pdf") === null);
}

console.log("\nGrounding retrieval (mapResults + formatGroundingBlock):");
{
  const snips = mapResults([
    { title: "Gemini 2.5 Flash release", url: "https://blog.google/x", snippet: "Released 2025." },
    { title: "Other", url: "https://other.example", snippet: "noise" },
  ]);
  check("mapResults returns up to 4 with truncated fields", snips.length === 2 && snips[0].title === "Gemini 2.5 Flash release" && snips[0].url === "https://blog.google/x");
  check("mapResults handles empty array", mapResults([]).length === 0);
  check("mapResults drops rows with no title+snippet", mapResults([{ url: "https://x" }, { title: "ok", snippet: "s" }]).length === 1);
  // Truncation: a 500-char title/snippet is capped at 200/300.
  const long = mapResults([{ title: "T".repeat(500), snippet: "S".repeat(500), url: "u" }])[0];
  check("mapResults truncates title to 200", long.title.length === 200);
  check("mapResults truncates snippet to 300", long.snippet.length === 300);
  const block = formatGroundingBlock(snips);
  check("formatGroundingBlock is non-empty with snippets", block.includes("GROUNDING") && block.includes("Gemini 2.5 Flash release"));
  check("formatGroundingBlock empty when no snippets", formatGroundingBlock([]) === "");
  // No model call / no throw on bad input.
  check("formatGroundingBlock ignores empty-string snippet entries gracefully", formatGroundingBlock([{ title: "x", url: "", snippet: "" }]).includes("x"));
}

console.log("\nGemini google_search grounding (extractResults pure logic):");
{
  // No grounding chunks → empty.
  check("extractResults empty when no groundingMetadata", extractResults({}).length === 0);
  check("extractResults empty when no chunks", extractResults({ candidates: [{ groundingMetadata: {} }] }).length === 0);
  // Chunks → rows with title/url; snippet pulled from groundingSupports segment.
  const rows = extractResults({
    candidates: [{
      content: { parts: [{ text: "Gemini 2.5 Flash shipped in 2025." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://blog.google/x", title: "Gemini 2.5 Flash release" } },
          { web: { uri: "https://other.example", title: "Other" } },
        ],
        groundingSupports: [
          { segment: { text: "Gemini 2.5 Flash shipped in 2025." }, groundingChunkIndices: [0] },
        ],
      },
    }],
  });
  check("extractResults maps chunks to rows", rows.length === 2 && rows[0].title === "Gemini 2.5 Flash release" && rows[0].url === "https://blog.google/x", JSON.stringify(rows));
  check("extractResults pulls snippet from support segment", rows[0].snippet === "Gemini 2.5 Flash shipped in 2025.");
  check("extractResults empty snippet when no support maps to chunk", rows[1].snippet === "");
  // Drops chunks with neither uri nor title; caps at 8.
  const mixed = extractResults({
    candidates: [{
      groundingMetadata: {
        groundingChunks: [
          { web: {} },
          { web: { uri: "https://a", title: "A" } },
        ],
      },
    }],
  });
  check("extractResults drops empty chunks", mixed.length === 1 && mixed[0].title === "A");
}

console.log("\nMermaid fence dry-run (extractMermaidFences + validateMermaidFences):");
{
  const good = "Intro\n\n```mermaid\ngraph TD;\n A-->B\n```\n\ntext\n```mermaid\nflowchart LR;\n X-->Y\n```\n";
  const fences = extractMermaidFences(good);
  check("extractMermaidFences finds both closed fences", fences.length === 2 && fences[0].includes("A-->B") && fences[1].includes("X-->Y"));
  check("extractMermaidFences returns [] when no mermaid", extractMermaidFences("just prose\n```js\nx\n```\n").length === 0);
  check("extractMermaidFences ignores non-mermaid code fences", extractMermaidFences("```js\ngraph TD;\n A-->B\n```\n").length === 0);
  const unclosed = "Intro\n```mermaid\ngraph TD;\n A-->B\n";
  check("detectUnclosedFences flags an unclosed mermaid fence", detectUnclosedFences(unclosed).length === 1);
  check("detectUnclosedFences empty when all closed", detectUnclosedFences(good).length === 0);
  const noMermaid = await validateMermaidFences("no diagrams here");
  check("validateMermaidFences ok + fenceCount 0 when no fences", noMermaid.ok === true && noMermaid.fenceCount === 0 && noMermaid.errors.length === 0);
  const goodCheck = await validateMermaidFences(good);
  check("validateMermaidFences ok on two valid fences", goodCheck.ok === true && goodCheck.fenceCount === 2 && goodCheck.errors.length === 0, JSON.stringify(goodCheck.errors));
  const bad = "```mermaid\ngraph TD;\n A->>B (broken\n```\n";
  const badCheck = await validateMermaidFences(bad);
  check("validateMermaidFences fails on a syntax-broken fence", badCheck.ok === false && badCheck.errors.length === 1 && badCheck.errors[0].fenceIndex === 1, JSON.stringify(badCheck.errors));
  const unclosedCheck = await validateMermaidFences(unclosed);
  check("validateMermaidFences fails on an unclosed fence", unclosedCheck.ok === false && unclosedCheck.errors.some((e) => e.message.includes("never closed")));

  // sanitizeMermaidFences — strips unparseable fences, keeps valid ones + all prose.
  const clean = await sanitizeMermaidFences(good);
  check("sanitizeMermaidFences leaves valid fences untouched", clean.cleaned === good && clean.stripped.length === 0 && clean.fenceCount === 2, JSON.stringify(clean));
  // One broken fence between two good ones → only the broken one is removed; the good
  // fences + all prose are kept byte-for-byte.
  const mixed = "Intro\n\n```mermaid\ngraph TD;\n A-->B\n```\n\nmid prose\n\n```mermaid\ngraph TD;\n A->>B (broken\n```\n\nafter\n\n```mermaid\nflowchart LR;\n X-->Y\n```\n\nend\n";
  const mixedSan = await sanitizeMermaidFences(mixed);
  check("sanitizeMermaidFences strips exactly the broken fence (1 of 3)", mixedSan.stripped.length === 1 && mixedSan.fenceCount === 3 && mixedSan.stripped[0].fenceIndex === 2, JSON.stringify(mixedSan.stripped));
  check("sanitizeMermaidFences keeps the two valid fences after stripping", mixedSan.cleaned.includes("A-->B") && mixedSan.cleaned.includes("X-->Y") && !mixedSan.cleaned.includes("A->>B (broken"), JSON.stringify(mixedSan.cleaned));
  check("sanitizeMermaidFences keeps all surrounding prose", mixedSan.cleaned.includes("Intro") && mixedSan.cleaned.includes("mid prose") && mixedSan.cleaned.includes("after") && mixedSan.cleaned.includes("end"), JSON.stringify(mixedSan.cleaned));
  // A single broken fence → stripped, prose kept.
  const oneBad = await sanitizeMermaidFences(bad);
  check("sanitizeMermaidFences strips a lone broken fence + keeps prose", oneBad.stripped.length === 1 && !oneBad.cleaned.includes("A->>B (broken"), JSON.stringify(oneBad));
  // Unclosed opener at EOF (the realistic unclosed case — a truncated fence with no
  // closer) → stripped to EOF, preceding prose kept.
  const unclosedSan = await sanitizeMermaidFences("intro\n```mermaid\ngraph TD;\n A-->B\nlost mid\n");
  check("sanitizeMermaidFences strips a lone unclosed opener + keeps preceding prose", unclosedSan.stripped.length === 1 && unclosedSan.cleaned === "intro\n" && !unclosedSan.cleaned.includes("A-->B"), JSON.stringify(unclosedSan.cleaned));
  // No mermaid at all → unchanged.
  const none = await sanitizeMermaidFences("just prose, no diagrams");
  check("sanitizeMermaidFences no-op on prose with no fences", none.cleaned === "just prose, no diagrams" && none.stripped.length === 0 && none.fenceCount === 0);
}

console.log("\nCitation-marker strip (stripCitationMarkers):");
{
  // The exact defect from the evals article: bare [N] mid-sentence renders as
  // literal junk under remark-gfm (no footnote plugin). Strip + collapse the
  // surrounding spaces to one so "release. [2] This" → "release. This".
  check(
    "strips a mid-sentence [N] and collapses spaces",
    stripCitationMarkers("iterate, release. [2] This approach falls apart.") === "iterate, release. This approach falls apart.",
  );
  check(
    "strips [N] at end of sentence before a newline (keeps paragraph break)",
    stripCitationMarkers("or 'evals', come in. [1]\n\n## Next") === "or 'evals', come in. \n\n## Next",
  );
  check(
    "strips multiple markers in one pass",
    stripCitationMarkers("a. [1] b [2] c [4] d") === "a. b c d",
  );
  // Real markdown links must survive — `[text](url)` and the numeric `[1](url)`.
  check(
    "preserves named markdown links",
    stripCitationMarkers("see [Desh Ka AI](https://www.inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai) for more") === "see [Desh Ka AI](https://www.inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai) for more",
  );
  check(
    "preserves numeric markdown links [1](url)",
    stripCitationMarkers("as in [1](https://example.com) cited") === "as in [1](https://example.com) cited",
  );
  // A reference-definition line `[1]: url` is a real markdown construct → keep it
  // (only the bare inline [1] in the next paragraph is stripped + collapsed).
  check(
    "preserves reference-definition [1]: url",
    stripCitationMarkers("[1]: https://example.com\n\ntext [1] here") === "[1]: https://example.com\n\ntext here",
  );
  check("no-op on prose with no markers", stripCitationMarkers("plain prose, no citations") === "plain prose, no citations");
  check("no-op on empty", stripCitationMarkers("") === "");
  // Regression: the actual evals opening line must come out clean.
  check(
    "evals opening line cleaned",
    stripCitationMarkers("release. [2] This approach falls apart with AI.") === "release. This approach falls apart with AI.",
  );
  // No bare [N] may remain after stripping on a realistic grounded body.
  const grounded = "claim one. [1] claim two [2] and [3] a third.\n\nNext para [4] ends.";
  const cleaned = stripCitationMarkers(grounded);
  check("no bare [N] remains after strip", /\[(\d+)\](?![(:])/.test(cleaned) === false, cleaned);
}

console.log("\nParaphrase dedupe (isParaphraseOf):");
{
  const existing = ["Keep LinkedIn captions between 60 and 90 words."];
  check("flags a near-duplicate rewording", isParaphraseOf("Keep LinkedIn captions 60-90 words", existing) === true);
  check("does not flag an unrelated rule", isParaphraseOf("Always include a CTA in the article body", existing) === false);
  check("short rule requires near-exact (not just token overlap)", isParaphraseOf("use AI", ["use AI tools"]) === false);
  check("short rule flags exact match", isParaphraseOf("use AI", ["use AI"]) === true);
  check("empty new text never flags", isParaphraseOf("", existing) === false);
  check("ignores empty existing entries", isParaphraseOf("a brand new unique rule", ["", "  "]) === false);
}

console.log("\nArticle slug-collision guard (ensureUniqueArticleSlug):");
{
  // No Supabase in tests → only the in-memory ARTICLES set is consulted.
  const fresh = await ensureUniqueArticleSlug("zzz-never-used-slug-xyz");
  check("unique slug returned as-is", fresh === "zzz-never-used-slug-xyz", fresh);
  const publishedSlug = ARTICLES[0]?.slug ?? "desh-ka-ai";
  const deduped = await ensureUniqueArticleSlug(publishedSlug);
  check("colliding published slug gets a -2 suffix", deduped === `${publishedSlug}-2`, `${publishedSlug} → ${deduped}`);
  const taken2 = await ensureUniqueArticleSlug(publishedSlug);
  // ARTICLES[0].slug-2 should also be free (articles are not numbered that way),
  // so a second call against the same base still resolves to -2 (stateless guard).
  check("dedupe is stable (no DB state in tests) → -2 again", taken2 === `${publishedSlug}-2`, taken2);
  check("empty slug falls back to 'article' base", (await ensureUniqueArticleSlug("")) === "article" || (await ensureUniqueArticleSlug("")).startsWith("article"));
}

console.log("\nArticle slug resolution (resolveArticleSlug):");
{
  const { resolveArticleSlug } = await import("../lib/growth/articleWriter.js");
  // Caller-supplied canonical slug (the morning cron's calendar slug) wins when
  // clean — this is what makes the content calendar advance one topic per day
  // (the draft slug matches slugifyTitle(topic) the picker checks against).
  check("suggested clean slug wins over model slug + title", resolveArticleSlug("evals-for-ai-features-measuring-what-actually-ships", "ai-evals-why-it-looks-fine", "AI Evals: Why It Looks Fine") === "evals-for-ai-features-measuring-what-actually-ships");
  check("suggested slug wins even when model slug differs", resolveArticleSlug("model-routing-and-cost-control", "some-other-slug", "Some Title") === "model-routing-and-cost-control");
  // No suggested slug (interactive dashboard use) → model slug wins when clean.
  check("no suggested slug → model slug used", resolveArticleSlug(undefined, "ai-evals-why-it-looks-fine", "AI Evals") === "ai-evals-why-it-looks-fine");
  // Neither suggested nor clean model slug → slugify the title.
  check("no suggested + dirty model slug → slugifyTitle(title)", resolveArticleSlug(undefined, "AI Evals!!!", "AI Evals: Why It Looks Fine") === "ai-evals-why-it-looks-fine");
  // A dirty/empty suggested slug is ignored (never produces an invalid URL slug).
  check("dirty suggested slug ignored → falls back to model slug", resolveArticleSlug("Bad Slug!", "good-model-slug", "Title") === "good-model-slug");
  check("empty suggested slug ignored → model slug", resolveArticleSlug("", "good-model-slug", "Title") === "good-model-slug");
  check("all empty/dirty → slugifyTitle(title)", resolveArticleSlug("Bad!", "Also Bad!", "Neural Networks For Engineers") === "neural-networks-for-engineers");
}

console.log("\nSyndication (Stage 3 — pure helpers + mocked clients):");
{
  // Canonical URL — always www host + article path.
  check("canonical uses www + article path", canonicalForSlug("what-are-ai-agents") === "https://www.inbharat.ai/learn-ai-with-reeturaj/what-are-ai-agents", canonicalForSlug("what-are-ai-agents"));

  // DEV.to tags: max 4, lowercased, kebab, leading # stripped, 5th+ dropped, >31 truncated.
  check("devto tags caps at 4 + kebab + lowercases", buildDevtoTagsString(["InBharat", "DeshKaAI", "AI For Bharat", "AIAgents", "Automation", "SoftwareDevelopment"]) === "inbharat,deshkaai,ai-for-bharat,aiagents", buildDevtoTagsString(["InBharat", "DeshKaAI", "AI For Bharat", "AIAgents", "Automation", "SoftwareDevelopment"]));
  check("devto tags strips leading #", buildDevtoTagsString(["#InBharat", "#DeshKaAI"]) === "inbharat,deshkaai", buildDevtoTagsString(["#InBharat", "#DeshKaAI"]));
  {
    const longTag = buildDevtoTagsString(["VeryLongTagThatExceedsThirtyOneCharactersLimit"]);
    const tag = longTag; // single hashtag → single tag in the string
    check("devto tags truncates to ≤31 chars", tag.length <= 31 && tag.length > 0, `len=${tag.length} tag=${tag}`);
    check("devto truncation is a prefix of the original", tag === "verylongtagthatexceedsthirtyone", tag);
  }
  check("devto tags empty when no hashtags", buildDevtoTagsString(null) === "");
  check("devto tags dedupes identical normalized slugs", buildDevtoTagsString(["AI_Agents", "ai-agents", "AI Agents"]) === "ai-agents", buildDevtoTagsString(["AI_Agents", "ai-agents", "AI Agents"]));

  // Hashnode tags: {slug,name} objects, max 5, dedup by slug, leading # stripped from name.
  const ht = buildHashnodeTags(["AI Agents", "#InBharat", "InBharat"]);
  check("hashnode tags are objects with slug+name", ht.length === 2 && ht[0].slug === "ai-agents" && ht[0].name === "AI Agents", JSON.stringify(ht));
  check("hashnode tags dedupe by slug (#InBharat == InBharat)", ht[1].slug === "inbharat" && ht[1].name === "InBharat", JSON.stringify(ht));
  check("hashnode tags empty when no hashtags", buildHashnodeTags(undefined).length === 0);

  // DEV.to payload: published=false (draft), canonical set, tags comma string, description omitted when empty.
  const dp = buildDevtoArticlePayload({ title: "T", bodyMarkdown: "# Hi", hashtags: ["InBharat", "AI Agents"], canonicalUrl: "https://www.inbharat.ai/x", description: null, coverImageUrl: null });
  check("devto payload published=false (draft)", dp.article.published === false);
  check("devto payload canonical set", dp.article.canonical_url === "https://www.inbharat.ai/x");
  check("devto payload tags is comma string", dp.article.tags === "inbharat,ai-agents", dp.article.tags);
  check("devto payload omits description when empty", !("description" in dp.article));

  // Hashnode request: query references publishPost, publicationId set, originalArticleURL=canonical, tags present.
  const hr = buildHashnodeRequest({ title: "T", bodyMarkdown: "# Hi", hashtags: ["InBharat"], canonicalUrl: "https://www.inbharat.ai/x", publicationId: "pub123", articleSlug: "my-slug", description: "desc" });
  check("hashnode query references publishPost mutation", hr.query.includes("publishPost(input: $input)"), hr.query);
  check("hashnode input publicationId set", hr.variables.input.publicationId === "pub123");
  check("hashnode input originalArticleURL = canonical", hr.variables.input.originalArticleURL === "https://www.inbharat.ai/x");
  check("hashnode input tags present", Array.isArray(hr.variables.input.tags) && hr.variables.input.tags.length === 1);
  check("hashnode reuses article slug", hr.variables.input.slug === "my-slug");
  // A non-lowercase-hyphen slug is rejected (not passed to Hashnode).
  const hrBad = buildHashnodeRequest({ title: "T", bodyMarkdown: "# Hi", hashtags: [], canonicalUrl: "https://www.inbharat.ai/x", publicationId: "p", articleSlug: "Bad Slug!" });
  check("hashnode rejects non-slug slug (no slug field)", !("slug" in hrBad.variables.input) || hrBad.variables.input.slug === undefined);

  // Medium manual helper: ok + manual + no url + canonical passthrough.
  const mr = buildMediumImportHelper("https://www.inbharat.ai/x");
  check("medium helper ok=true manual status", mr.ok === true && mr.status === "manual");
  check("medium helper no platform url", mr.url === null);
  check("medium helper canonical passthrough", mr.canonicalUrl === "https://www.inbharat.ai/x");
  check("medium import URL is the real /p/import page", MEDIUM_IMPORT_URL === "https://medium.com/p/import");
  check("medium instructions name the importer + canonical", mediumInstructions("https://www.inbharat.ai/x").includes(MEDIUM_IMPORT_URL) && mediumInstructions("https://www.inbharat.ai/x").includes("https://www.inbharat.ai/x"));

  // Credential env mapping.
  check("devto credential env", platformCredentialEnv("devto") === "DEVTO_API_KEY");
  check("hashnode credential env", platformCredentialEnv("hashnode") === "HASHNODE_TOKEN");
  check("medium credential env null (no API)", platformCredentialEnv("medium") === null);
  check("platform labels human-readable", platformLabel("devto") === "DEV.to" && platformLabel("hashnode") === "Hashnode" && platformLabel("medium") === "Medium");

  // publishToDevto: not_configured without a key (no fetch attempted).
  const devtoNoKey = await publishToDevto({ apiKey: undefined, title: "T", bodyMarkdown: "# Hi", hashtags: null, canonicalUrl: "https://www.inbharat.ai/x" });
  check("devto not_configured without API key", devtoNoKey.ok === false && devtoNoKey.status === "not_configured", devtoNoKey.error ?? "");

  // publishToHashnode: not_configured without token OR publicationId.
  const hnNoToken = await publishToHashnode({ token: undefined, publicationId: "pub", title: "T", bodyMarkdown: "# Hi", hashtags: null, canonicalUrl: "https://www.inbharat.ai/x" });
  check("hashnode not_configured without token", hnNoToken.ok === false && hnNoToken.status === "not_configured", hnNoToken.error ?? "");
  const hnNoPub = await publishToHashnode({ token: "tok", publicationId: undefined, title: "T", bodyMarkdown: "# Hi", hashtags: null, canonicalUrl: "https://www.inbharat.ai/x" });
  check("hashnode not_configured without publicationId", hnNoPub.ok === false && hnNoPub.status === "not_configured", hnNoPub.error ?? "");

  // publishToDevto happy path via mocked fetch.
  const origFetchSyn = globalThis.fetch;
  let devtoCalled: boolean = false;
  let devtoHeaders: Record<string, string> | null = null;
  let devtoBody: { article?: { published?: unknown; tags?: unknown; canonical_url?: unknown } } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    devtoCalled = true;
    devtoHeaders = init?.headers as Record<string, string>;
    devtoBody = JSON.parse(String(init?.body)) as typeof devtoBody;
    void input;
    return { ok: true, status: 201, json: async () => ({ id: 42, url: "https://dev.to/inbharat/my-slug", slug: "my-slug" }) } as Response;
  }) as typeof globalThis.fetch;
  const devtoOk = await publishToDevto({ apiKey: "k", title: "T", bodyMarkdown: "# Hi", hashtags: ["InBharat"], canonicalUrl: "https://www.inbharat.ai/x", description: "d" });
  check("devto happy path ok", devtoOk.ok === true && devtoOk.status === "draft", devtoOk.error ?? "");
  check("devto happy path returns url + id", devtoOk.url === "https://dev.to/inbharat/my-slug" && devtoOk.postId === "42");
  check("devto sends api-key header", devtoHeaders?.["api-key"] === "k");
  check("devto sends published=false draft", devtoBody?.article?.published === false);
  check("devto sends canonical_url", devtoBody?.article?.canonical_url === "https://www.inbharat.ai/x");
  check("devto sends comma tags string", devtoBody?.article?.tags === "inbharat", String(devtoBody?.article?.tags));

  // publishToHashnode happy path via mocked fetch.
  let hnBody: { query?: string; variables?: { input?: { originalArticleURL?: unknown; publicationId?: unknown; tags?: unknown } } } | null = null;
  let hnHeaders: Record<string, string> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    hnBody = JSON.parse(String(init?.body)) as typeof hnBody;
    hnHeaders = init?.headers as Record<string, string>;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { publishPost: { post: { id: "p1", url: "https://hashnode.com/inbharat/my-slug", slug: "my-slug" } } } }),
    } as Response;
  }) as typeof globalThis.fetch;
  const hnOk = await publishToHashnode({ token: "tok", publicationId: "pub", title: "T", bodyMarkdown: "# Hi", hashtags: ["InBharat"], canonicalUrl: "https://www.inbharat.ai/x", articleSlug: "my-slug" });
  check("hashnode happy path ok published", hnOk.ok === true && hnOk.status === "published", hnOk.error ?? "");
  check("hashnode returns url + id", hnOk.url === "https://hashnode.com/inbharat/my-slug" && hnOk.postId === "p1");
  check("hashnode sends bare Authorization (no Bearer)", hnHeaders?.["Authorization"] === "tok", hnHeaders?.["Authorization"] ?? "");
  check("hashnode sends originalArticleURL canonical", hnBody?.variables?.input?.originalArticleURL === "https://www.inbharat.ai/x");
  check("hashnode sends publicationId", hnBody?.variables?.input?.publicationId === "pub");
  check("hashnode sends tags objects", Array.isArray(hnBody?.variables?.input?.tags) && hnBody?.variables?.input?.tags?.length === 1);

  // Hashnode GraphQL error response → failed with the message.
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: "publication not found" }] }) }) as Response) as typeof globalThis.fetch;
  const hnErr = await publishToHashnode({ token: "tok", publicationId: "pub", title: "T", bodyMarkdown: "# Hi", hashtags: null, canonicalUrl: "https://www.inbharat.ai/x" });
  check("hashnode graphql error → failed", hnErr.ok === false && hnErr.status === "failed" && (hnErr.error ?? "").includes("publication not found"), hnErr.error ?? "");
  check("devto was actually called over the network (mock sanity)", Boolean(devtoCalled));

  // Secret-scan abort: a body containing a leaked openai-style key aborts every
  // platform WITHOUT calling fetch (the secret must never reach a 3rd party).
  let secretFetchCalled = false;
  globalThis.fetch = (async () => { secretFetchCalled = true; return { ok: true, status: 201, json: async () => ({}) } as Response; }) as typeof globalThis.fetch;
  const secretBody = `My key is sk-${"a".repeat(30)} and it should not be cross-posted.`;
  const secretResults = await syndicateArticle(["devto", "hashnode", "medium"], { draftId: "d1", slug: "s", title: "T", bodyMarkdown: secretBody, hashtags: null });
  check("secret in body aborts devto", secretResults.find((r) => r.platform === "devto")?.ok === false);
  check("secret in body aborts hashnode", secretResults.find((r) => r.platform === "hashnode")?.ok === false);
  check("secret abort error names the scan", (secretResults[0]?.error ?? "").includes("secret"));
  check("secret abort did NOT call fetch", secretFetchCalled === false);

  // Medium manual helper via orchestrator (no fetch) — always ok:manual.
  globalThis.fetch = (async () => { return { ok: true, status: 200, json: async () => ({}) } as Response; }) as typeof globalThis.fetch;
  const medOnly = await syndicateArticle(["medium"], { draftId: "d1", slug: "what-are-ai-agents", title: "T", bodyMarkdown: "clean body", hashtags: ["InBharat"] });
  check("orchestrator medium is manual ok", medOnly.length === 1 && medOnly[0].ok === true && medOnly[0].status === "manual");
  check("orchestrator medium canonical from slug", medOnly[0].canonicalUrl === "https://www.inbharat.ai/learn-ai-with-reeturaj/what-are-ai-agents");

  globalThis.fetch = origFetchSyn;
}

console.log("\nSyndication local Playwright mode (status union + mode arg):");
{
  // Compile-time: playwright_draft is a valid SyndicationStatus (this line fails
  // to typecheck if the union member is missing). Runtime: the union is closed.
  const s: SyndicationStatus = "playwright_draft";
  const known: SyndicationStatus[] = ["published", "draft", "manual", "playwright_draft", "failed", "not_configured"];
  check("playwright_draft is in the status union", known.includes("playwright_draft"));
  check("status union has 6 members (added playwright_draft)", known.length === 6);
  // The local Playwright path records playwright_draft (not published/draft) so
  // the ledger honestly reflects "founder ran the script + clicked Publish" vs
  // "an API actually published". A real platform publish is the only "published".
  check("playwright_draft !== published (honest intermediate state)", s !== "published");
}

console.log("\nSyndication body source (published .md via GitHub API, mocked fetch):");
{
  const { fetchPublishedArticleBody } = await import("../lib/growth/syndication/articleBody.js");
  const origFetchBody = globalThis.fetch;
  const origToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token"; // gate passes so the mocked fetch is reached
  const SLUG = "streaming-llm-responses-ux-and-cost-trade-offs";
  // A raw published body as it sits in the repo — NOTE: still has a stray [N]
  // citation marker and a broken mermaid fence. (publish.ts cleans before commit,
  // but a founder may have edited, or an older draft pre-dated the strip. The
  // syndicate route re-cleans defense-in-depth, so we assert that here.)
  const RAW = "## Streaming LLM Responses\n\nSome prose [1] with a marker.\n\n```mermaid\nflowchart Broken\n  A -->\n```\n\nFinal line.";

  try {
    // Happy path: GitHub contents API (raw accept) returns the .md verbatim.
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : (input as Request).url;
      if (u.includes(`/contents/`) && u.includes(`${encodeURIComponent(`content/articles/${SLUG}.md`)}?ref=main`)) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(RAW) } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") } as unknown as Response);
    }) as typeof globalThis.fetch;
    const okRes = await fetchPublishedArticleBody(SLUG);
    check("fetchPublishedArticleBody ok → returns body", okRes.ok === true && okRes.body === RAW, JSON.stringify(okRes).slice(0, 160));

    // The route cleans the published body the same way publish.ts cleans a commit:
    // strip [N] citation markers + strip unparseable mermaid fences.
    const cleaned = stripCitationMarkers((await sanitizeMermaidFences(RAW)).cleaned);
    check("published body clean → no [N] markers remain", !/\[\d+\]/.test(cleaned), cleaned);
    check("published body clean → broken mermaid fence stripped", !/```mermaid/.test(cleaned), cleaned);
    check("published body clean → keeps the real prose", cleaned.includes("Final line."), cleaned);

    // 404 → not ok (article .md not in repo yet, e.g. approved-not-published).
    globalThis.fetch = ((_i: RequestInfo | URL) => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") } as unknown as Response)) as typeof globalThis.fetch;
    const notFound = await fetchPublishedArticleBody(SLUG);
    check("fetchPublishedArticleBody 404 → not ok", notFound.ok === false);

    // Invalid slug → not ok (never hits network).
    let netCalled = false;
    globalThis.fetch = (() => { netCalled = true; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("x") } as unknown as Response); }) as typeof globalThis.fetch;
    const badSlug = await fetchPublishedArticleBody("Not-A-Valid-Slug");
    check("fetchPublishedArticleBody invalid slug → not ok", badSlug.ok === false);
    check("fetchPublishedArticleBody invalid slug → no network call", netCalled === false);
  } finally {
    globalThis.fetch = origFetchBody;
    if (origToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = origToken;
  }
}

console.log("\nSitemap hygiene (canonical www only — no query/lang/search/redirect URLs):");
{
  // Derive the sitemap <loc> list from the real ROUTES + SITE (the same path
  // build-seo.ts takes: site.url + path, excluding noIndex + excludeFromSitemap).
  // We do NOT import build-seo.ts here because it calls main() at module load
  // (writes dist files + builds images). This is the regression guard for the
  // GSC cleanup: a future edit that flips multilingual=true on a route, or adds
  // a query-param/lang/search URL to ROUTES, trips this test before it ships.
  const { ROUTES, SITE } = await import("../seo.config.ts");
  const locs = (ROUTES as Array<{ path: string; noIndex?: boolean; excludeFromSitemap?: boolean }>)
    .filter((r) => !r.noIndex && !r.excludeFromSitemap)
    .map((r) => SITE.url + (r.path === "/" ? "/" : r.path));
  check("sitemap has > 0 urls", locs.length > 0, `got ${locs.length}`);
  check("every loc is the www canonical host", locs.every((u) => u.startsWith("https://www.inbharat.ai/")), locs.filter((u) => !u.startsWith("https://www.inbharat.ai/")).join(","));
  check("sitemap has NO query-param URLs (?lang=, ?q=, etc.)", locs.every((u) => !u.includes("?")), locs.filter((u) => u.includes("?")).join(","));
  check("sitemap has NO http / non-www variants", locs.every((u) => !u.startsWith("http://") && !u.startsWith("https://inbharat.ai/")), locs.filter((u) => u.startsWith("http://") || u.startsWith("https://inbharat.ai/")).join(","));
  check("sitemap has NO search-template URL (/app?q={search_term_string})", locs.every((u) => !u.includes("search_term_string")), locs.filter((u) => u.includes("search_term_string")).join(","));
  check("admin routes excluded from sitemap", locs.every((u) => !u.includes("/admin/")), locs.filter((u) => u.includes("/admin/")).join(","));
  const articleLocs = locs.filter((u) => u.includes("/learn-ai-with-reeturaj/"));
  check("sitemap includes article canonical URLs", articleLocs.length > 0, `got ${articleLocs.length}`);
}

console.log("\nKnowledge base (FTS + token-match, cross-source dedupe):");
{
  // 1) formatKnowledgeBlock — empty input → "" (prompt unchanged when KB empty).
  check("formatKnowledgeBlock([]) === '' (prompt unchanged when empty)", formatKnowledgeBlock([]) === "");

  // 2) formatKnowledgeBlock — non-empty → labeled block with title + source.
  const items: KnowledgeItem[] = [
    {
      id: "k1", type: "source", title: "Agentic AI survey 2026", summary: "Multi-agent orchestration trends",
      body: null, sourceUrl: "https://example.com/survey", sourceType: "web", relatedProduct: "JAK Shield",
      topicCluster: "agentic-ai", keywords: ["agentic", "mcp"], intentScore: 78, freshnessScore: 60,
      authorityScore: 55, riskLevel: "low", status: "approved", linkedArticleId: null, linkedPostId: null,
      contentHash: null, useCount: 0, lastUsedAt: null, createdAt: "2026-07-05", updatedAt: "2026-07-05",
    },
  ];
  const block = formatKnowledgeBlock(items);
  check("formatKnowledgeBlock labels the block", block.startsWith("KNOWLEDGE BASE"), block.slice(0, 40));
  check("formatKnowledgeBlock includes the item title", block.includes("Agentic AI survey 2026"));
  check("formatKnowledgeBlock includes the source url", block.includes("https://example.com/survey"));
  check("formatKnowledgeBlock includes the type tag", block.includes("[source/JAK Shield]"));

  // 3) KnowledgeType union — the typed rows the KB stores (compile-time guard).
  const types: KnowledgeType[] = ["source", "topic", "article", "post", "draft", "note", "competitor_gap", "keyword", "performance", "decision"];
  check("KnowledgeType union has 10 members", types.length === 10);
  check("KnowledgeType includes 'competitor_gap' (cross-source dedupe target)", types.includes("competitor_gap"));

  // 4) findDuplicateKnowledge — cross-source dedupe against published ARTICLES
  //    titles (in-memory manifest path, no DB needed). A topic that paraphrases a
  //    published article title must be flagged so the agent pivots / updates.
  const dup = await findDuplicateKnowledge(ARTICLES[0].title);
  check("findDuplicateKnowledge flags a published-article title as duplicate", dup.duplicate === true, JSON.stringify(dup).slice(0, 120));

  // 5) findDuplicateKnowledge — a novel topic (no DB) → not a duplicate.
  const novel = await findDuplicateKnowledge("zzz-novel-untouched-topic-qwx-12345");
  check("findDuplicateKnowledge novel topic → not a duplicate", novel.duplicate === false);
}

console.log("\nTopic discovery (Phase 3 — 12-dim scoring + dedupe + honest intent):");
{
  const { scoreTopic, composeTopic, discoverTopics, SCORE_DIMENSIONS, DISCOVERY_PRODUCTS } = await import("../lib/growth/topicDiscovery.js");

  // 1) SCORE_DIMENSIONS has exactly 12 named dimensions.
  check("SCORE_DIMENSIONS has 12 dimensions", SCORE_DIMENSIONS.length === 12, `got ${SCORE_DIMENSIONS.length}`);
  check("SCORE_DIMENSIONS includes risk_level", SCORE_DIMENSIONS.includes("risk_level" as never));

  // 2) scoreTopic — pure, returns priority 0-100 + all 12 dimension scores.
  const organic = [
    { title: "Best AI agent for Indian startups 2026", link: "https://example.com/a", snippet: "comparison of AI tools for business", date: "2026-06-01" },
    { title: "How to build an agentic AI workflow", link: "https://github.com/foo/agent", snippet: "tutorial: deploy an AI agent for business", date: "2026-05-01" },
    { title: "MCP security guide for agents 2026", link: "https://medium.com/x", snippet: "governance for AI agents", date: "2026-04-01" },
  ];
  const s = scoreTopic("best AI agent for Indian startups", organic, "inbharat");
  check("scoreTopic priority is 0-100", s.priority >= 0 && s.priority <= 100, `got ${s.priority}`);
  check("scoreTopic returns 12 dimension scores", s.scores.length === 12, `got ${s.scores.length}`);
  check("scoreTopic every dimension score 0-100", s.scores.every((x: { score: number }) => x.score >= 0 && x.score <= 100));

  // 3) Risk detection — medical/legal keywords flip risk_level to high/medium.
  const risky = scoreTopic("AI for medical diagnosis and patent filing visa applications", [{ title: "clinical treatment FDA", link: "x", snippet: "legal compliance" }], "sahayaak-seva");
  check("scoreTopic flags regulated topics as high risk", risky.riskLevel === "high", `got ${risky.riskLevel}`);
  const safe = scoreTopic("best AI agent for Indian startups", organic, "inbharat");
  check("scoreTopic non-regulated topic → low risk", safe.riskLevel === "low", `got ${safe.riskLevel}`);

  // 4) composeTopic — honest "estimated intent" label, NOT confirmed volume.
  const t = composeTopic("best AI agent for Indian startups", organic, "inbharat", { duplicate: false });
  check("composeTopic marks intent as estimated (honest)", t.estimatedIntent.includes("estimated intent") && !t.estimatedIntent.includes("confirmed volume"), t.estimatedIntent);
  check("composeTopic duplicate:false → draft_new", t.recommendedAction === "draft_new");
  check("composeTopic cites source links", t.sourceLinks.length > 0 && t.sourceLinks.length <= 5);
  check("composeTopic priority is 0-100", t.priority >= 0 && t.priority <= 100);

  // 5) composeTopic — duplicate of a published item → update_existing / skip.
  const tDup = composeTopic("best AI agent for Indian startups", organic, "inbharat", {
    duplicate: true,
    existing: { id: "k1", type: "topic", title: "best AI agent", summary: null, body: null, sourceUrl: null, sourceType: null, relatedProduct: null, topicCluster: null, keywords: [], intentScore: null, freshnessScore: null, authorityScore: null, riskLevel: "low", status: "published", linkedArticleId: "slug", linkedPostId: null, contentHash: null, useCount: 0, lastUsedAt: null, createdAt: "", updatedAt: "" },
    reason: "matches published",
  });
  check("composeTopic duplicate of published → update_existing", tDup.recommendedAction === "update_existing", tDup.recommendedAction);
  check("composeTopic flags duplicate:true", tDup.duplicate === true);

  // 6) discoverTopics — honest degradation when GEMINI_API_KEY is unset. No key
  //    in the test env → notConfigured:true, zero topics, never throws.
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const r = await discoverTopics("inbharat", 3);
  check("discoverTopics no key → notConfigured:true", r.notConfigured === true, JSON.stringify(r));
  check("discoverTopics no key → 0 discovered", r.discovered === 0);
  check("discoverTopics unknown product → notConfigured + empty", (await discoverTopics("nope" as never, 1)).discovered === 0);
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;

  // 7) DISCOVERY_PRODUCTS lists all 7 InBharat products.
  check("DISCOVERY_PRODUCTS has 7 products", DISCOVERY_PRODUCTS.length === 7, `got ${DISCOVERY_PRODUCTS.length}`);
  check("DISCOVERY_PRODUCTS includes sahayaak-seva + jak-shield", DISCOVERY_PRODUCTS.includes("sahayaak-seva") && DISCOVERY_PRODUCTS.includes("jak-shield"));
}

console.log("\nVoice Command Center (Phase 4 — buildContextBlock pure logic):");
{
  const { buildContextBlock } = await import("../lib/speech.js");
  // Empty context → "" (no noise appended to the message).
  check("buildContextBlock empty → ''", buildContextBlock({ pathname: "/" }) === "");
  // Article page → slug surfaced.
  const ctxArticle = buildContextBlock({ pathname: "/learn-ai-with-reeturaj/rag-fundamentals" });
  check("buildContextBlock article page → slug surfaced", ctxArticle.includes("rag-fundamentals") && ctxArticle.startsWith("Context:"), ctxArticle);
  // Pending drafts count surfaced.
  const ctxDrafts = buildContextBlock({ pathname: "/admin/growth", pendingDraftCount: 3 });
  check("buildContextBlock pending drafts → count surfaced", ctxDrafts.includes("3 pending draft(s)"), ctxDrafts);
  // Last outcome delta surfaced.
  const ctxDelta = buildContextBlock({ pathname: "/", lastOutcomeDelta: 12 });
  check("buildContextBlock outcome delta → surfaced", ctxDelta.includes("SEO delta: 12"), ctxDelta);
  // Active thread title surfaced.
  const ctxThread = buildContextBlock({ pathname: "/", activeThreadTitle: "Daily Plan" });
  check("buildContextBlock active thread → title surfaced", ctxThread.includes("Daily Plan"), ctxThread);
  // Multiple signals compose into one line.
  const ctxMulti = buildContextBlock({ pathname: "/learn-ai-with-reeturaj/x", pendingDraftCount: 2, activeThreadTitle: "T" });
  check("buildContextBlock multi-signal → single 'Context:' line", ctxMulti.startsWith("Context:") && ctxMulti.split("Context:")[1].includes(";"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("GROWTH TESTS FAILED");
  process.exit(1);
}
void approx;

function fakeJson(obj: unknown, ok = true, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok, status, json: () => Promise.resolve(obj) };
}