/**
 * InBharat Growth — Gate 5: product naming (canonical vs banned variants).
 *
 * Word-boundary regex scan of title + body against the canonical product names
 * and a banned/misspelling list. Surfaces any banned variant so the founder can
 * fix it before publish. HONEST: regex, not semantic — won't catch paraphrased
 * mentions, but catches the exact mis-spellings that matter for brand consistency.
 *
 * Canonical names are the source of truth from config/repo-registry.json (the
 * productName field). Banned variants are the historical misspellings + retired
 * brands the founder has flagged (RHCF Seva, UniGurus, single-a Sahayak,
 * Swasthya Score). Pure + hermetic.
 */
import type { GateFinding } from "../gates.js";

/** Canonical product names (must match repo-registry productName exactly). */
export const CANONICAL_PRODUCT_NAMES: string[] = [
  "InBharat.ai",
  "JAK Swarm",
  "JAK Shield",
  "KathaKitaab",
  "TestsPrep",
  "UniAssist",
  "Sahayaak AI",
  "Sahayaak Seva",
  "UnoOne",
  "SocialFlow",
  "Agent Arcade",
  "OpenClawFix",
  "CodeIn",
  "Phoring",
  "SwasthyaScore AI",
  "JAKOps",
];

/**
 * Banned surface variants → the canonical form to use instead. Regex-escaped;
 * matched case-insensitively on word boundaries. "RHCF Seva" / "RHCF-Seva" must
 * never appear publicly (healthcare positioning lives under Sahayaak Seva).
 */
export const BANNED_PRODUCT_VARIANTS: { bad: string; good: string }[] = [
  { bad: "RHCF Seva", good: "Sahayaak Seva" },
  { bad: "RHCF-Seva", good: "Sahayaak Seva" },
  { bad: "UniGurus", good: "UniAssist" },
  { bad: "Sahayak AI", good: "Sahayaak AI" },
  { bad: "Sahayak Seva", good: "Sahayaak Seva" },
  { bad: "Sahayek", good: "Sahayaak" },
  { bad: "Swasthya Score", good: "SwasthyaScore AI" },
  { bad: "Swasthyascore", good: "SwasthyaScore AI" },
  { bad: "Katha Kitaab", good: "KathaKitaab" },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ProductNameResult {
  findings: GateFinding[];
  bannedHits: { bad: string; good: string; count: number }[];
}

export function checkProductNames(title: string, body: string): ProductNameResult {
  const text = `${title ?? ""}\n${body ?? ""}`;
  const bannedHits: { bad: string; good: string; count: number }[] = [];
  const findings: GateFinding[] = [];
  for (const { bad, good } of BANNED_PRODUCT_VARIANTS) {
    const re = new RegExp(`\\b${escapeRe(bad)}\\b`, "gi");
    const count = (text.match(re) ?? []).length;
    if (count > 0) {
      bannedHits.push({ bad, good, count });
      const sev = /rhcf/i.test(bad) ? "major" : "minor";
      findings.push({
        severity: sev,
        message: `Banned/retired brand variant "${bad}" appears ${count}× — use "${good}" instead.`,
        fix: `Replace every "${bad}" with "${good}".`,
      });
    }
  }
  return { findings, bannedHits };
}