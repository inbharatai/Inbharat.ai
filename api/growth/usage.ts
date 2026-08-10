import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { round6, spendBlock } from "../../lib/growth/spend.js";

/**
 * GET /api/growth/usage?days=30 — model spend + token usage, aggregated for the
 * admin dashboard ("which AI API is used where"). Admin-only. Returns:
 *   totals, byProvider (Gemini; legacy openai rows tolerated), byModel, byTask,
 *   byArticle (where used), byDay (sparkline), recent (last 20 calls),
 *   month (spent/cap/projected).
 * `?days=` defaults to 30, clamped to [1, 90]. Never returns secret values.
 */
const MAX_DAYS = 90;
const ROW_CAP = 5000;

interface Row {
  model: string | null;
  task: string | null;
  provider: string | null;
  context_url: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  status: string | null;
  created_at: string;
}

interface Bucket {
  key: string;
  calls: number;
  tokens: number;
  costUsd: number;
  provider?: string;
}

function bump(map: Map<string, Bucket>, key: string, tokens: number, cost: number, provider?: string) {
  const b = map.get(key) ?? { key, calls: 0, tokens: 0, costUsd: 0, provider };
  b.calls += 1;
  b.tokens += tokens;
  b.costUsd += cost;
  map.set(key, b);
}

/** Provider for a row. New rows are always "gemini"; legacy DB rows may contain
 *  "openai" (emitted before 2026-08-10) — those are bucketed as "openai (legacy)"
 *  in the byProvider breakdown so the UI can distinguish old data from new. */
function providerOf(r: Row): "gemini" | "openai (legacy)" | "unknown" {
  if (r.provider === "gemini") return "gemini";
  // Tolerate legacy openai rows (stored before the Gemini-only migration).
  if (r.provider === "openai") return "openai (legacy)";
  if (typeof r.model === "string" && /gemini/i.test(r.model)) return "gemini";
  // Any remaining openai-model-named rows are also legacy.
  if (typeof r.model === "string" && /gpt|o1|o3|openai/i.test(r.model)) return "openai (legacy)";
  return "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (!supabaseAdmin) {
    return res.status(200).json({ ok: true, requestId, configured: false, windowDays: 30, totals: emptyTotals(), byProvider: [], byModel: [], byTask: [], byArticle: [], byDay: [], recent: [], month: await monthBlock() });
  }

  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), MAX_DAYS) : 30;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const { data, error } = await supabaseAdmin
    .from("growth_model_usage")
    .select("model,task,provider,context_url,prompt_tokens,completion_tokens,total_tokens,cost_usd,status,created_at")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);
  if (error) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB query failed", requestId });
  }

  const rows = (data ?? []) as Row[];
  const totals = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, providers: new Set<string>(), models: new Set<string>() };
  const byProvider = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const byTask = new Map<string, Bucket>();
  const byArticle = new Map<string, Bucket>();
  const byDay = new Map<string, { day: string; calls: number; tokens: number; costUsd: number }>();

  for (const r of rows) {
    const cost = Number(r.cost_usd || 0);
    const tok = Number(r.total_tokens || 0);
    const provider = providerOf(r);
    totals.calls += 1;
    totals.promptTokens += Number(r.prompt_tokens || 0);
    totals.completionTokens += Number(r.completion_tokens || 0);
    totals.totalTokens += tok;
    totals.costUsd += cost;
    if (r.model) totals.models.add(r.model);
    if (provider !== "unknown") totals.providers.add(provider);

    bump(byProvider, provider, tok, cost);
    bump(byModel, r.model || "unknown", tok, cost, provider);
    bump(byTask, r.task || "unknown", tok, cost);
    bump(byArticle, r.context_url || "(system)", tok, cost);

    const day = (r.created_at || "").slice(0, 10);
    const d = byDay.get(day) ?? { day, calls: 0, tokens: 0, costUsd: 0 };
    d.calls += 1;
    d.tokens += tok;
    d.costUsd += cost;
    byDay.set(day, d);
  }

  const spend = totals.costUsd || 0;
  const ranked = (m: Map<string, Bucket>) =>
    [...m.values()]
      .map((b) => ({ ...b, pctSpend: spend > 0 ? Math.round((b.costUsd / spend) * 1000) / 10 : 0 }))
      .sort((a, b) => b.costUsd - a.costUsd);

  const recent = rows.slice(0, 20).map((r) => ({
    model: r.model,
    provider: providerOf(r),
    task: r.task,
    contextUrl: r.context_url,
    totalTokens: Number(r.total_tokens || 0),
    costUsd: Number(r.cost_usd || 0),
    status: r.status,
    createdAt: r.created_at,
  }));

  return res.status(200).json({
    ok: true,
    requestId,
    configured: true,
    windowDays: days,
    totals: {
      calls: totals.calls,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      costUsd: round6(totals.costUsd),
      providers: totals.providers.size,
      models: totals.models.size,
    },
    byProvider: ranked(byProvider),
    byModel: ranked(byModel),
    byTask: ranked(byTask),
    byArticle: ranked(byArticle),
    byDay: [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    recent,
    month: await monthBlock(),
  });
}

function emptyTotals() {
  return { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, providers: 0, models: 0 };
}

/** Current-month spend vs the live budget cap + a linear projection to month-end.
 *  Thin wrapper over the shared lib/growth/spend.ts so usage/insights/budget
 *  can't drift apart on the projection formula. */
async function monthBlock() {
  return spendBlock();
}