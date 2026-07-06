/**
 * InBharat Growth — Gate 3: fact-check (shallow grounding backstop, no model).
 *
 * Extracts numeric / date / version / money / scale claims from the draft body
 * and substring-checks each against the concatenated grounding snippet text.
 * A claim that appears in NO snippet is "ungrounded" → flagged.
 *
 * HONEST: this is a SHALLOW backstop. It catches numbers the model invented
 * that have no source at all. It does NOT catch semantically-wrong claims
 * (wrong number that happens to appear elsewhere in the snippets), unit
 * mismatches, or out-of-context reuse. Real fact-checking is the critique
 * model's job (gate 4 reuses its output). This gate is the cheap regex net
 * underneath that.
 *
 * Reuses gathered snippets — NO new retrieval. Pure + hermetic.
 */
import type { GateFinding } from "../gates.js";

export interface FactSnippetInput {
  url: string;
  title: string;
  snippet: string;
}

interface Claim {
  text: string;
  kind: string;
}

const CLAIM_RES: { kind: string; re: RegExp }[] = [
  // Percentages, multiples, revenue/ARR/MRR, raised/valued, downloads/users/k/M/B
  { kind: "metric", re: /\b(\d+(?:\.\d+)?)\s*(%|x|k\+?|m\+?|b\+?|users?|downloads?|revenue|arr|mrr|raised|valued|customers?|signups?)\b/gi },
  // ISO-ish dates: 2024-01-15, Jan 2025, January 2025
  { kind: "date", re: /\b(20\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01]))\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d{2}\b/gi },
  // Semver: 1.2.3, 0.30.0
  { kind: "version", re: /\b\d+\.\d+\.\d+\b/g },
];

function extractClaims(body: string): Claim[] {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of CLAIM_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const text = m[0].trim();
      const key = `${kind}:${text.toLowerCase()}`;
      if (text && !seen.has(key)) {
        seen.add(key);
        claims.push({ text, kind });
      }
      if (re.lastIndex === m.index) re.lastIndex++; // avoid zero-length loop
    }
  }
  return claims;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A claim is "grounded" if its normalized form appears as a substring of any
 *  normalized snippet text. Pure. */
export function claimVsGroundingCheck(body: string, snippets: FactSnippetInput[]): { ungrounded: Claim[]; grounded: number; findings: GateFinding[] } {
  const claims = extractClaims(body ?? "");
  if (claims.length === 0) {
    return { ungrounded: [], grounded: 0, findings: [] };
  }
  if (!snippets || snippets.length === 0) {
    // No snippets + claims present = nothing to check against. Honest: we can't
    // confirm OR refute. Warn (don't fail) — the critique pass is the real gate.
    return {
      ungrounded: claims,
      grounded: 0,
      findings: [{ severity: "minor", message: `${claims.length} numeric/date/version claim(s) present but no grounding snippets to check against.`, fix: "Run web_search before drafting so claims are anchored, or cite sources inline." }],
    };
  }
  const haystacks = snippets.map((s) => normalize(`${s.title} ${s.snippet}`));
  const ungrounded: Claim[] = [];
  for (const c of claims) {
    const n = normalize(c.text);
    if (!haystacks.some((h) => h.includes(n))) ungrounded.push(c);
  }
  const findings: GateFinding[] = [];
  if (ungrounded.length > 0) {
    const sample = ungrounded.slice(0, 5).map((c) => c.text).join(", ");
    const sev = ungrounded.length >= 3 ? "major" : "minor";
    findings.push({
      severity: sev,
      message: `${ungrounded.length} claim(s) not found in grounding snippets: ${sample}${ungrounded.length > 5 ? " …" : ""}`,
      fix: "Drop the ungrounded number, or add a source snippet that supports it.",
    });
  }
  return { ungrounded, grounded: claims.length - ungrounded.length, findings };
}