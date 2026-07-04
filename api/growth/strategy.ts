import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { loadStrategy, bustStrategyCache, draftStrategyFromEvidence, gatherStrategyEvidence } from "../../lib/growth/strategy.js";

/**
 * /api/growth/strategy — founder CMO strategy (Phase D). Admin-only.
 *   GET                  → { strategy: { positioning, icp, audience, voice, competitiveDiff, goals } }
 *   POST  { ...fields }  → upsert the singleton (id=1); bust cache; audit.
 *   POST  ?action=draft  → draft a strategy from recent measured outcomes + learnings
 *                          (does NOT save — the founder reviews + edits + saves).
 *
 * Every save busts the strategy cache so the next draft picks up the change, and
 * is logged to growth_agent_logs. Never auto-applies a drafted strategy.
 */
const FIELDS = {
  positioning: z.string().max(4000).nullish(),
  icp: z.string().max(4000).nullish(),
  audience: z.string().max(4000).nullish(),
  voice: z.string().max(4000).nullish(),
  competitiveDiff: z.string().max(4000).nullish(),
  goals: z.string().max(4000).nullish(),
  // Structured system layer (Phase C expansion). Larger cap — these are
  // multi-line blocks (pillars, per-product plan, cadence, KPIs).
  pillars: z.string().max(8000).nullish(),
  productPlan: z.string().max(8000).nullish(),
  cadence: z.string().max(8000).nullish(),
  kpis: z.string().max(8000).nullish(),
} as const;

const SaveBody = z.object(FIELDS);

function toRow(p: z.infer<typeof SaveBody>) {
  return {
    positioning: p.positioning ?? null,
    icp: p.icp ?? null,
    audience: p.audience ?? null,
    voice: p.voice ?? null,
    competitive_diff: p.competitiveDiff ?? null,
    goals: p.goals ?? null,
    pillars: p.pillars ?? null,
    product_plan: p.productPlan ?? null,
    cadence: p.cadence ?? null,
    kpis: p.kpis ?? null,
    updated_by: "admin",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    const s = await loadStrategy();
    return res.status(200).json({ ok: true, requestId, strategy: s });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  if (req.query?.action === "draft") {
    // Draft a strategy from recent evidence — NOT saved. Founder reviews + edits.
    const evidence = await gatherStrategyEvidence();
    if (!evidence) {
      return res.status(200).json({ ok: true, requestId, drafted: null, note: "no recent measured outcomes yet — publish a few drafts first so the agent has evidence to synthesize from" });
    }
    const drafted = await draftStrategyFromEvidence(evidence);
    return res.status(200).json({ ok: true, requestId, drafted, note: drafted.note ?? "drafted from recent learnings — review, edit, then Save to apply" });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured — strategy requires the DB.", requestId });
  }

  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
  const row = toRow(parsed.data);
  // Upsert the singleton (id=1). The table seeds id=1 on migration; upsert covers
  // pre-migration-but-table-exists and re-saves alike.
  const { error } = await supabaseAdmin.from("growth_strategy").upsert({ id: 1, ...row }).eq("id", 1);
  if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `DB upsert failed: ${error.message}`, requestId });
  bustStrategyCache();
  // .then(onFulfilled,onRejected) — NOT .catch (Postgrest builders are
  // PromiseLike, .catch throws synchronously after a successful upsert).
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action: "strategy-save", scope: admin.userId, detail: `strategy saved (${Object.entries(row).filter(([, v]) => v).length} fields)` })
    .then(() => undefined, () => undefined);
  return res.status(200).json({ ok: true, requestId, strategy: await loadStrategy() });
}