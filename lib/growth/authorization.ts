/**
 * InBharat Growth Agent — Module 1: Authorization Guard.
 *
 * Deny by default. Only assets/repos explicitly listed in the config files
 * may be touched, and only with the flags granted. Publishing is never
 * automatic (canPublishDirectly must be false; requiresHumanApproval true).
 *
 * Pure decision functions (isDomainAuthorized / isRepoAuthorized / canPerform /
 * assertAuthorized) do NOT touch the database, so they are hermetically
 * testable. logDeniedAttempt() persists to growth_agent_logs when Supabase is
 * configured, else falls back to console.
 */
import type {
  AuthorizedAsset,
  AuthorizedAssetsConfig,
  GrowthAction,
  RepoEntry,
  RepoRegistry,
  AuthorizationDecision,
} from "./types.js";
import authorizedAssetsConfig from "../../config/growth-authorized-assets.json";
import repoRegistryConfig from "../../config/repo-registry.json";
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";

const assetsConfig = authorizedAssetsConfig as AuthorizedAssetsConfig;
const reposConfig = repoRegistryConfig as RepoRegistry;

/** Normalize a URL/host to a bare hostname (lowercased, no www prefix for compare). */
export function normalizeDomain(input: string): string {
  try {
    const withProto = input.includes("://") ? input : `https://${input}`;
    const host = new URL(withProto).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return input.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export function getAuthorizedAssets(): AuthorizedAsset[] {
  return assetsConfig.assets;
}

export function getRepoRegistry(): RepoEntry[] {
  return reposConfig.repos;
}

/** Find the authorized asset for a domain (or URL). Returns undefined if not authorized. */
export function findAsset(domainOrUrl: string): AuthorizedAsset | undefined {
  const d = normalizeDomain(domainOrUrl);
  return assetsConfig.assets.find((a) => normalizeDomain(a.domain) === d);
}

export function findRepo(repo: string): RepoEntry | undefined {
  const r = reposConfig.repos.find((x) => x.canonicalPrivateRepo === repo || x.publicRepo === repo);
  return r;
}

/** Is this domain authorized to be crawled at all? */
export function isDomainAuthorized(domainOrUrl: string): boolean {
  const asset = findAsset(domainOrUrl);
  return !!asset && asset.canCrawl;
}

/** Is this repo authorized to be read by the agent? */
export function isRepoAuthorized(repo: string): boolean {
  const r = findRepo(repo);
  return !!r && r.allowAgentRead && r.publicRepoStatus !== "do_not_use";
}

/** Decide whether an action is permitted on an asset. Deny by default. */
export function canPerform(action: GrowthAction, domainOrUrl: string): AuthorizationDecision {
  const asset = findAsset(domainOrUrl);
  const scope = normalizeDomain(domainOrUrl);
  if (!asset) {
    return { allowed: false, reason: "domain not in authorized-assets registry", action, scope };
  }
  if (asset.status === "planned" && action !== "audit") {
    return { allowed: false, reason: "asset is planned/not live; only audit allowed", action, scope };
  }
  const flag: keyof AuthorizedAsset | undefined = {
    crawl: "canCrawl",
    audit: "canAudit",
    draft: "canDraft",
    createPR: "canCreatePR",
    publish: "canPublishDirectly",
  }[action] as keyof AuthorizedAsset | undefined;

  if (!flag || !asset[flag]) {
    return { allowed: false, reason: `asset flag ${String(flag)} is false`, action, scope };
  }
  // Publishing always requires human approval, even if a flag were ever flipped.
  if (action === "publish" && asset.requiresHumanApproval) {
    return {
      allowed: false,
      reason: "publish requires human approval (PR-only workflow)",
      action,
      scope,
    };
  }
  return { allowed: true, reason: "authorized", action, scope };
}

/** Throw on deny. Use in API routes for a hard guard. */
export function assertAuthorized(action: GrowthAction, domainOrUrl: string): AuthorizationDecision {
  const decision = canPerform(action, domainOrUrl);
  if (!decision.allowed) {
    void logDeniedAttempt(decision);
    throw new AuthorizationError(decision.reason);
  }
  return decision;
}

export class AuthorizationError extends Error {
  decision?: AuthorizationDecision;
  constructor(reason: string, decision?: AuthorizationDecision) {
    super(reason);
    this.name = "AuthorizationError";
    this.decision = decision;
  }
}

/** Persist a denied attempt to growth_agent_logs (audit trail). No-op beyond console if DB absent. */
export async function logDeniedAttempt(decision: AuthorizationDecision): Promise<void> {
  const payload = {
    level: "deny",
    action: decision.action,
    scope: decision.scope,
    detail: decision.reason,
    denied: decision,
  };
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("growth_agent_logs").insert(payload);
      return;
    } catch {
      // fall through to console
    }
  }
  // eslint-disable-next-line no-console
  console.warn("[growth-authorization] DENY", JSON.stringify(payload));
}

/** General info log (e.g. run started/completed). */
export async function logInfo(action: string, scope: string, detail: string): Promise<void> {
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("growth_agent_logs").insert({ level: "info", action, scope, detail });
      return;
    } catch {
      // fall through
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[growth] ${action} ${scope}: ${detail}`);
}