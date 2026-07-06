/**
 * InBharat Growth — Gate 6 adapter: derive a PageMeta from a draft.
 *
 * Pure. Parses the article markdown the way the published page will render so
 * the SEO/GEO auditors (scoreSeo / scoreGeo, both pure over PageMeta) can run a
 * STATIC pre-check on a draft that hasn't been crawled yet.
 *
 * HONEST scope (matches the plan's "Honest limitations"):
 *   • Only fields computable from the markdown are populated.
 *   • Left UNDEFINED (auditors are verified undefined-safe on these): brokenLinks,
 *     imagesWithoutAlt, imagesTotal, inSitemap, robotsAllowed, httpStatus,
 *     pageDepth, schemaTypes, metaRobots. scoreSeo/scoreGeo use `?? 0` / `=== false`
 *     / truthy-gates on every one of these, so undefined → "not flagged". The
 *     full audit still runs post-publish on crawled HTML via auditDomain.
 *   • wordCount is a prose-word estimate (strips code fences + markdown syntax);
 *     the live crawl counts rendered text, which is close but not identical.
 */
import type { PageMeta } from "../types.js";
import { canonicalForSlug } from "../syndication/tags.js";

/** Strip ``` fenced blocks (code + mermaid) so code isn't counted as prose words. */
function stripFences(md: string): string {
  return md.replace(/```[\s\S]*?```/g, " ");
}

/** Strip markdown syntax characters to approximate rendered prose. */
function toProse(md: string): string {
  return stripFences(md)
    .replace(/>\s+/g, " ")            // blockquote markers
    .replace(/[#*_`~-]+/g, " ")       // heading/bold/italic/code/list markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → anchor text
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(re: RegExp, s: string): number {
  let n = 0;
  // Reset lastIndex because we use the global flag and may call repeatedly.
  re.lastIndex = 0;
  while (re.exec(s) !== null) {
    n++;
    if (n > 9999) break; // paranoid cap
  }
  return n;
}

/**
 * Build a PageMeta from a draft. Pure — no network, no DB. The canonical is
 * derived from the slug via canonicalForSlug (the www article URL); for non-
 * article kinds there is no canonical page, so canonical is omitted and gate 6
 * is skipped at the orchestrator level for those kinds.
 */
export function draftToPageMeta(input: {
  kind: "article" | "linkedin" | "video-script";
  slug: string;
  title: string;
  description?: string;
  abstract?: string;
  bodyMd: string;
}): PageMeta {
  const body = input.bodyMd ?? "";
  const h1Match = body.match(/^#\s+(.+)$/m);
  const h1 = h1Match ? h1Match[1].trim() : input.title;
  const h2Count = countMatches(/^##\s+/gm, body);
  const h3Count = countMatches(/^###\s+/gm, body);
  // Count BOTH markdown links [text](url) AND bare http(s) URLs (remark-gfm
  // autolinks bare URLs, so they're real links in the rendered article). Internal
  // = inbharat.ai / jakswarm.com / kathakitaab.com / sahayaakseva.in hosts;
  // external = everything else.
  const linkRe = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|\bhttps?:\/\/[^\s)\]]+/g;
  let internalLinks = 0;
  let externalLinks = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body)) !== null) {
    const raw = m[1] ?? m[0];
    const host = (raw.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "").replace(/^www\./, "");
    if (!host) continue;
    if (host === "inbharat.ai" || host === "jakswarm.com" || host === "kathakitaab.com" || host === "sahayaakseva.in") {
      internalLinks++;
    } else {
      externalLinks++;
    }
  }
  const prose = toProse(body);
  const wordCount = prose ? prose.split(/\s+/).length : 0;
  const metaDescription = (input.description ?? input.abstract ?? "").trim() || undefined;
  const lowerBody = body.toLowerCase();
  return {
    title: input.title || undefined,
    metaDescription,
    canonical: input.kind === "article" && input.slug ? canonicalForSlug(input.slug) : undefined,
    h1: h1 || undefined,
    h2Count,
    h3Count,
    internalLinks,
    externalLinks,
    wordCount,
    hasCta: /\b(read|try|start|get|book|sign up|subscribe|explore|see|check out|learn how|build with)\b/i.test(prose.slice(-400)),
    faqPresent: /^##\s+faq/im.test(body) || /faq/i.test(lowerBody.slice(0, 60)),
    comparisonPresent: /\bvs\.?\b|versus|alternatives?|compared?\b/i.test(lowerBody),
    proofPresent: /\bproof|case study|benchmark|measured|p95|p99|latency|test|verified|evidence\b/i.test(lowerBody),
    audienceSignal: /\bwho this is for|for (indian )?(small businesses|founders|engineers|ops teams|msmes|developers)|audience\b/i.test(lowerBody),
    // Deliberately undefined (auditors are undefined-safe — see header):
    // brokenLinks, imagesWithoutAlt, imagesTotal, inSitemap, robotsAllowed,
    // httpStatus, pageDepth, schemaTypes, metaRobots.
  };
}