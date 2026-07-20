/**
 * InBharat Growth Agent — Module 5: SEO Auditor.
 * Scores a page out of 100 across title/meta/H1/canonical/headings/internal
 * links/image alt/schema/sitemap/robots/mobile/duplicate/thin/CTA.
 * Pure function over PageMeta; hermetically testable.
 */
import type { AuditIssue, PageMeta, SeoScore } from "./types.js";
import { issue, scoreFromIssues, sortBySeverity } from "./scoring.js";

export function scoreSeo(page: PageMeta): SeoScore {
  const issues: AuditIssue[] = [];

  // Title
  if (!page.title) {
    issues.push(issue("critical", "title", "Missing <title>", "Add a unique, descriptive <title> (50–60 chars)."));
  } else {
    if (page.title.length > 65) issues.push(issue("normal", "title", "Title is long", `Trim to ≤60 chars (currently ${page.title.length}).`));
    if (page.title.length < 20) issues.push(issue("normal", "title", "Title is short", `Expand to ~50–60 chars (currently ${page.title.length}).`));
  }

  // Meta description
  if (!page.metaDescription) {
    issues.push(issue("high", "metaDescription", "Missing meta description", "Add a meta description summarizing the page (140–160 chars)."));
  } else if (page.metaDescription.length > 170) {
    issues.push(issue("normal", "metaDescription", "Meta description is long", `Trim to ≤160 chars (currently ${page.metaDescription.length}).`));
  } else if (page.metaDescription.length < 70) {
    issues.push(issue("normal", "metaDescription", "Meta description is short", `Expand to ~150 chars (currently ${page.metaDescription.length}).`));
  }

  // H1
  if (!page.h1) {
    issues.push(issue("high", "h1", "Missing H1", "Add a single descriptive H1 per page."));
  } else if ((page.h1Count ?? 1) > 1) {
    issues.push(issue("high", "h1", `Multiple H1 tags (${page.h1Count})`, "Use exactly one <h1> per page; demote the rest to <h2>."));
  }
  if ((page.h2Count ?? 0) === 0) {
    issues.push(issue("normal", "headings", "No H2 subheadings", "Add H2 sections to structure content for users and crawlers."));
  }

  // Canonical
  if (!page.canonical) {
    issues.push(issue("high", "canonical", "Missing canonical link", "Add <link rel=\"canonical\"> to prevent duplicate-content ambiguity."));
  } else if ((page.canonicalCount ?? 1) > 1) {
    issues.push(issue("high", "canonical", `Multiple canonical tags (${page.canonicalCount})`, "Keep exactly one <link rel=\"canonical\"> per page; conflicting canonicals leave the URL choice to Google."));
  }

  // Word count / thin content
  if ((page.wordCount ?? 0) < 300) {
    issues.push(issue("high", "wordCount", `Thin content (${page.wordCount ?? 0} words)`, "Expand to ≥300 words of useful, proof-backed content; avoid doorway pages."));
  } else if ((page.wordCount ?? 0) < 600) {
    issues.push(issue("low", "wordCount", `Light content (${page.wordCount} words)`, "Consider expanding with examples, FAQs, and proof."));
  }

  // Internal links
  if ((page.internalLinks ?? 0) < 2) {
    issues.push(issue("high", "internalLinks", "Few internal links", "Link to relevant solution/product pages to distribute authority."));
  }

  // Image alt
  if ((page.imagesTotal ?? 0) > 0 && (page.imagesWithoutAlt ?? 0) > 0) {
    const ratio = (page.imagesWithoutAlt ?? 0) / (page.imagesTotal ?? 1);
    const sev = ratio > 0.5 ? "high" : "normal";
    issues.push(issue(sev, "imageAlt", `${page.imagesWithoutAlt}/${page.imagesTotal} images missing alt`, "Add descriptive alt text to every meaningful image."));
  }

  // Schema
  if (!page.schemaTypes || page.schemaTypes.length === 0) {
    issues.push(issue("normal", "schema", "No JSON-LD schema", "Add Organization/WebSite/Service/FAQPage schema as relevant."));
  }

  // Sitemap
  if (page.inSitemap === false) {
    issues.push(issue("high", "sitemap", "URL not in sitemap.xml", "Add the URL to the sitemap so search engines discover it."));
  }

  // Robots
  if (page.metaRobots && /noindex/i.test(page.metaRobots)) {
    issues.push(issue("critical", "robots", "Page is noindex", "Remove noindex if this page should rank."));
  }
  if (page.robotsAllowed === false) {
    issues.push(issue("high", "robots.txt", "Blocked by robots.txt", "Allow the growth UA / Googlebot in robots.txt for indexable pages."));
  }

  // HTTP status
  if (page.httpStatus && (page.httpStatus >= 400)) {
    issues.push(issue("critical", "httpStatus", `HTTP ${page.httpStatus}`, "Fix the server response; broken pages can't rank."));
  }

  // Redirect chain depth — more than one hop to reach the page is a minor
  // inefficiency Google may flag. Page-level (not the canonical host redirect,
  // which is expected for non-www/apex variants).
  if ((page.redirectChain?.length ?? 0) > 1) {
    issues.push(issue("normal", "redirect", `Reached via ${page.redirectChain!.length} redirect hops`, "Collapse the redirect chain to a single hop where possible; each hop wastes crawl budget and link equity."));
  }

  // CTA
  if (!page.hasCta) {
    issues.push(issue("normal", "cta", "No clear CTA", "Add a primary CTA (book demo / try / contact) above the fold."));
  }

  const score = scoreFromIssues(issues);
  return { score, issues: sortBySeverity(issues) };
}