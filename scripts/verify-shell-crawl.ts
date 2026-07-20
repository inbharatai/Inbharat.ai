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

const meta = parsePage(html, "https://www.inbharat.ai/");
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
assert("H1 present and correct", !!meta.h1 && meta.h1 === "Affordable AI tools built for Bharat");
assert("wordCount > 0 (body content crawlable)", (meta.wordCount ?? 0) > 50);
assert("title present", !!meta.title);
assert("canonical set to https://www.inbharat.ai/ (www-canonical)", meta.canonical === "https://www.inbharat.ai/");
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

// ─── Built article shells (dist/learn-ai-with-reeturaj/<slug>/index.html) ───
// The build bakes the full rendered article body into the crawlable <section>
// so AI-search crawlers see the complete article (not just an abstract). This
// block now sweeps EVERY published article (was rag-only) so a regression that
// breaks one article's shell (missing body, wrong canonical, dropped schema)
// is caught before it ships. The rag readout stays as a detailed sample.
import { ARTICLES } from "../content/articles.meta";

let firstArticle = true;
for (const a of ARTICLES) {
  const articleShellPath = resolve(__dirname, "..", "dist", "learn-ai-with-reeturaj", a.slug, "index.html");
  const articleUrl = `https://www.inbharat.ai/learn-ai-with-reeturaj/${a.slug}`;
  let articleHtml = "";
  try {
    articleHtml = readFileSync(articleShellPath, "utf8");
  } catch {
    assert(`article shell built (${a.slug})`, false);
    continue;
  }
  const aMeta = parsePage(articleHtml, articleUrl);
  const aSeo = scoreSeo(aMeta);
  assert(`[${a.slug}] H1 present (non-empty)`, !!aMeta.h1 && aMeta.h1.length > 0);
  assert(`[${a.slug}] exactly one H1`, (aMeta.h1Count ?? 0) === 1, `got ${aMeta.h1Count}`);
  assert(`[${a.slug}] canonical = ${articleUrl}`, aMeta.canonical === articleUrl, `got ${aMeta.canonical}`);
  assert(`[${a.slug}] exactly one canonical`, (aMeta.canonicalCount ?? 0) === 1, `got ${aMeta.canonicalCount}`);
  assert(`[${a.slug}] TechArticle schema present`, (aMeta.schemaTypes ?? []).some((t) => t.includes("TechArticle")));
  assert(`[${a.slug}] BreadcrumbList schema present`, (aMeta.schemaTypes ?? []).some((t) => t.includes("Breadcrumb")));
  assert(`[${a.slug}] body baked (wordCount ≥ 600 — full content crawlable)`, (aMeta.wordCount ?? 0) >= 600, `got ${aMeta.wordCount}`);
  assert(`[${a.slug}] no HIGH-severity thin-content issue`, !aSeo.issues.some((i) => i.field === "wordCount" && i.severity === "high"));
  // Detailed readout for the first article (rag) — keeps the original sample log.
  if (firstArticle) {
    firstArticle = false;
    console.log(`\n=== Built article shell (${a.slug}) — crawler/auditor readout ===`);
    console.log("title:        ", aMeta.title);
    console.log("h1:           ", aMeta.h1);
    console.log("wordCount:    ", aMeta.wordCount);
    console.log("h2Count:      ", aMeta.h2Count);
    console.log("canonical:    ", aMeta.canonical);
    console.log("schemaTypes:  ", aMeta.schemaTypes?.join(", "));
    console.log("SEO score:    ", aSeo.score);
  }
}

// ─── Admin console shells (private: noindex + excluded from sitemap) ───
// The admin routes get prebuilt shells ONLY so the SPA boots (the catch-all
// rewrite does not serve the SPA for shell-less routes — the root cause of the
// /admin/growth 404). They must be noindex and absent from sitemap.xml.
const adminShellPath = resolve(__dirname, "..", "dist", "admin", "growth", "index.html");
const adminUsageShellPath = resolve(__dirname, "..", "dist", "admin", "growth", "usage", "index.html");
const sitemapPath = resolve(__dirname, "..", "dist", "sitemap.xml");
let adminHtml = "";
try {
  adminHtml = readFileSync(adminShellPath, "utf8");
} catch {
  console.log(`\n=== Admin shell — NOT FOUND at ${adminShellPath} ===`);
  assert("admin shell built (dist/admin/growth/index.html exists — fixes the 404)", false);
  console.log(`\n${failures === 0 ? "ALL ACCURACY CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

console.log("\n=== Admin-shell (private) assertions ===");
assert("admin shell built (dist/admin/growth/index.html exists — fixes the 404)", adminHtml.length > 0);
assert("admin shell is noindex,nofollow", /name="robots"\s+content="noindex,\s*nofollow"/i.test(adminHtml));
try {
  const usageShell = readFileSync(adminUsageShellPath, "utf8");
  assert("usage sub-route shell built (dist/admin/growth/usage/index.html)", usageShell.length > 0);
  assert("usage shell is noindex,nofollow", /name="robots"\s+content="noindex,\s*nofollow"/i.test(usageShell));
} catch {
  assert("usage sub-route shell built (dist/admin/growth/usage/index.html)", false);
}
try {
  const sitemap = readFileSync(sitemapPath, "utf8");
  assert("no admin/growth URL in sitemap.xml (private, excluded)", !/admin\/growth/i.test(sitemap));
} catch {
  assert("sitemap.xml readable", false);
}

console.log(`\n${failures === 0 ? "ALL ACCURACY CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);