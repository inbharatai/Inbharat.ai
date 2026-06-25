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
import { parsePage, extractInternalLinks } from "../lib/growth/crawler.js";
import { scoreSeo } from "../lib/growth/seo-auditor.js";
import { scoreGeo } from "../lib/growth/geo-auditor.js";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("GROWTH TESTS FAILED");
  process.exit(1);
}
void approx;