/**
 * InBharat Growth Agent — Module: CMO Strategy layer (Phase D).
 *
 * The founder's positioning / ICP / audience / voice / competitive-diff lives in a
 * singleton `growth_strategy` row (id=1), written by the founder OR drafted by the
 * 'strategy' model task from recent measured outcomes + critique learnings. The
 * block is injected into the promoter / inbox / critique / agent system prompts so
 * every draft is on-brand — this is what makes the agent an expert CMO, not a
 * generic copy drafter.
 *
 * Mirrors the rules.ts loader/formatter/cache pattern. Cached with
 * bustStrategyCache() after an admin edit (next load re-reads the DB). Returns an
 * all-empty Strategy when the DB / table is absent (pre-migration) — the formatter
 * then returns "" so the prompt is unchanged. Never throws.
 *
 * Server-only. Gemini-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini } from "./gemini.js";

export interface Strategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
}

interface StrategyRow {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitive_diff: string | null;
  goals: string | null;
}

const EMPTY: Strategy = {
  positioning: null,
  icp: null,
  audience: null,
  voice: null,
  competitiveDiff: null,
  goals: null,
};

let strategyCache: Strategy | null = null;

/** Invalidate the strategy cache after an admin edit (next load re-reads the DB). */
export function bustStrategyCache(): void {
  strategyCache = null;
}

/** Load the founder's strategy singleton. Returns the cached value on repeat
 *  calls in the same process; callers bust the cache after an edit. Never throws;
 *  returns all-null when the DB / table is absent (pre-migration). */
export async function loadStrategy(): Promise<Strategy> {
  if (strategyCache) return strategyCache;
  if (!supabaseAdmin) {
    strategyCache = EMPTY;
    return EMPTY;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_strategy")
      .select("positioning,icp,audience,voice,competitive_diff,goals")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      strategyCache = EMPTY;
      return EMPTY;
    }
    const r = data as StrategyRow;
    strategyCache = {
      positioning: r.positioning ?? null,
      icp: r.icp ?? null,
      audience: r.audience ?? null,
      voice: r.voice ?? null,
      competitiveDiff: r.competitive_diff ?? null,
      goals: r.goals ?? null,
    };
    return strategyCache;
  } catch {
    strategyCache = EMPTY;
    return EMPTY;
  }
}

const LABELS: { key: keyof Strategy; label: string }[] = [
  { key: "positioning", label: "POSITIONING" },
  { key: "icp", label: "ICP (ideal customer profile)" },
  { key: "audience", label: "AUDIENCE (content readers)" },
  { key: "voice", label: "VOICE / TONE" },
  { key: "competitiveDiff", label: "COMPETITIVE DIFFERENCE" },
  { key: "goals", label: "GTM GOALS" },
];

/**
 * Format the strategy into a system-prompt block. Returns "" when every field is
 * empty, so the prompt is unchanged when the founder hasn't set a strategy yet
 * (mirrors formatRulesBlock).
 */
export function formatStrategyBlock(strategy: Strategy): string {
  const sections = LABELS.map(({ key, label }) => {
    const v = strategy[key];
    return typeof v === "string" && v.trim() ? `${label}:\n${v.trim()}` : null;
  }).filter(Boolean);
  if (sections.length === 0) return "";
  return `STRATEGY (founder-authored positioning — obey; keep every draft on-brand and on-audience):\n${sections.join("\n\n")}`;
}

export interface DraftedStrategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
  note?: string;
}

/**
 * Draft a strategy from recent measured outcomes + critique learnings (the
 * "Generate draft from recent learnings" action). The 'strategy' task (Gemini
 * gemini-2.5-flash) synthesizes positioning/ICP/voice from the evidence. The
 * founder reviews + edits the result before saving — nothing is auto-applied.
 * Never throws; returns {note} on any failure (model unconfigured / budget /
 * redacted / parse). `evidence` is a pre-built compact string of recent deltas.
 */
export async function draftStrategyFromEvidence(evidence: string): Promise<DraftedStrategy> {
  const task: GrowthTask = "strategy";
  const choice = pickModel(task);
  const empty = (note: string): DraftedStrategy => ({
    positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null, note,
  });
  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return empty("strategy model not configured or monthly budget exhausted");
  }

  const system =
    "You are a B2B GTM strategist drafting a content strategy for InBharat AI, an Indian AI product studio. " +
    "Synthesize positioning, ICP, audience, voice, competitive difference, and near-term goals from the evidence. " +
    "Be concrete, hype-free, and specific to InBharat (Indian AI infra + agent products). " +
    "Respond ONLY with compact JSON: " +
    "{\"positioning\": string, \"icp\": string, \"audience\": string, \"voice\": string, \"competitiveDiff\": string, \"goals\": string}.";
  const user =
    `EVIDENCE (recent measured content outcomes + critique learnings):\n${evidence.slice(0, 4000)}\n\n` +
    `Draft the six strategy fields. Each is a short paragraph (1–3 sentences). JSON only.`;

  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return empty("redacted secret in strategy prompt; aborted model call");
  }

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.5, maxOutputTokens: 900 });
  } catch (e) {
    void logUsage({
      model: choice.model, task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: 0,
      totalTokens: Math.ceil((system.length + user.length) / 4),
      costUsd: 0, status: "model_error", contextUrl: null, provider: choice.provider,
    });
    return empty(`strategy model call failed: ${(e as Error).message}`);
  }

  const parsed = safeParseStrategy(raw);
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  const costUsd = estimateCost(choice, totalTokens);
  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd,
    status: parsed ? "ok" : "parse_failed",
    contextUrl: null, provider: choice.provider,
  });
  if (!parsed) return empty("strategy model returned no usable JSON; nothing drafted");
  return parsed;
}

function safeParseStrategy(raw: string): DraftedStrategy | null {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const s = (k: string): string | null => {
    const v = obj?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const drafted: DraftedStrategy = {
    positioning: s("positioning"),
    icp: s("icp"),
    audience: s("audience"),
    voice: s("voice"),
    competitiveDiff: s("competitiveDiff"),
    goals: s("goals"),
  };
  // Require at least one non-empty field, else treat as empty.
  if (!Object.values(drafted).some((v) => typeof v === "string" && v.length > 0)) return null;
  return drafted;
}

/**
 * Build the compact evidence string from recent measured outcomes for the
 * strategy-draft model call: which articles moved SEO/GEO, recurring critique
 * weaknesses. Never throws; returns "" when there's no recent evidence.
 */
export async function gatherStrategyEvidence(): Promise<string> {
  if (!supabaseAdmin) return "";
  try {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("growth_outcomes")
      .select("url,kind,baseline_seo,measured_seo,baseline_geo,measured_geo")
      .not("measured_seo", "is", null)
      .gte("measured_at", since)
      .order("measured_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data) || data.length === 0) return "";
    const lines = (data as Array<{ url: string; kind: string; baseline_seo: number | null; measured_seo: number | null; baseline_geo: number | null; measured_geo: number | null }>).map((o) => {
      const dSeo = (o.measured_seo ?? 0) - (o.baseline_seo ?? 0);
      const dGeo = (o.measured_geo ?? 0) - (o.baseline_geo ?? 0);
      return `- ${o.url} (${o.kind}): SEO ${o.baseline_seo ?? "?"}→${o.measured_seo ?? "?"} (${dSeo >= 0 ? "+" : ""}${dSeo}), GEO ${dGeo >= 0 ? "+" : ""}${dGeo}`;
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}