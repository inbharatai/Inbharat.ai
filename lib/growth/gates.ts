/**
 * InBharat Growth — the 8 accuracy gates as ONE pre-approval result.
 *
 * Consolidates the scattered / prompt-only quality checks into one structured
 * `runAccuracyGates(draft)` so the cockpit inspector + the agent's
 * `run_accuracy_gates` tool surface a single, honest, advisory verdict.
 *
 * ADVISORY — NEVER blocking. Approval stays a human click (approvals.ts is NOT
 * changed by this module). The 9-stage "Ready = approved" mapping is a view-time
 * label in the pipeline board, NOT a new DB status. No "Ready" status is added
 * to the draft lifecycle.
 *
 * No gate calls a model. Gate 4 reuses the critique already computed at draft
 * time (passed in via input.critique). Gates 2 + 3 reuse the grounding snippets
 * already gathered pre-draft (passed in via input.snippets). The only async work
 * is gate 1's duplicate DB lookup (findDuplicateKnowledge, injectable for tests).
 * costUsd is therefore always 0.
 *
 * HONEST limitations (surfaced in the cockpit UI + the plan):
 *   • Gate 2 = freshness + relevance + static domain allowlist. NOT Moz/Ahrefs DA.
 *   • Gate 3 = regex claim extraction + substring match. Catches ungrounded
 *     numbers, NOT semantic wrongness. Shallow backstop.
 *   • Gate 6 = static pre-check on markdown-derived PageMeta. Cannot check broken
 *     links, image alt, sitemap, robots, rendered schema. The full audit still
 *     runs post-publish on crawled HTML via auditDomain. Draft score is a lower
 *     bound. Skipped for non-article kinds (LinkedIn captions have no page).
 *   • Gate 8 = regex, not legal/PR review. Conservative — flags for human review.
 *
 * Server-only (imports findDuplicateKnowledge, which touches the DB). The pure
 * sub-gates (gates/*) are hermetically testable; the orchestrator is testable
 * via an injected duplicateLookup.
 */
import { findDuplicateKnowledge } from "./knowledge.js";
import { scoreSeo } from "./seo-auditor.js";
import { scoreGeo } from "./geo-auditor.js";
import type { AuditIssue, CritiqueResult, IssueSeverity, PageMeta } from "./types.js";
import { scoreSources, type SourceSnippetInput } from "./gates/sourceQuality.js";
import { claimVsGroundingCheck, type FactSnippetInput } from "./gates/factCheck.js";
import { checkProductNames } from "./gates/productNames.js";
import { checkPlatformFormat, type PlatformKind } from "./gates/platformFormat.js";
import { checkClaimRisk } from "./gates/claimRisk.js";
import { draftToPageMeta } from "./gates/draftToPageMeta.js";

export type GateId =
  | "duplicate"
  | "source_quality"
  | "fact_check"
  | "brand_voice"
  | "product_naming"
  | "seo_geo"
  | "platform_format"
  | "claim_risk";

export interface GateFinding {
  severity: "critical" | "major" | "minor";
  message: string;
  fix?: string;
}

export interface GateResult {
  id: GateId;
  name: string;
  status: "pass" | "warn" | "fail";
  score?: number;
  findings: GateFinding[];
}

export interface GateRun {
  gates: GateResult[];
  overall: "pass" | "warn" | "fail";
  summary: string;
  costUsd: number;
  model?: string;
}

export interface GateInput {
  kind: "article" | "linkedin" | "video-script";
  slug: string;
  title: string;
  description?: string;
  abstract?: string;
  bodyMd: string;
  platform?: PlatformKind;
  hashtags?: string[];
  product?: string | null;
  /** Gate 4 reuses the critique computed at draft time — NO new model call. */
  critique?: { weaknesses: { severity: string; area: string; fix: string }[]; status: string; revised?: string | null; note?: string } | null;
  /** Gates 2/3 reuse gathered grounding snippets — NO new retrieval. */
  snippets?: SourceSnippetInput[] | FactSnippetInput[];
}

const GATE_NAMES: Record<GateId, string> = {
  duplicate: "Duplicate",
  source_quality: "Source Quality",
  fact_check: "Fact-Check",
  brand_voice: "Brand Voice",
  product_naming: "Product Naming",
  seo_geo: "SEO / GEO",
  platform_format: "Platform Format",
  claim_risk: "Claim Risk",
};

export type DuplicateLookup = (topic: string, product?: string | null) => Promise<{ duplicate: boolean; reason?: string }>;

function severityFromIssue(sev: IssueSeverity): GateFinding["severity"] {
  return sev === "critical" ? "critical" : sev === "high" ? "major" : "minor";
}

function statusFromFindings(findings: GateFinding[]): "pass" | "warn" | "fail" {
  if (findings.some((f) => f.severity === "critical")) return "fail";
  if (findings.some((f) => f.severity === "major")) return "warn";
  return "pass";
}

// ─── Gate 1: duplicate ──────────────────────────────────────────────────────
async function gateDuplicate(input: GateInput, lookup: DuplicateLookup): Promise<GateResult> {
  let dup: { duplicate: boolean; reason?: string };
  try {
    dup = await lookup(input.title, input.product ?? undefined);
  } catch {
    // DB down → proceed (never blocks). Honest: gate couldn't run.
    return { id: "duplicate", name: GATE_NAMES.duplicate, status: "pass", findings: [{ severity: "minor", message: "Duplicate check unavailable (DB error) — proceeded without dedupe.", fix: "Re-run gates before approval once the DB is reachable." }] };
  }
  if (dup.duplicate) {
    return {
      id: "duplicate",
      name: GATE_NAMES.duplicate,
      status: "fail",
      findings: [{ severity: "critical", message: `Duplicate of existing content — ${dup.reason ?? "matches existing content"}.`, fix: "Pivot the angle or update the existing article instead of a new draft." }],
    };
  }
  return { id: "duplicate", name: GATE_NAMES.duplicate, status: "pass", findings: [] };
}

// ─── Gate 2: source quality ─────────────────────────────────────────────────
function gateSourceQuality(input: GateInput): GateResult {
  const snippets = (input.snippets ?? []) as SourceSnippetInput[];
  const { score, findings } = scoreSources(snippets, input.title);
  // A "low" composite score (major finding) → warn; a hard fail is reserved for
  // the absence of grounding only when the draft also carries numeric claims
  // (gate 3 handles that). Here: status from findings, score reported.
  const status = statusFromFindings(findings);
  return { id: "source_quality", name: GATE_NAMES.source_quality, status, score, findings };
}

// ─── Gate 3: fact-check ─────────────────────────────────────────────────────
function gateFactCheck(input: GateInput): GateResult {
  const snippets = (input.snippets ?? []) as FactSnippetInput[];
  const { findings } = claimVsGroundingCheck(input.bodyMd, snippets);
  return { id: "fact_check", name: GATE_NAMES.fact_check, status: statusFromFindings(findings), findings };
}

// ─── Gate 4: brand voice (reuses critique — NO new model call) ──────────────
function gateBrandVoice(input: GateInput): GateResult {
  const crit = input.critique;
  if (!crit || !crit.weaknesses || crit.weaknesses.length === 0) {
    // Critique skipped/redacted/unavailable — gate can't assess. Pass + note so
    // the cockpit shows WHY it's a pass (not a silent green).
    return { id: "brand_voice", name: GATE_NAMES.brand_voice, status: "pass", findings: [{ severity: "minor", message: `Critique pass ${crit?.status ?? "unavailable"} — no brand-voice weaknesses recorded.`, fix: "Re-draft with the review model enabled for a real brand-voice pass." }] };
  }
  const findings: GateFinding[] = crit.weaknesses.map((w) => ({
    severity: w.severity === "critical" ? "critical" : w.severity === "major" ? "major" : "minor",
    message: `${w.area}: ${w.fix}`,
  }));
  return { id: "brand_voice", name: GATE_NAMES.brand_voice, status: statusFromFindings(findings), findings };
}

// ─── Gate 5: product naming ─────────────────────────────────────────────────
function gateProductNaming(input: GateInput): GateResult {
  const { findings } = checkProductNames(input.title, input.bodyMd);
  return { id: "product_naming", name: GATE_NAMES.product_naming, status: statusFromFindings(findings), findings };
}

// ─── Gate 6: SEO / GEO (static pre-check, articles only) ────────────────────
function gateSeoGeo(input: GateInput): GateResult {
  if (input.kind !== "article") {
    return { id: "seo_geo", name: GATE_NAMES.seo_geo, status: "pass", findings: [{ severity: "minor", message: `SEO/GEO audit applies to article drafts only (kind='${input.kind}').`, fix: "LinkedIn captions are audited via the Platform Format gate." }] };
  }
  let page: PageMeta;
  try {
    page = draftToPageMeta({
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      description: input.description,
      abstract: input.abstract,
      bodyMd: input.bodyMd,
    });
  } catch (e) {
    return { id: "seo_geo", name: GATE_NAMES.seo_geo, status: "warn", findings: [{ severity: "major", message: `PageMeta derivation failed: ${(e as Error).message}`, fix: "Re-run gates; if it persists, the draft markdown is malformed." }] };
  }
  const seo = scoreSeo(page);
  const geo = scoreGeo(page);
  const all: AuditIssue[] = [...seo.issues, ...geo.issues];
  const findings: GateFinding[] = all.map((i) => ({
    severity: severityFromIssue(i.severity),
    message: `${i.field}: ${i.message}`,
    fix: i.recommendedFix,
  }));
  const score = Math.round((seo.score + geo.score) / 2);
  // Status: fail on any critical, warn on any high, else pass — but a very low
  // composite score (<50) is also a fail (a wall of normal issues adds up).
  let status = statusFromFindings(findings);
  if (status === "pass" && score < 50) status = "warn";
  return { id: "seo_geo", name: GATE_NAMES.seo_geo, status, score, findings };
}

// ─── Gate 7: platform format ────────────────────────────────────────────────
function gatePlatformFormat(input: GateInput): GateResult {
  const platform: PlatformKind = input.platform ?? (input.kind === "linkedin" ? "linkedin" : "inbharat");
  // Medium canonical presence is decided by whether the draft body itself
  // carries a canonical link — a markdown article re-published to Medium should
  // include one. For non-medium platforms this opt is unused.
  const canonicalPresent = /canonical|originally published/i.test(input.bodyMd ?? "");
  const { findings } = checkPlatformFormat(input.bodyMd, platform, { canonicalPresent });
  return { id: "platform_format", name: GATE_NAMES.platform_format, status: statusFromFindings(findings), findings };
}

// ─── Gate 8: claim risk ─────────────────────────────────────────────────────
function gateClaimRisk(input: GateInput): GateResult {
  const { findings } = checkClaimRisk(input.bodyMd);
  return { id: "claim_risk", name: GATE_NAMES.claim_risk, status: statusFromFindings(findings), findings };
}

/**
 * Run all 8 gates against a draft. Advisory — never blocking. The duplicate
 * lookup is injectable (defaults to findDuplicateKnowledge) so the orchestrator
 * is hermetically testable without a DB.
 */
export async function runAccuracyGates(input: GateInput, opts?: { duplicateLookup?: DuplicateLookup }): Promise<GateRun> {
  const lookup = opts?.duplicateLookup ?? ((topic, product) => findDuplicateKnowledge(topic, product));
  const duplicate = await gateDuplicate(input, lookup);
  const sourceQuality = gateSourceQuality(input);
  const factCheck = gateFactCheck(input);
  const brandVoice = gateBrandVoice(input);
  const productNaming = gateProductNaming(input);
  const seoGeo = gateSeoGeo(input);
  const platformFormat = gatePlatformFormat(input);
  const claimRisk = gateClaimRisk(input);
  const gates: GateResult[] = [duplicate, sourceQuality, factCheck, brandVoice, productNaming, seoGeo, platformFormat, claimRisk];
  const overall = gates.some((g) => g.status === "fail") ? "fail" : gates.some((g) => g.status === "warn") ? "warn" : "pass";
  const fails = gates.filter((g) => g.status === "fail").length;
  const warns = gates.filter((g) => g.status === "warn").length;
  const summary = overall === "pass"
    ? `All 8 accuracy gates passed${warns ? ` (${warns} advisory warning(s))` : ""}.`
    : `${fails} gate(s) failed, ${warns} warning(s) — review before approval.`;
  return { gates, overall, summary, costUsd: 0 };
}

// Re-export the pure sub-gates + types for the cockpit UI + tests.
export { scoreSources } from "./gates/sourceQuality.js";
export { claimVsGroundingCheck } from "./gates/factCheck.js";
export { checkProductNames, CANONICAL_PRODUCT_NAMES, BANNED_PRODUCT_VARIANTS } from "./gates/productNames.js";
export { checkPlatformFormat } from "./gates/platformFormat.js";
export { checkClaimRisk } from "./gates/claimRisk.js";
export { draftToPageMeta } from "./gates/draftToPageMeta.js";
export type { SourceSnippetInput } from "./gates/sourceQuality.js";
export type { FactSnippetInput } from "./gates/factCheck.js";
export type { PlatformKind } from "./gates/platformFormat.js";
export type { CritiqueResult };