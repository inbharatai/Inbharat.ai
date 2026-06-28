/**
 * InBharat Growth Agent — Module 15: Model Router.
 *
 * IMPORTANT: this is COMPLETELY SEPARATE from the chat backend's
 * api/lib/serverLLM.ts. The Growth Agent is Gemini-ONLY (2026-06-27) — it uses
 * GEMINI_API_KEY for every task, never the chat path, so the chat model
 * selection and budget are untouched. The openai branch in isModelConfigured /
 * DEFAULTS survives only as a GROWTH_<TASK>_PROVIDER=openai escape hatch; no
 * call site uses it by default.
 *
 * Phase 1 audits are deterministic and do NOT call this. It is wired for
 * Phase 5 (content drafting + critique + learning + covers) with a monthly
 * budget cap and usage logging to growth_model_usage.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import type { ModelUsageRecord } from "./types.js";

/**
 * Growth Agent is Gemini-only. Models are PINNED to stable IDs (verified via
 * direct API calls 2026-06-27) rather than the `-latest` aliases, which silently
 * resolve to whatever Google currently ships (they pointed at gemini-3.x the
 * day this was written) — a silent swap could change quality/cost/behavior with
 * no code change. Override any task with GROWTH_<TASK>_MODEL /
 * GROWTH_<TASK>_PROVIDER env vars (no redeploy needed for the founder).
 */
export type GrowthTask = "audit" | "metadata" | "summary" | "draft" | "review" | "cover" | "strategy" | "chat" | "vision" | "article";

export interface ModelChoice {
  provider: "openai" | "gemini";
  model: string;
  /** Approx USD per 1M tokens (input+output blended for cap math). */
  usdPer1k: number;
}

const DEFAULTS: Record<GrowthTask, ModelChoice> = {
  audit: { provider: "gemini", model: "gemini-2.5-flash-lite", usdPer1k: 0.00005 },
  metadata: { provider: "gemini", model: "gemini-2.5-flash-lite", usdPer1k: 0.00005 },
  summary: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  draft: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  review: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  // Image generation — the ONLY Gemini model that can output images. Text
  // models (gemini-2.5-flash/-lite) return finishReason NO_IMAGE / no inlineData.
  cover: { provider: "gemini", model: "gemini-2.5-flash-image", usdPer1k: 0.1 },
  // Strategy drafting (Phase D): synthesize positioning/ICP/voice from recent
  // learnings + outcomes. Flash is plenty; the founder reviews + edits the result.
  strategy: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  // Conversational agent turn (Phase C): the CMO persona chat with tool-calling.
  // Flash is multimodal + supports function-calling; cheap enough for a chat loop.
  chat: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  // On-command image/video analysis (Phase C4): the founder drops an image and says
  // "analyze this"; gemini-2.5-flash is multimodal (accepts inlineData image parts).
  vision: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
  // Long-form article drafting (Phase E): a full founder-authored-style article
  // body + meta. Flash handles it; higher token budget than a caption draft.
  article: { provider: "gemini", model: "gemini-2.5-flash", usdPer1k: 0.00015 },
};

export function pickModel(task: GrowthTask): ModelChoice {
  const base = DEFAULTS[task];
  const provider = (process.env[`GROWTH_${task.toUpperCase()}_PROVIDER`] as "openai" | "gemini" | undefined) || base.provider;
  const model = process.env[`GROWTH_${task.toUpperCase()}_MODEL`] || base.model;
  return { ...base, provider, model };
}

export function isModelConfigured(choice: ModelChoice): boolean {
  // Growth Agent must use its OWN key path — never the chat backend's
  // OPENAI_API_KEY (would conflate spend + violate isolation). Only
  // GROWTH_OPENAI_API_KEY is accepted for growth tasks.
  if (choice.provider === "openai") return !!process.env.GROWTH_OPENAI_API_KEY;
  return !!process.env.GEMINI_API_KEY;
}

/** Monthly budget cap in USD. Reads the live value from growth_settings
 *  (so the admin UI can change it without a redeploy), falling back to the
 *  GROWTH_MONTHLY_BUDGET_USD env var, then 20. Cached for the current calendar
 *  month; call bustBudgetCache() after an admin edit so the next check re-reads.
 *  Returns the cap + where it came from (db|env|default) for the dashboard. */
let budgetCache: { month: string; cap: number; source: "db" | "env" | "default" } | null = null;

export async function monthlyBudgetUsd(): Promise<{ cap: number; source: "db" | "env" | "default" }> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (budgetCache && budgetCache.month === month) return { cap: budgetCache.cap, source: budgetCache.source };
  const envVal = Number(process.env.GROWTH_MONTHLY_BUDGET_USD);
  const envCap = Number.isFinite(envVal) && envVal > 0 ? envVal : 20;
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("growth_settings")
        .select("monthly_budget_usd")
        .eq("id", 1)
        .maybeSingle();
      if (!error && data && Number.isFinite(Number(data.monthly_budget_usd))) {
        budgetCache = { month, cap: Number(data.monthly_budget_usd), source: "db" };
        return { cap: budgetCache.cap, source: "db" };
      }
    } catch {
      // fall through to env/default
    }
  }
  budgetCache = { month, cap: envCap, source: Number.isFinite(envVal) && envVal > 0 ? "env" : "default" };
  return { cap: envCap, source: budgetCache.source };
}

/** Invalidate the cached budget cap after an admin edit (next withinBudget re-reads). */
export function bustBudgetCache(): void {
  budgetCache = null;
}

let monthSpentCache: { month: string; spent: number; queryOk: boolean } | null = null;

/** Best-effort row to growth_agent_logs for errors that must NOT be swallowed
 *  (spend-query failures, usage-insert failures). Last-resort: silent. */
async function logErrorRow(action: string, scope: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("growth_agent_logs").insert({ level: "error", action, scope, detail });
  } catch {
    // nothing more we can do
  }
}

/** Query the month's spend + whether the query itself succeeded. Errors are
 *  NOT cached (so the next call retries) and are surfaced to growth_agent_logs
 *  so a broken spend table is visible in the admin audit log instead of being
 *  silently read as $0 (which used to make withinBudget fail-open forever). */
export async function monthSpendState(): Promise<{ spent: number; queryOk: boolean }> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (monthSpentCache && monthSpentCache.month === month) {
    return { spent: monthSpentCache.spent, queryOk: monthSpentCache.queryOk };
  }
  if (!supabaseAdmin) {
    monthSpentCache = { month, spent: 0, queryOk: true };
    return { spent: 0, queryOk: true };
  }
  try {
    const start = `${month}-01T00:00:00Z`;
    const { data, error } = await supabaseAdmin
      .from("growth_model_usage")
      .select("cost_usd")
      .gte("created_at", start);
    if (error) throw error;
    const spent = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    monthSpentCache = { month, spent, queryOk: true };
    return { spent, queryOk: true };
  } catch {
    // Fail-OPEN for DISPLAY (show $0, not a runaway number) but signal
    // queryOk:false so withinBudget fails CLOSED. Don't cache → next call
    // retries; surface so the founder sees it in the audit log.
    await logErrorRow("spend-query-fail", "global", "monthSpendState query failed; withinBudget fail-closed until it recovers");
    return { spent: 0, queryOk: false };
  }
}

/** Sum cost_usd for the current calendar month (for the budget UI display).
 *  Returns 0 when the query fails — call monthSpendState() if you need to know
 *  whether the 0 is real or a query failure. */
export async function monthSpentUsd(): Promise<number> {
  return (await monthSpendState()).spent;
}

/** True ONLY when spend is measurable AND under the cap. FAIL-CLOSED: when the
 *  spend query fails we block new model spend (callers degrade gracefully to
 *  'skipped') rather than the old fail-open behavior that returned true on
 *  error → unbounded spend. The real safeguard against the silent budget-cap
 *  break (empty growth_model_usage → withinBudget always true). */
export async function withinBudget(): Promise<boolean> {
  const { cap } = await monthlyBudgetUsd();
  const { spent, queryOk } = await monthSpendState();
  return queryOk && spent < cap;
}

/** Record a usage row (best-effort). Maps the camelCase ModelUsageRecord to the
 *  snake_case growth_model_usage columns — a mismatch here silently breaks the
 *  monthly budget cap (inserts 400, get swallowed, table stays empty, withinBudget
 *  always true → unbounded spend), so surface the error to growth_agent_logs
 *  instead of only console.warn (which nobody reads in serverless). */
export async function logUsage(rec: ModelUsageRecord): Promise<void> {
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("growth_model_usage").insert({
        model: rec.model,
        task: rec.task,
        prompt_tokens: rec.promptTokens,
        completion_tokens: rec.completionTokens,
        total_tokens: rec.totalTokens,
        cost_usd: rec.costUsd,
        status: rec.status,
        context_url: rec.contextUrl ?? null,
        provider: rec.provider ?? null,
      });
      // Bust the spend cache so the next withinBudget() re-reads spend INCLUDING
      // this row. Without this, a long cron run that starts just under the cap
      // could draft several more items (covers ~$0.04 each) past the cap before the
      // stale cache catches up — a soft budget bypass. Cheap (one extra query per
      // draft) and removes the window.
      monthSpentCache = null;
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[growth-model-usage] insert failed:", (e as Error).message);
      await logErrorRow("model-usage-insert-fail", "global", `${rec.task}/${rec.model}: ${(e as Error).message}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.info("[growth-model-usage]", JSON.stringify(rec));
  }
}

/** Estimate cost from token counts. usdPer1k is USD per 1k tokens. */
export function estimateCost(choice: ModelChoice, totalTokens: number): number {
  return Math.round((totalTokens / 1000) * choice.usdPer1k * 1_000_000) / 1_000_000;
}

/** Flat per-image cost estimate for the cover task (image generation is billed
 *  per image, not per token, so token-based estimateCost does not apply). Rough
 *  — the real guard against runaway cover spend is the monthly cap. */
export function estimateCoverCost(perImageUsd = 0.04): number {
  return Math.round(perImageUsd * 1_000_000) / 1_000_000;
}