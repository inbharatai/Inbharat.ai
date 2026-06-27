import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { loadOutcomes, bustOutcomesCache } from "../../lib/growth/outcomes.js";

/**
 * /api/growth/outcomes — the learning signal surface. Admin-only.
 *   GET  → { outcomes:[...], proposed:[...] }
 *        outcomes   = growth_outcomes joined to growth_drafts (title + critique
 *                     status) with computed SEO/GEO deltas.
 *        proposed   = growth_agent_rules where source='learned' AND enabled=false
 *                     (rules the weekly distill pass proposed for founder approval).
 *   POST { draftId, impressions?, reactions?, comments? }
 *        → founder-entered LinkedIn engagement for a published draft's outcome.
 *
 * No-DB → GET returns empty arrays; POST returns 503. Never publishes.
 */
const PostBody = z.object({
  draftId: z.string().min(1).max(120),
  impressions: z.number().int().min(0).optional(),
  reactions: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
});

async function audit(userId: string, action: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope: userId, detail })
    .catch(() => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    const outcomes = await loadOutcomes();
    let proposed: { id: string; scope: string; scopeKey: string | null; kind: string; ruleText: string; evidence: unknown; createdAt: string }[] = [];
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from("growth_agent_rules")
          .select("id,scope,scope_key,kind,rule_text,evidence,created_at")
          .eq("source", "learned")
          .eq("enabled", false)
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) {
          proposed = (data as Record<string, unknown>[]).map((r) => ({
            id: r.id as string,
            scope: r.scope as string,
            scopeKey: (r.scope_key as string | null) ?? null,
            kind: r.kind as string,
            ruleText: r.rule_text as string,
            evidence: r.evidence ?? null,
            createdAt: r.created_at as string,
          }));
        }
      } catch {
        proposed = [];
      }
    }
    return res.status(200).json({ ok: true, requestId, outcomes, proposed });
  }

  if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    if (!supabaseAdmin) {
      return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
    }
    const { draftId, impressions, reactions, comments } = parsed.data;
    const { data: existing, error: qErr } = await supabaseAdmin
      .from("growth_outcomes")
      .select("id,linkedin_engagement")
      .eq("draft_id", draftId)
      .limit(1)
      .maybeSingle();
    if (qErr || !existing) {
      return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "no outcome row for that draft (publish first)", requestId });
    }
    const prev = (existing.linkedin_engagement ?? null) as Record<string, unknown> | null;
    const engagement = {
      ...(prev ?? {}),
      impressions: impressions ?? prev?.impressions ?? null,
      reactions: reactions ?? prev?.reactions ?? null,
      comments: comments ?? prev?.comments ?? null,
      enteredAt: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin
      .from("growth_outcomes")
      .update({ linkedin_engagement: engagement, linkedin_entered_at: new Date().toISOString() })
      .eq("draft_id", draftId);
    if (upErr) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
    bustOutcomesCache();
    await audit(admin.userId, "outcome-linkedin", draftId, JSON.stringify(engagement));
    return res.status(200).json({ ok: true, requestId });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}