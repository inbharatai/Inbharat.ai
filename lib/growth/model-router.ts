/**
 * InBharat Growth Agent — Module 15: Model Router (scaffold).
 *
 * IMPORTANT: this is COMPLETELY SEPARATE from the chat backend's
 * api/lib/serverLLM.ts. It uses GROWTH_OPENAI_API_KEY (falling back to
 * OPENAI_API_KEY) and GEMINI_API_KEY — never the chat path — so the chat
 * model selection and budget are untouched.
 *
 * Phase 1 audits are deterministic and do NOT call this. It is wired for
 * Phase 5 (content drafting) with a monthly budget cap and usage logging
 * to growth_model_usage.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import type { ModelUsageRecord } from "./types.js";

export type GrowthTask = "audit" | "metadata" | "summary" | "draft" | "review";

interface ModelChoice {
  provider: "openai" | "gemini";
  model: string;
  /** Approx USD per 1M tokens (input+output blended for cap math). */
  usdPer1k: number;
}

const DEFAULTS: Record<GrowthTask, ModelChoice> = {
  audit: { provider: "gemini", model: "gemini-flash-lite-latest", usdPer1k: 0.00005 },
  metadata: { provider: "gemini", model: "gemini-flash-lite-latest", usdPer1k: 0.00005 },
  summary: { provider: "gemini", model: "gemini-flash-latest", usdPer1k: 0.00015 },
  draft: { provider: "gemini", model: "gemini-flash-latest", usdPer1k: 0.00015 },
  review: { provider: "openai", model: "gpt-4.1-mini", usdPer1k: 0.0005 },
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

let monthSpentCache: { month: string; spent: number } | null = null;

/** Sum cost_usd for the current calendar month from growth_model_usage (falls back to 0). */
export async function monthSpentUsd(): Promise<number> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (monthSpentCache && monthSpentCache.month === month) return monthSpentCache.spent;
  if (!supabaseAdmin) { monthSpentCache = { month, spent: 0 }; return 0; }
  try {
    const start = `${month}-01T00:00:00Z`;
    const { data, error } = await supabaseAdmin
      .from("growth_model_usage")
      .select("cost_usd")
      .gte("created_at", start);
    if (error) { monthSpentCache = { month, spent: 0 }; return 0; }
    const spent = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    monthSpentCache = { month, spent };
    return spent;
  } catch {
    monthSpentCache = { month, spent: 0 };
    return 0;
  }
}

export async function withinBudget(): Promise<boolean> {
  const { cap } = await monthlyBudgetUsd();
  return (await monthSpentUsd()) < cap;
}

/** Record a usage row (best-effort). Maps the camelCase ModelUsageRecord to the
 *  snake_case growth_model_usage columns — a mismatch here silently breaks the
 *  monthly budget cap (inserts 400, get swallowed, table stays empty, withinBudget
 *  always true → unbounded spend), so surface the error instead of swallowing. */
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
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[growth-model-usage] insert failed:", (e as Error).message);
    }
  }
  // eslint-disable-next-line no-console
  console.info("[growth-model-usage]", JSON.stringify(rec));
}

/** Estimate cost from token counts. usdPer1k is USD per 1k tokens. */
export function estimateCost(choice: ModelChoice, totalTokens: number): number {
  return Math.round((totalTokens / 1000) * choice.usdPer1k * 1_000_000) / 1_000_000;
}