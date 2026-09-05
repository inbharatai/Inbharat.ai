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

/** A non-global rule with no scopeKey is unreachable (loadRulesFor filters by
 *  scope_key for domain/repo). Reject it at the API so a curl POST can't insert
 *  a dead row the UI would have blocked. */
function validateScopeKey(scope: AgentRuleScope, scopeKey: string | null | undefined): string | true {
  if (scope !== "global" && !scopeKey) return "scopeKey is required for domain/repo scopes";
  return true;
}

async function audit(userId: string, action: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  // Postgrest builders are PromiseLike (.then) but NOT Promises — .catch throws
  // synchronously; use .then(onFulfilled, onRejected) for the best-effort swallow.
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope: userId, detail })
    .then(() => undefined, () => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    if (!supabaseAdmin) return res.status(200).json({ ok: true, requestId, rules: [] });
    const { data, error } = await supabaseAdmin
      .from("growth_agent_rules")
      .select("id,scope,scope_key,kind,rule_text,enabled,source,evidence,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB read failed", requestId });
    const rules = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      scope: r.scope,
      scopeKey: r.scope_key,
      kind: r.kind,
      ruleText: r.rule_text,
      enabled: r.enabled,
      source: r.source ?? "founder",
      evidence: r.evidence ?? null,
    }));
    return res.status(200).json({ ok: true, requestId, rules });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured — rules require the DB.", requestId });
  }

  if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const input = { ...parsed.data, scope: parsed.data.scope!, kind: parsed.data.kind!, ruleText: parsed.data.ruleText! };
    const scopeCheck = validateScopeKey(input.scope, input.scopeKey);
    if (scopeCheck !== true) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: scopeCheck, requestId });
    const row = toRow(input);
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
    // Resolve the EFFECTIVE scope before touching scope_key. When patch.scope is
    // undefined, the existing row's scope is what's in effect — and the old guard
    // (`patch.scope !== "global"`) was true for undefined, so a PATCH of scopeKey
    // alone onto a GLOBAL rule silently wrote scope_key onto it. Fetch the stored
    // scope when needed so the guard sees the real effective scope.
    let effectiveScope: AgentRuleScope | undefined = patch.scope;
    if (patch.scopeKey !== undefined && effectiveScope === undefined && supabaseAdmin) {
      const { data: existing } = await supabaseAdmin.from("growth_agent_rules").select("scope").eq("id", id).maybeSingle();
      effectiveScope = (existing?.scope as AgentRuleScope | undefined) ?? undefined;
    }
    const row: Record<string, unknown> = {};
    if (patch.scope !== undefined) { row.scope = patch.scope; row.scope_key = patch.scope === "global" ? null : patch.scopeKey ?? null; }
    // Only apply a standalone scopeKey patch when the effective scope is non-global
    // (patch.scope explicit OR the existing row's scope). A global rule gets its
    // scope_key cleared only via an explicit scope:"global" patch above.
    if (patch.scopeKey !== undefined && effectiveScope && effectiveScope !== "global") row.scope_key = patch.scopeKey ?? null;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.ruleText !== undefined) row.rule_text = patch.ruleText;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (Object.keys(row).length === 0) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "No valid fields", requestId });
    // Validate the RESULTING rule won't be a dead non-global row with no scopeKey.
    // The resulting scope is the explicitly-patched scope (row.scope) OR the
    // existing row's scope (effectiveScope, fetched above when scopeKey is
    // patched without scope). When that's non-global AND the resulting
    // scope_key is null/undefined, the row is unreachable — loadRulesFor
    // filters by scope_key for domain/repo, so it would never match. This
    // covers BOTH the scopeKey-clearing case AND the explicit-scope-without-
    // scopeKey case (PATCH {scope:"domain"} with no scopeKey). The POST guard
    // at line 100 already rejects the latter on create; the old PATCH guard's
    // trailing `&& patch.scope === undefined` let it through on update — closed.
    const resultingScope = (row.scope as AgentRuleScope | undefined) ?? effectiveScope;
    if (resultingScope && resultingScope !== "global" && (row.scope_key === undefined || row.scope_key === null)) {
      return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "scopeKey is required for domain/repo scopes", requestId });
    }
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