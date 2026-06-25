/**
 * InBharat Growth Agent — Module 6: GEO / AI-Search Auditor.
 *
 * Grounded in Google's guidance that AEO/GEO is part of good SEO, not a
 * separate trick layer. Checks answerability, entity clarity, proof, and
 * usefulness — no fake AI-only manipulation. Pure over PageMeta.
 */
import type { AuditIssue, GeoScore, PageMeta } from "./types.js";
import { issue, scoreFromIssues, sortBySeverity } from "./scoring.js";

export function scoreGeo(page: PageMeta): GeoScore {
  const issues: AuditIssue[] = [];

  // Direct answer / product definition — proxied by title + H1 + description presence
  if (!page.h1) {
    issues.push(issue("high", "directAnswer", "No H1 to anchor the answer", "Lead with a clear H1 that states what the page is and who it's for."));
  }
  if (!page.metaDescription || page.metaDescription.length < 70) {
    issues.push(issue("high", "directAnswer", "Weak meta description for AI snippets", "Write a 140–160 char description that answers 'what is this' directly."));
  }

  // Audience clarity
  if (!page.audienceSignal) {
    issues.push(issue("high", "audience", "No explicit audience signal", "Add a 'who this is for' block naming the buyer (e.g. Indian small businesses)."));
  }

  // Problem → solution framing (needs enough substance)
  if ((page.wordCount ?? 0) < 300) {
    issues.push(issue("high", "substance", "Too thin for AI extraction", "Add a problem/solution section with concrete workflow and proof."));
  }

  // FAQs (great for AI answer extraction)
  if (!page.faqPresent) {
    issues.push(issue("normal", "faq", "No FAQ block", "Add an FAQ section (with FAQPage schema) to feed AI answer extraction."));
  }

  // Comparison
  if (!page.comparisonPresent) {
    issues.push(issue("low", "comparison", "No comparison/alternatives framing", "Add a short 'X vs alternatives' block to capture comparison queries."));
  }

  // Proof / demo
  if (!page.proofPresent) {
    issues.push(issue("normal", "proof", "No proof/demo/screenshots", "Add screenshots, a demo link, or example output to back claims."));
  }

  // Schema (entities)
  if (!page.schemaTypes || page.schemaTypes.length === 0) {
    issues.push(issue("normal", "schema", "No structured data", "Add Organization/Service/Product/FAQPage schema so AI can resolve the entity."));
  } else if (!page.schemaTypes.some((t) => /faq|service|product|organization/i.test(t))) {
    issues.push(issue("low", "schema", "Schema lacks answer-oriented types", "Prioritize FAQPage/Service/Product over decorative schema."));
  }

  // Internal links help retrieval
  if ((page.internalLinks ?? 0) < 2) {
    issues.push(issue("normal", "internalLinks", "Few internal links for retrieval", "Link to related solution/product pages so AI can traverse context."));
  }

  // Noindex / broken = invisible to AI
  if (page.metaRobots && /noindex/i.test(page.metaRobots)) {
    issues.push(issue("critical", "robots", "noindex — invisible to AI search", "Remove noindex so AI engines can surface the page."));
  }
  if (page.httpStatus && page.httpStatus >= 400) {
    issues.push(issue("critical", "httpStatus", `HTTP ${page.httpStatus}`, "Fix the page so AI crawlers can fetch it."));
  }

  const score = scoreFromIssues(issues);
  return { score, issues: sortBySeverity(issues) };
}