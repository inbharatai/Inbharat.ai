/**
 * InBharat Growth — Gate 8: claim risk (conservative regex, NOT legal/PR review).
 *
 * Flags promotional / quantified-brag phrasing that a 1-person founder shop
 * should not publish without a verifiable source: "N users", "Nx revenue",
 * "partnered with", "trusted by", "raised $", "valued at", "% growth",
 * "millions of", "leading provider", "industry-first", "best-in-class".
 *
 * HONEST: conservative surface flagger for HUMAN review. It does NOT assess
 * legal risk, trademark risk, or whether a claim is substantiated — that's the
 * founder's call at approval. Better to over-flag a borderline phrase than miss
 * a "millions of users" the studio can't defend. Pure + hermetic.
 */
import type { GateFinding } from "../gates.js";

interface RiskPattern {
  re: RegExp;
  label: string;
  fix: string;
}

const RISK_PATTERNS: RiskPattern[] = [
  { re: /\b\d[\d,]*\+?\s+(users?|customers?|downloads?|signups?|companies|businesses|msmes)\b/i, label: "quantified user/customer count", fix: "Cite a verifiable source or drop the number; unverified user counts draw regulatory + reputational risk." },
  { re: /\b\d+(?:\.\d+)?\s*x\s+(revenue|growth|arr|mrr)\b/i, label: "multiple on revenue/growth", fix: "State the baseline + period explicitly, or replace with a directional word (grew, scaled)." },
  { re: /\b(partnered with|partners with|in partnership with)\b/i, label: "partnership claim", fix: "Name the partner + link the announcement, or soften to 'we work with'." },
  { re: /\b(trusted by|used by|adopted by)\b/i, label: "social-proof claim", fix: "Attach a named customer/logo wall, or drop the phrase." },
  { re: /\b(raised|raised)\s+\$?\d/i, label: "fundraising claim", fix: "Link the funding-round announcement; never state a raise without a public source." },
  { re: /\b(valued at|valuation of)\b/i, label: "valuation claim", fix: "Link the source; valuations are sensitive + time-bound." },
  { re: /\b\d+(?:\.\d+)?\s*%\s+(growth|increase|more|faster|YoY|yoy)\b/i, label: "percentage growth claim", fix: "Give the baseline + window, or replace with a directional word." },
  { re: /\b(millions?|billions?)\s+of\b/i, label: "unquantified scale claim", fix: "Replace with a concrete, sourced number or drop the hyperbole." },
  { re: /\b(leading|top|best-in-class|industry.?first|world.?class|#1|first ever)\b/i, label: "superlative claim", fix: "Superlatives need a source + scope; soften to a specific, defensible attribute." },
  { re: /\b(100%|99\.9%|zero downtime|always on)\b/i, label: "absolute availability/perf claim", fix: "Absolutes are unverifiable; state the measured SLA / p95 instead." },
];

export interface ClaimRiskResult {
  findings: GateFinding[];
  hits: { label: string; count: number }[];
}

export function checkClaimRisk(body: string): ClaimRiskResult {
  const b = body ?? "";
  const hits: { label: string; count: number }[] = [];
  const findings: GateFinding[] = [];
  for (const p of RISK_PATTERNS) {
    p.re.lastIndex = 0;
    const count = (b.match(p.re) ?? []).length;
    if (count > 0) {
      hits.push({ label: p.label, count });
      findings.push({
        severity: "minor",
        message: `Possible risky claim (${p.label}) — ${count}×.`,
        fix: p.fix,
      });
    }
  }
  if (hits.length >= 3) {
    findings.push({ severity: "major", message: `${hits.length} distinct risky-claim patterns present — the draft reads promotional.`, fix: "Strip unsourceable quantified claims before approval." });
  }
  return { findings, hits };
}