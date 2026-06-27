import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { monthlyBudgetUsd, monthSpentUsd, bustBudgetCache } from "../../lib/growth/model-router.js";

/**
 * /api/growth/budget — live monthly spend cap for the Growth Agent.
 *   GET  → { capUsd, spentUsd, projectedUsd, remainingUsd, source }
 *   PATCH { monthlyBudgetUsd: number (1..500) } → updates growth_settings,
 *        logs the change to growth_agent_logs, busts the budget cache so the
 *        next withinBudget() check picks it up immediately. Admin-only.
 */
const MIN_CAP = 1;
const MAX_CAP = 500;

const PatchBody = z.object({
  monthlyBudgetUsd: z.number().finite().min(MIN_CAP).max(MAX_CAP),
});

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function monthBlock() {
  const { cap, source } = await monthlyBudgetUsd();
  const spentUsd = await monthSpentUsd();
  const now = new Date();
  const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const projectedUsd = dayOfMonth > 0 ? round6((spentUsd / dayOfMonth) * dim) : round6(spentUsd);
  return { spentUsd: round6(spentUsd), capUsd: cap, projectedUsd, remainingUsd: round6(Math.max(0, cap - spentUsd)), source };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  if (req.method === "GET") {
    const admin = await requireAdmin(req);
    if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);
    return res.status(200).json({ ok: true, requestId, ...(await monthBlock()) });
  }

  if (req.method === "PATCH") {
    const admin = await requireAdmin(req);
    if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: `monthlyBudgetUsd must be a number between ${MIN_CAP} and ${MAX_CAP}`, requestId });
    }
    const newCap = round6(parsed.data.monthlyBudgetUsd);

    if (!supabaseAdmin) {
      return res.status(200).json({ ok: true, requestId, capUsd: newCap, source: "default", note: "Supabase not configured — change persisted to env to take effect." });
    }

    try {
      const before = await monthlyBudgetUsd();
      const { error } = await supabaseAdmin
        .from("growth_settings")
        .update({ monthly_budget_usd: newCap, updated_by: admin.userId })
        .eq("id", 1);
      if (error) {
        return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
      }
      bustBudgetCache();
      // Audit trail for the budget change. .then(onFulfilled,onRejected) — NOT
      // .catch (Postgrest builders are PromiseLike, .catch throws synchronously).
      await supabaseAdmin
        .from("growth_agent_logs")
        .insert({ level: "info", action: "budget-change", scope: admin.userId, detail: `$${before.cap} → $${newCap}` })
        .then(() => undefined, () => undefined);
      return res.status(200).json({ ok: true, requestId, capUsd: newCap, source: "db", ...(await monthBlock()) });
    } catch {
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Unexpected error", requestId });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}