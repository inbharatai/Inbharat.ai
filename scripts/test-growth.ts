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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("GROWTH TESTS FAILED");
  process.exit(1);
}
void approx;

function fakeJson(obj: unknown, ok = true, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok, status, json: () => Promise.resolve(obj) };
}