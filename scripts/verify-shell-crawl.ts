/**
 * One-off accuracy check: run the inbuilt crawler + SEO/GEO auditors over the
 * BUILT homepage shell (dist/index.html) to confirm the new crawlable body
 * content is picked up correctly. Proves the Growth Agent's crawler/auditor
 * are accurate against the real built output.
 *
 * Run: npx tsx scripts/verify-shell-crawl.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePage } from "../lib/growth/crawler.js";
import { scoreSeo } from "../lib/growth/seo-auditor.js";
import { scoreGeo } from "../lib/growth/geo-auditor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "..", "dist", "index.html"), "utf8");

const meta = parsePage(html, "https://inbharat.ai/");
const seo = scoreSeo(meta);
const geo = scoreGeo(meta);

console.log("=== Built homepage shell — crawler/auditor readout ===");
console.log("title:        ", meta.title);
console.log("h1:           ", meta.h1);
console.log("wordCount:    ", meta.wordCount);
console.log("h2Count:      ", meta.h2Count);
console.log("canonical:    ", meta.canonical);
console.log("schemaTypes:  ", meta.schemaTypes?.join(", "));
console.log("SEO score:    ", seo.score);
console.log("GEO score:    ", geo.score);
console.log("SEO issues:   ", seo.issues.length);
console.log("GEO issues:   ", geo.issues.length);

let failures = 0;
const assert = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

console.log("\n=== Accuracy assertions ===");
assert("H1 present and correct", !!meta.h1 && meta.h1.startsWith("InBharat AI —"));
assert("wordCount > 0 (body content crawlable)", (meta.wordCount ?? 0) > 50);
assert("title present", !!meta.title);
assert("canonical set to https://inbharat.ai/", meta.canonical === "https://inbharat.ai/");
assert("Organization + WebSite schema present", (meta.schemaTypes ?? []).some((t) => t.includes("Organization")) && (meta.schemaTypes ?? []).some((t) => t.includes("WebSite")));
assert("FAQPage schema present", (meta.schemaTypes ?? []).some((t) => t.includes("FAQ")));
assert("ItemList (product suite) schema present", (meta.schemaTypes ?? []).some((t) => t.includes("ItemList")));
assert("SEO score improved over empty-shell baseline (was ~54)", seo.score >= 60);
assert("GEO score improved over empty-shell baseline (was ~52)", geo.score >= 58);
assert("No 'Missing H1' SEO issue", !seo.issues.some((i) => i.field === "h1"));
// "thin content" is the HIGH-severity <300-word flag. A low-severity "light
// content" advisory (300–600 words) is legitimate guidance, not a defect —
// the auditor correctly distinguishes thin vs light vs healthy.
assert("No HIGH-severity 'thin content' issue (<300 words)", !seo.issues.some((i) => i.field === "wordCount" && i.severity === "high"));

// ─── Built article shell (dist/learn-ai-with-reeturaj/rag/index.html) ───
// The build bakes the full rendered article body into the crawlable <section>
// so AI-search crawlers see the complete article (not just an abstract). This
// block confirms that pipeline: H1 + TechArticle + FAQPage schema, ≥600
// crawlable words, correct canonical, no thin-content flag.
const articlePath = resolve(__dirname, "..", "dist", "learn-ai-with-reeturaj", "rag", "index.html");
const articleUrl = "https://inbharat.ai/learn-ai-with-reeturaj/rag";
let articleHtml = "";
try {
  articleHtml = readFileSync(articlePath, "utf8");
} catch {
  console.log(`\n=== Built article shell (rag) — NOT FOUND at ${articlePath} ===`);
  assert("article shell built (dist/learn-ai-with-reeturaj/rag/index.html exists)", false);
  console.log(`\n${failures === 0 ? "ALL ACCURACY CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

const aMeta = parsePage(articleHtml, articleUrl);
const aSeo = scoreSeo(aMeta);
const aGeo = scoreGeo(aMeta);

console.log("\n=== Built article shell (rag) — crawler/auditor readout ===");
console.log("title:        ", aMeta.title);
console.log("h1:           ", aMeta.h1);
console.log("wordCount:    ", aMeta.wordCount);
console.log("h2Count:      ", aMeta.h2Count);
console.log("canonical:    ", aMeta.canonical);
console.log("schemaTypes:  ", aMeta.schemaTypes?.join(", "));
console.log("SEO score:    ", aSeo.score);
console.log("GEO score:    ", aGeo.score);

console.log("\n=== Article-shell assertions ===");
assert("article H1 present (non-empty)", !!aMeta.h1 && aMeta.h1.length > 0);
assert("TechArticle schema present", (aMeta.schemaTypes ?? []).some((t) => t.includes("TechArticle")));
assert("FAQPage schema present", (aMeta.schemaTypes ?? []).some((t) => t.includes("FAQ")));
assert("BreadcrumbList schema present", (aMeta.schemaTypes ?? []).some((t) => t.includes("Breadcrumb")));
assert("article canonical set correctly", aMeta.canonical === articleUrl);
assert("article body baked (wordCount ≥ 600 — full content crawlable)", (aMeta.wordCount ?? 0) >= 600);
assert("article has multiple H2 sections", (aMeta.h2Count ?? 0) >= 3);
assert("article SEO score healthy (≥ 70)", aSeo.score >= 70);
assert("article no HIGH-severity thin-content issue", !aSeo.issues.some((i) => i.field === "wordCount" && i.severity === "high"));

console.log(`\n${failures === 0 ? "ALL ACCURACY CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);