/**
 * Audit a built article shell with the Growth Agent's own SEO/GEO scorers.
 * Run: npx tsx scripts/audit-article.ts <path-to-dist-shell.html> [url]
 */
import { readFileSync } from "node:fs";
import { parsePage } from "../lib/growth/crawler.js";
import { scoreSeo } from "../lib/growth/seo-auditor.js";
import { scoreGeo } from "../lib/growth/geo-auditor.js";

const html = readFileSync(process.argv[2], "utf8");
const url = process.argv[3] || "https://inbharat.ai/learn-ai-with-reeturaj/harness-engineering";
const meta = parsePage(html, url);
const seo = scoreSeo(meta);
const geo = scoreGeo(meta);

console.log("=== Growth Agent audit ===");
console.log("URL:", url);
console.log("title:", meta.title);
console.log("h1:", meta.h1);
console.log("metaDescription:", (meta.metaDescription ?? "").slice(0, 80));
console.log("canonical:", meta.canonical);
console.log("wordCount:", meta.wordCount, "| h2Count:", meta.h2Count, "| internalLinks:", meta.internalLinks);
console.log("schemaTypes:", meta.schemaTypes);
console.log("flags: faq=", meta.faqPresent, "comparison=", meta.comparisonPresent, "proof=", meta.proofPresent, "audience=", meta.audienceSignal, "cta=", meta.hasCta, "imagesTotal=", meta.imagesTotal, "imagesWithoutAlt=", meta.imagesWithoutAlt);
console.log(`\nSEO score: ${seo.score}/100 (${seo.issues.length} issues)`);
for (const i of seo.issues.slice(0, 6)) console.log(`  [${i.severity}] ${i.field}: ${i.message}`);
console.log(`\nGEO score: ${geo.score}/100 (${geo.issues.length} issues)`);
for (const i of geo.issues.slice(0, 6)) console.log(`  [${i.severity}] ${i.field}: ${i.message}`);