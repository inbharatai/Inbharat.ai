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

  // prompt is text-free: buildCoverPrompt is not exported, so assert via a
  // second mock that captures the request body text and checks it forbids text.
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
  const empty: Strategy = { positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null };
  check("formatStrategyBlock empty → ''", formatStrategyBlock(empty) === "");
  const s: Strategy = { positioning: "India's AI infra studio.", icp: "Indian SMB engineering teams.", audience: "Hands-on builders.", voice: "Concise, hype-free.", competitiveDiff: null, goals: "Ship 3 reference articles/qtr." };
  const block = formatStrategyBlock(s);
  check("formatStrategyBlock has STRATEGY header", /^STRATEGY/.test(block));
  check("formatStrategyBlock includes positioning", block.includes("POSITIONING:\nIndia's AI infra studio."));
  check("formatStrategyBlock omits empty competitiveDiff", !block.includes("COMPETITIVE DIFFERENCE"));
  check("formatStrategyBlock labels ICP/audience/voice", block.includes("ICP (ideal customer profile)") && block.includes("AUDIENCE") && block.includes("VOICE"));
  check("formatStrategyBlock obeys-on-brand guidance present", /on-brand/i.test(block));
}

// ─── Phase C: conversational agent tools + vision + Auto Mode (no DB / no key) ───
console.log("\nPhase C agent (tools registry, dispatch, vision, auto-mode, no DB/key):");
{
  const { AGENT_TOOLS, dispatchTool } = await import("../lib/growth/agentTools.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  check("agent tools registry has 10 tools", AGENT_TOOLS.length === 10, `got ${names.join(",")}`);
  check("agent tools include the CMO command set",
    ["list_recent_drafts", "redraft_caption", "review_text", "generate_cover", "list_inbox_folder", "analyze_attachment", "write_article", "web_search", "write_video_script", "promote_article"].every((n) => names.includes(n)),
    JSON.stringify(names));
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
  check("content calendar has ≥18 topics", BUILD_WITH_REETURAJ_CALENDAR.length >= 18, `got ${BUILD_WITH_REETURAJ_CALENDAR.length}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("GROWTH TESTS FAILED");
  process.exit(1);
}
void approx;

function fakeJson(obj: unknown, ok = true, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok, status, json: () => Promise.resolve(obj) };
}