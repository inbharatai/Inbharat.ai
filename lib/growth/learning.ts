/**
 * InBharat Growth Agent — Module: Learning (outcome → proposed rule distillation).
 *
 * The weekly distill pass reads recent MEASURED outcomes (article-side SEO/GEO
 * deltas + the critique weaknesses that produced each draft) and asks the
 * 'review' model to distill at most 3 concise founder-reviewable rules. Proposed
 * rules are inserted as growth_agent_rules with enabled=false, source='learned',
 * and an evidence payload (the outcome deltas + sample URLs that produced them).
 * The founder approves them in the Rules tab; once enabled they auto-reach the
 * promoter via loadRulesForUrl (the existing rules-injection path) — that is the
 * entire learning wiring.
 *
 * PROPOSE FOR APPROVAL — the agent never self-enables a learned rule. Redacts
 * LAST before the distill model call (project rule). Never throws; no-ops when
 * supabaseAdmin is null or the review model is absent/budget exhausted.
 *
 * Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { logInfo } from "./authorization.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini } from "./gemini.js";
import { bustRulesCache } from "./rules.js";
import { diffOutcomes } from "./outcomes.js";
import type { AgentRuleKind, AgentRuleScope, AuditIssue, CritiqueWeakness } from "./types.js";

const DISTILL_WINDOW_DAYS = 14;
const MAX_PROPOSED = 3;

export async function distillLearnings(): Promise<{ proposed: number; error?: string }> {
  if (!supabaseAdmin) return { proposed: 0 };

  // Recent measured outcomes with their baseline + measured snapshots.
  let outcomes: {
    id: string; url: string; kind: string; draft_id: string | null;
    baseline_seo: number | null; baseline_geo: number | null; baseline_issues: AuditIssue[] | null;
    measured_seo: number | null; measured_geo: number | null; measured_issues: AuditIssue[] | null;
  }[] = [];
  try {
    const since = new Date(Date.now() - DISTILL_WINDOW_DAYS * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("growth_outcomes")
      .select("id,url,kind,draft_id,baseline_seo,baseline_geo,baseline_issues,measured_seo,measured_geo,measured_issues")
      .not("measured_seo", "is", null)
      .gte("measured_at", since)
      .order("measured_at", { ascending: false })
      .limit(30);
    if (error || !Array.isArray(data)) return { proposed: 0 };
    outcomes = data as typeof outcomes;
  } catch {
    return { proposed: 0 };
  }
  if (outcomes.length === 0) return { proposed: 0 };

  // Batch-fetch the linked drafts' critique weaknesses (the recurring failure
  // modes the model should learn to avoid).
  const draftIds = outcomes.map((o) => o.draft_id).filter((x): x is string => typeof x === "string");
  const weaknessMap = new Map<string, CritiqueWeakness[]>();
  if (draftIds.length) {
    try {
      const { data: drafts } = await supabaseAdmin
        .from("growth_drafts")
        .select("id,schema_json")
        .in("id", draftIds);
      for (const d of (drafts as { id: string; schema_json: unknown }[]) ?? []) {
        const sj = (d.schema_json ?? null) as { critique?: { weaknesses?: CritiqueWeakness[] } } | null;
        if (sj?.critique?.weaknesses && Array.isArray(sj.critique.weaknesses)) {
          weaknessMap.set(d.id, sj.critique.weaknesses);
        }
      }
    } catch {
      // weaknesses are enrichment — proceed without them
    }
  }

  // Build the compact evidence payload for the model.
  const evidenceItems = outcomes.map((o) => {
    const delta = diffOutcomes(
      { seo: o.baseline_seo, geo: o.baseline_geo, issues: o.baseline_issues },
      { seo: o.measured_seo, geo: o.measured_geo, issues: o.measured_issues },
    );
    return {
      url: o.url,
      kind: o.kind,
      seoDelta: delta.seoDelta,
      geoDelta: delta.geoDelta,
      issuesResolved: delta.issuesResolved,
      weaknesses: weaknessMap.get(o.draft_id ?? "") ?? [],
    };
  });

  const task: GrowthTask = "review";
  const choice = pickModel(task);
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return { proposed: 0, error: "review model not configured or monthly budget exhausted" };
  }

  const system =
    "You are distilling content-syndication lessons into founder-reviewable rules for the InBharat AI Growth Agent. " +
    "Given recent outcome deltas (SEO/GEO change after publishing a LinkedIn draft) and the recurring weaknesses the critique pass flagged, " +
    "propose at most 3 concise, actionable rules. Prefer rules that, if followed, would have improved the weak outcomes. " +
    "Respond ONLY with compact JSON: {\"rules\": [{\"kind\": \"do|dont|voice|schedule\", \"ruleText\": string, \"scope\": \"global|domain|repo\", \"scopeKey\": string|null}]}.";

  const user =
    `Recent outcomes (last ${DISTILL_WINDOW_DAYS} days):\n${JSON.stringify(evidenceItems).slice(0, 6000)}\n\n` +
    `Propose up to ${MAX_PROPOSED} rules. Use scope "global" unless a rule is clearly domain/repo-specific. JSON only.`;

  // Redact LAST before the model call (project rule).
  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    await logInfo("learning-distill", "global", "redacted secret in distill prompt; aborted").catch(() => undefined);
    return { proposed: 0, error: "redacted secret in distill prompt; aborted" };
  }

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.5, maxOutputTokens: 700 });
  } catch (e) {
    void logUsage({
      model: choice.model, task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: 0,
      totalTokens: Math.ceil((system.length + user.length) / 4),
      costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider,
    });
    return { proposed: 0, error: `distill model call failed: ${(e as Error).message}` };
  }

  const parsed = safeParseRules(raw);
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  const costUsd = estimateCost(choice, totalTokens);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd,
    status: parsed ? "ok" : "parse_failed", contextUrl: null, provider: choice.provider,
  });
  if (!parsed) {
    return { proposed: 0, error: "distill model returned no usable rules" };
  }

  const validRules = parsed.rules
    .map(coerceRule)
    .filter((r): r is { kind: AgentRuleKind; ruleText: string; scope: AgentRuleScope; scopeKey: string | null } => !!r)
    .slice(0, MAX_PROPOSED);

  let proposed = 0;
  const outcomeIds = outcomes.map((o) => o.id);
  const sampleUrls = outcomes.map((o) => o.url).slice(0, 5);
  const aggregateDeltas = {
    avgSeoDelta: avg(evidenceItems.map((e) => e.seoDelta).filter((x): x is number => x != null)),
    avgGeoDelta: avg(evidenceItems.map((e) => e.geoDelta).filter((x): x is number => x != null)),
    totalIssuesResolved: evidenceItems.reduce((s, e) => s + e.issuesResolved, 0),
  };
  for (const r of validRules) {
    try {
      // Skip duplicates: an identical learned rule already exists → don't re-propose.
      const { data: dup } = await supabaseAdmin
        .from("growth_agent_rules")
        .select("id")
        .eq("source", "learned")
        .eq("rule_text", r.ruleText)
        .limit(1);
      if (Array.isArray(dup) && dup.length > 0) continue;

      // Stage 2 paraphrase-aware dedupe: a reworded-but-equivalent rule (e.g.
      // "keep LinkedIn captions under 90 words" vs "keep captions 60-90 words") is
      // not caught by the exact-text check above but is the same lesson. Compare
      // against existing learned + enabled rules' text via token Jaccard; skip when
      // a near-duplicate is found so the founder isn't asked to re-approve the same
      // rule rephrased every distill cycle.
      const paraphrase = await isParaphraseOfExisting(r.ruleText);
      if (paraphrase) {
        await logInfo("learning-distill-paraphrase-skip", "global", `near-duplicate of existing rule: ${r.ruleText.slice(0, 80)}`).catch(() => undefined);
        continue;
      }

      await supabaseAdmin.from("growth_agent_rules").insert({
        scope: r.scope,
        scope_key: r.scope === "global" ? null : r.scopeKey ?? null,
        kind: r.kind,
        rule_text: r.ruleText,
        enabled: false,
        source: "learned",
        evidence: { outcomeIds, sampleUrls, deltas: aggregateDeltas, generatedAt: new Date().toISOString() },
      });
      proposed++;
    } catch {
      // one insert failure doesn't abort the rest
    }
  }

  bustRulesCache();
  await logInfo("learning-distill", "global", `proposed=${proposed} of ${validRules.length} candidates (from ${outcomes.length} outcomes)`).catch(() => undefined);
  return { proposed };
}

interface ProposedRule {
  kind?: unknown;
  ruleText?: unknown;
  scope?: unknown;
  scopeKey?: unknown;
}
function safeParseRules(raw: string): { rules: ProposedRule[] } | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const rules = (obj as { rules?: unknown }).rules;
  return Array.isArray(rules) ? { rules: rules as ProposedRule[] } : null;
}

function coerceRule(r: ProposedRule): {
  kind: AgentRuleKind;
  ruleText: string;
  scope: AgentRuleScope;
  scopeKey: string | null;
} | null {
  const ruleText = typeof r.ruleText === "string" ? r.ruleText.trim() : "";
  if (!ruleText) return null;
  const kind = r.kind as AgentRuleKind;
  if (kind !== "do" && kind !== "dont" && kind !== "voice" && kind !== "schedule") return null;
  const scope = r.scope as AgentRuleScope;
  if (scope !== "global" && scope !== "domain" && scope !== "repo") return null;
  const scopeKey = typeof r.scopeKey === "string" && r.scopeKey.trim() ? r.scopeKey.trim() : null;
  return { kind, ruleText, scope, scopeKey };
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10;
}

/**
 * Stage 2 paraphrase dedupe against existing rules. Fetches learned + enabled
 * rules' text (the dedupe domain) and returns true when `newText` is a near-
 * duplicate of any of them by token Jaccard overlap. Best-effort: on any DB error
 * / no Supabase returns false (no paraphrase found → propose), so a DB blip can't
 * silently suppress a real rule. Capped at 200 existing rows.
 */
async function isParaphraseOfExisting(newText: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_agent_rules")
      .select("rule_text")
      .or("source.eq.learned,enabled.eq.true")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return false;
    const existing = (data as Array<{ rule_text?: unknown }>)
      .map((r) => (typeof r.rule_text === "string" ? r.rule_text : ""))
      .filter(Boolean);
    return isParaphraseOf(newText, existing);
  } catch {
    return false;
  }
}

/**
 * Pure token-overlap paraphrase detector. Returns true if `newText` is a near-
 * duplicate of ANY text in `existing`. Tokenizes on word boundaries (lowercased,
 * dropping 1-char tokens like "a"/"I" that add noise), then for each existing rule
 * computes both Jaccard (|A∩B| / |A∪B|) and containment (|A∩B| / min(|A|,|B|) — how
 * much of the smaller rule is shared with the larger) and flags when the max of
 * the two ≥ threshold. Containment catches the common case where a reworded rule
 * adds filler words ("between"/"and") that wreck Jaccard but the smaller rule is
 * still fully embedded in the larger (containment = 1.0).
 *
 * Short rules (< 4 tokens) are too generic to trust overlap metrics — require an
 * identical token set (Jaccard 1.0) so "use AI" isn't flagged as a paraphrase of
 * "use AI tools" (a different, more specific rule). Hermetic + dependency-free.
 */
export function isParaphraseOf(newText: string, existing: string[], threshold = 0.8): boolean {
  const newTokens = tokenize(newText);
  if (newTokens.length === 0) return false;
  const shortRule = newTokens.length < 4;
  const newSet = new Set(newTokens);
  for (const ex of existing) {
    const exTokens = tokenize(ex);
    if (exTokens.length === 0) continue;
    const exSet = new Set(exTokens);
    let inter = 0;
    for (const t of newSet) if (exSet.has(t)) inter++;
    const union = newSet.size + exSet.size - inter;
    if (union === 0) continue;
    const jaccard = inter / union;
    if (shortRule) {
      // Short rules: only flag on identical token sets (no containment shortcut,
      // which would flag any short rule embedded in a longer, different rule).
      if (jaccard >= 1.0) return true;
    } else {
      const containment = inter / Math.min(newSet.size, exSet.size);
      if (Math.max(jaccard, containment) >= threshold) return true;
    }
  }
  return false;
}

/** Lowercase word tokens (length ≥ 2, ignoring punctuation + 1-char noise). Pure + hermetic. */
function tokenize(s: string): string[] {
  const m = s.toLowerCase().match(/[a-z0-9]+/g);
  return (m ? Array.from(m) : []).filter((t) => t.length >= 2);
}