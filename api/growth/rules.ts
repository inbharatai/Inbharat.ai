import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { bustRulesCache } from "../../lib/growth/rules.js";
import type { AgentRuleKind, AgentRuleScope } from "../../lib/growth/types.js";

/**
 * /api/growth/rules — founder-authored agent "memory" CRUD. Admin-only.
 *   GET    → { rules: [...] }                        (all rules, newest first)
 *   POST   { scope, scopeKey?, kind, ruleText, enabled? } → create
 *   PATCH  { id, patch }                            → update
 *   DELETE { id }                                   → delete
 *
 * Every write busts the rules cache (bustRulesCache) so the next promoter
 * draft picks up the change immediately, and is logged to growth_agent_logs.
 */
const SCOPE: AgentRuleScope[] = ["repo", "domain", "global"];
const KIND: AgentRuleKind[] = ["do", "dont", "voice", "schedule"];

const PostBody = z.object({
  scope: z.enum(SCOPE as [AgentRuleScope, ...AgentRuleScope[]]),
  scopeKey: z.string().max(120).nullish(),
  kind: z.enum(KIND as [AgentRuleKind, ...AgentRuleKind[]]),
  ruleText: z.string().min(1).max(2000),
  enabled: z.boolean().optional(),
});
const PatchBody = z.object({
  id: z.string().min(1),
  patch: z.object({
    scope: z.enum(SCOPE as [AgentRuleScope, ...AgentRuleScope[]]).optional(),
    scopeKey: z.string().max(120).nullish(),
    kind: z.enum(KIND as [AgentRuleKind, ...AgentRuleKind[]]).optional(),
    ruleText: z.string().min(1).max(2000).optional(),
    enabled: z.boolean().optional(),
  }),
});
const DeleteBody = z.object({ id: z.string().min(1) });

function toRow(p: { scope: AgentRuleScope; scopeKey?: string | null; kind: AgentRuleKind; ruleText: string; enabled?: boolean }) {
  return {
    scope: p.scope,
    scope_key: p.scope === "global" ? null : p.scopeKey ?? null,
    kind: p.kind,
    rule_text: p.ruleText,
    enabled: p.enabled ?? true,
  };
}

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
    if (!supabaseAdmin) return res.status(200).json({ ok: true, requestId, rules: [] });
    const { data, error } = await supabaseAdmin
      .from("growth_agent_rules")
      .select("id,scope,scope_key,kind,rule_text,enabled,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB read failed", requestId });
    const rules = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      scope: r.scope,
      scopeKey: r.scope_key,
      kind: r.kind,
      ruleText: r.rule_text,
      enabled: r.enabled,
    }));
    return res.status(200).json({ ok: true, requestId, rules });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured — rules require the DB.", requestId });
  }

  if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const row = toRow(parsed.data);
    const { data, error } = await supabaseAdmin.from("growth_agent_rules").insert(row).select("id").single();
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB insert failed", requestId });
    bustRulesCache();
    await audit(admin.userId, "rule-create", `${row.scope}:${row.kind}:${row.rule_text.slice(0, 80)}`);
    return res.status(201).json({ ok: true, requestId, id: data?.id });
  }

  if (req.method === "PATCH") {
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { id, patch } = parsed.data;
    const row: Record<string, unknown> = {};
    if (patch.scope !== undefined) { row.scope = patch.scope; row.scope_key = patch.scope === "global" ? null : patch.scopeKey ?? null; }
    if (patch.scopeKey !== undefined && patch.scope !== "global") row.scope_key = patch.scopeKey ?? null;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.ruleText !== undefined) row.rule_text = patch.ruleText;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (Object.keys(row).length === 0) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "No valid fields", requestId });
    const { error } = await supabaseAdmin.from("growth_agent_rules").update(row).eq("id", id);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
    bustRulesCache();
    await audit(admin.userId, "rule-update", `${id}: ${JSON.stringify(patch).slice(0, 120)}`);
    return res.status(200).json({ ok: true, requestId });
  }

  if (req.method === "DELETE") {
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { id } = parsed.data;
    const { error } = await supabaseAdmin.from("growth_agent_rules").delete().eq("id", id);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB delete failed", requestId });
    bustRulesCache();
    await audit(admin.userId, "rule-delete", id);
    return res.status(200).json({ ok: true, requestId });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}