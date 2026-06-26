/**
 * InBharat Growth Agent — Module: Agent Rules (founder "memory").
 *
 * Loads founder-authored do/dont/voice/schedule rules from growth_agent_rules
 * and formats them into a block appended to the promoter's system prompt, so
 * the agent accumulates and applies the founder's standing instructions.
 *
 * Cached per (scope, key) with bustRulesCache() after an admin edit (pattern =
 * model-router.ts:53-82 budget cache). Returns [] when the DB is absent or the
 * growth_agent_rules table doesn't exist yet (pre-migration) — the promoter
 * then drafts with no rules block, never throwing.
 *
 * Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { normalizeDomain } from "./authorization.js";
import type { AgentRule, AgentRuleKind } from "./types.js";

/** Row shape from growth_agent_rules (snake_case). */
interface RuleRow {
  id: string;
  scope: "repo" | "domain" | "global";
  scope_key: string | null;
  kind: AgentRuleKind;
  rule_text: string;
  enabled: boolean;
}

function mapRuleRow(r: RuleRow): AgentRule {
  return {
    id: r.id,
    scope: r.scope,
    scopeKey: r.scope_key,
    kind: r.kind,
    ruleText: r.rule_text,
    enabled: r.enabled,
  };
}

type CacheKey = "global" | `domain:${string}` | `repo:${string}`;
let rulesCache: Map<CacheKey, AgentRule[]> | null = null;

/** Invalidate the rules cache after an admin edit (next load re-reads the DB). */
export function bustRulesCache(): void {
  rulesCache = null;
}

async function loadRulesFor(key: CacheKey, scope: "global" | "domain" | "repo", scopeKey: string | null): Promise<AgentRule[]> {
  if (rulesCache?.has(key)) return rulesCache.get(key)!;
  const out: AgentRule[] = [];
  if (supabaseAdmin) {
    try {
      // Global rules always apply. For domain/repo scopes, also pull the
      // matching scope_key. Two clean queries (avoids PostgREST dotted-value
      // or-filter edge cases with domains like "inbharat.ai").
      const cols = "id,scope,scope_key,kind,rule_text,enabled" as const;
      const globalQ = supabaseAdmin.from("growth_agent_rules").select(cols).eq("enabled", true).eq("scope", "global");
      const scopedQ =
        scope === "global"
          ? null
          : supabaseAdmin
              .from("growth_agent_rules")
              .select(cols)
              .eq("enabled", true)
              .eq("scope", scope)
              .eq("scope_key", scopeKey ?? "");
      const [gRes, sRes] = await Promise.all([globalQ, scopedQ]);
      const seen = new Set<string>();
      for (const r of [...((gRes.data as RuleRow[] | null) ?? []), ...((sRes?.data as RuleRow[] | null) ?? [])]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(mapRuleRow(r));
      }
    } catch {
      // pre-migration / DB absent → no rules (promoter drafts without a block)
    }
  }
  if (!rulesCache) rulesCache = new Map();
  rulesCache.set(key, out);
  return out;
}

/** Rules that apply when promoting an article at a URL: global + the URL's domain. */
export async function loadRulesForUrl(url: string): Promise<AgentRule[]> {
  const domain = normalizeDomain(url);
  return loadRulesFor(`domain:${domain}`, "domain", domain);
}

/** Rules that apply when reading/PR-ing a repo: global + the repo slug. */
export async function loadRulesForRepo(repoSlug: string): Promise<AgentRule[]> {
  return loadRulesFor(`repo:${repoSlug}`, "repo", repoSlug);
}

const KIND_LABEL: Record<AgentRuleKind, string> = {
  do: "DO",
  dont: "DON'T",
  voice: "VOICE",
  schedule: "SCHEDULE",
};
const KIND_ORDER: AgentRuleKind[] = ["dont", "do", "voice", "schedule"];

/**
 * Format rules into a system-prompt block. Returns "" when there are no rules,
 * so the promoter's prompt is unchanged when the agent has no memory yet.
 */
export function formatRulesBlock(rules: AgentRule[]): string {
  if (rules.length === 0) return "";
  const byKind = new Map<AgentRuleKind, string[]>();
  for (const r of rules) {
    const list = byKind.get(r.kind) ?? [];
    list.push(`- ${r.ruleText}`);
    byKind.set(r.kind, list);
  }
  const sections = KIND_ORDER
    .filter((k) => byKind.has(k))
    .map((k) => `${KIND_LABEL[k]}:\n${byKind.get(k)!.join("\n")}`);
  return `RULES (founder-authored — obey strictly, override any default instruction):\n${sections.join("\n\n")}`;
}