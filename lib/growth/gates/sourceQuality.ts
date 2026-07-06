/**
 * InBharat Growth — Gate 2: source quality (static, no model, no authority API).
 *
 * Scores the grounding snippets gathered pre-draft (reused — NO new retrieval).
 * Three signals, each 0-100, averaged:
 *   • domain allowlist — trusted source domains (repo-registry product domains +
 *     a static set: HN, arXiv, official docs, GitHub, government/stat sites)
 *   • relevance — token-overlap between the snippet title+snippet and the draft
 *     title (Jaccard on lowercased alphanumeric tokens, stopwords removed)
 *   • freshness — only when fetchedAt is present on the snippet; else "unknown"
 *     and excluded from the average (honest — GroundingSnippet has no date field
 *     today, so freshness rarely applies; the gate degrades to domain+relevance)
 *
 * HONEST name: "source quality", NOT "authority". No Moz/Ahrefs DA. The
 * allowlist is a hand-curated trust set — conservative, not a ranking.
 *
 * Pure + hermetic.
 */
import type { GateFinding } from "../gates.js";

export interface SourceSnippetInput {
  url: string;
  title: string;
  snippet: string;
  fetchedAt?: string;
}

const TRUSTED_DOMAINS = new Set([
  // Official docs / vendor primaries
  "developer.mozilla.org",
  "web.dev",
  "developers.google.com",
  "cloud.google.com",
  "aws.amazon.com",
  "docs.aws.amazon.com",
  "learn.microsoft.com",
  "nodejs.org",
  "react.dev",
  "typescriptlang.org",
  "vercel.com",
  "supabase.com",
  "openai.com",
  "anthropic.com",
  "ai.google.dev",
  // Research / community
  "news.ycombinator.com",
  "arxiv.org",
  "github.com",
  "stackoverflow.com",
  "wikipedia.org",
  // Government / stat
  "gov.in",
  "nic.in",
  "msme.gov.in",
  "uidai.gov.in",
  "rbi.org.in",
  "niti.gov.in",
  // Major outlets (high editorial bar, not blanket-trusted)
  "thehindubusinessline.com",
]);

const PRODUCT_DOMAINS = new Set([
  "inbharat.ai",
  "jakswarm.com",
  "kathakitaab.com",
  "sahayaakseva.in",
  "sahayaak.ai",
  "testsprep.in",
  "uniassist.ai",
  "openclawfix.pro",
  "codein.pro",
  "swasthyascore.ai",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "with",
  "is", "are", "was", "were", "be", "been", "this", "that", "it", "as", "by",
  "how", "what", "why", "when", "your", "you", "we", "our", "their", "its",
  "from", "into", "using", "use", "can", "do", "does", "not", "no", "yes",
]);

function hostOf(url: string): string {
  try {
    return (url.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "").replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** registered/suffix match against the allowlist (subdomain-aware). */
function isTrustedHost(host: string, set: Set<string>): boolean {
  if (!host) return false;
  if (set.has(host)) return true;
  // suffix match: foo.github.io → github.io not in set, but assets.ubuntu.com → ubuntu.com not in set either
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function tokens(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function freshnessScore(fetchedAt: string): number | null {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return null;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 0) return 100; // clock skew — treat as fresh, don't penalize
  if (days <= 30) return 100;
  if (days <= 90) return 80;
  if (days <= 180) return 60;
  if (days <= 365) return 40;
  return 20;
}

export interface SourceQualityResult {
  score: number; // 0-100
  findings: GateFinding[];
}

export function scoreSources(snippets: SourceSnippetInput[], draftTitle: string): SourceQualityResult {
  if (!snippets || snippets.length === 0) {
    return {
      score: 100,
      findings: [{ severity: "minor", message: "No grounding snippets — source-quality gate skipped (draft produced without web_search grounding).", fix: "Run web_search before drafting so claims are anchored to real sources." }],
    };
  }
  const titleTokens = tokens(draftTitle);
  const perSnippet: number[] = [];
  const findings: GateFinding[] = [];
  let anyUntrusted = false;
  let anyLowRelevance = false;
  for (const s of snippets) {
    const host = hostOf(s.url);
    const domainScore = isTrustedHost(host, TRUSTED_DOMAINS) || isTrustedHost(host, PRODUCT_DOMAINS) ? 100 : 40;
    if (domainScore < 100) anyUntrusted = true;
    const rel = jaccard(titleTokens, tokens(`${s.title} ${s.snippet}`));
    const relScore = Math.round(rel * 100);
    if (relScore < 20) anyLowRelevance = true;
    const fresh = s.fetchedAt ? freshnessScore(s.fetchedAt) : null;
    const parts = [domainScore, relScore, ...(fresh !== null ? [fresh] : [])];
    const avg = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    perSnippet.push(avg);
  }
  const score = Math.round(perSnippet.reduce((a, b) => a + b, 0) / perSnippet.length);
  if (anyUntrusted) findings.push({ severity: "minor", message: "One or more grounding sources are not on the trusted-domain allowlist.", fix: "Prefer official docs, GitHub, arXiv, or government/stat sites over unknown domains." });
  if (anyLowRelevance) findings.push({ severity: "minor", message: "One or more grounding snippets have low title-overlap with the draft topic.", fix: "Re-run web_search with a tighter query, or drop tangential snippets." });
  if (score < 60) findings.push({ severity: "major", message: `Composite source quality is low (${score}/100).`, fix: "Replace weak sources with authoritative ones before re-drafting." });
  return { score, findings };
}