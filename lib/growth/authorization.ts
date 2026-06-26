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
import { createRequire } from "node:module";
import type {
  AuthorizedAsset,
  AuthorizedAssetsConfig,
  GrowthAction,
  RepoEntry,
  RepoRegistry,
  AuthorizationDecision,
} from "./types.js";
// Load the JSON config via createRequire (not a static `import ... from "*.json"`).
// Vercel's serverless functions run strict ESM Node, which rejects a JSON import
// without a `with { type: "json" }` attribute (ERR_IMPORT_ATTRIBUTE_MISSING) —
// that crashed every endpoint pulling in the crawler/auditor (audit, promote,
// cron/daily). createRequire loads JSON without an import attribute and is
// traced by Vercel's bundler the same as the previous static import.
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";

const cfgRequire = createRequire(import.meta.url);
/** Seed + fallback. Used when the DB registry is absent/not yet loaded, so the
 *  pipeline never breaks and hermetic tests with no Supabase stay green. */
const assetsConfig = cfgRequire("../../config/growth-authorized-assets.json") as AuthorizedAssetsConfig;
const reposConfig = cfgRequire("../../config/repo-registry.json") as RepoRegistry;

/**
 * DB-backed registry cache. Populated by reloadRegistry() (admin/cron handlers
 * call ensureRegistryLoaded()). While null, the sync guards fall back to the
 * JSON seed — so a cold request before the first reload still serves correct
 * (seed) data, and tests with no DB are unaffected.
 */
let registryCache: { assets: AuthorizedAsset[]; repos: RepoEntry[] } | null = null;

/** Map a growth_repo_registry row (snake_case) → RepoEntry (camelCase). */
export function mapRepoRow(r: Record<string, unknown>): RepoEntry {
  return {
    productName: String(r.product_name ?? ""),
    productSlug: String(r.product_slug ?? ""),
    canonicalPrivateRepo: (r.canonical_private_repo as string | null) ?? null,
    publicRepo: (r.public_repo as string | null) ?? null,
    websitePath: (r.website_path as string | null) ?? null,
    sourceOfTruth: (r.source_of_truth as RepoEntry["sourceOfTruth"]) ?? "canonical_private",
    publicRepoStatus: (r.public_repo_status as RepoEntry["publicRepoStatus"]) ?? "public_mirror_current",
    crawlPrivateRepo: Boolean(r.crawl_private_repo),
    crawlPublicRepo: Boolean(r.crawl_public_repo),
    allowAgentRead: Boolean(r.allow_agent_read),
    allowAgentPR: Boolean(r.allow_agent_pr),
    notes: (r.notes as string | undefined) ?? undefined,
  };
}

/** Map a growth_authorized_assets row (snake_case) → AuthorizedAsset (camelCase). */
export function mapAssetRow(a: Record<string, unknown>): AuthorizedAsset {
  return {
    domain: String(a.domain ?? ""),
    name: String(a.name ?? ""),
    status: String(a.status ?? "active"),
    canCrawl: Boolean(a.can_crawl),
    canAudit: Boolean(a.can_audit),
    canDraft: Boolean(a.can_draft),
    canCreatePR: Boolean(a.can_create_pr),
    canPublishDirectly: Boolean(a.can_publish_directly),
    requiresHumanApproval: a.requires_human_approval === false ? false : true,
    notes: (a.notes as string | undefined) ?? undefined,
  };
}

/** Reload the registry from the DB into the cache. Never throws — on any error
 *  or empty (unseeded) DB it keeps the JSON seed (pipeline must never break). */
export async function reloadRegistry(): Promise<void> {
  if (!supabaseAdmin) { registryCache = null; return; }
  try {
    const [reposRes, assetsRes] = await Promise.all([
      supabaseAdmin.from("growth_repo_registry").select("*"),
      supabaseAdmin.from("growth_authorized_assets").select("*"),
    ]);
    if (reposRes.error || assetsRes.error) { registryCache = null; return; }
    const repos = (reposRes.data ?? []).map(mapRepoRow);
    const assets = (assetsRes.data ?? []).map(mapAssetRow);
    // Only adopt the DB view if it has rows; a freshly-migrated-but-unseeded DB
    // would otherwise blank out the registry.
    if (repos.length === 0 && assets.length === 0) { registryCache = null; return; }
    registryCache = { assets, repos };
  } catch {
    registryCache = null;
  }
}

/** Invalidate the cache after an admin registry edit. The next guard read re-seeds
 *  from JSON until the next ensureRegistryLoaded()/reloadRegistry(). */
export function bustRegistryCache(): void {
  registryCache = null;
}

/** Ensure the DB registry is loaded into the cache. Idempotent (no-op if loaded).
 *  Call at the top of admin/cron handlers that need fresh DB state. */
export async function ensureRegistryLoaded(): Promise<void> {
  if (registryCache) return;
  await reloadRegistry();
}

/** Current assets: DB cache if loaded, else JSON seed. */
function currentAssets(): AuthorizedAsset[] {
  return registryCache?.assets ?? assetsConfig.assets;
}

/** Current repos: DB cache if loaded, else JSON seed. */
function currentRepos(): RepoEntry[] {
  return registryCache?.repos ?? reposConfig.repos;
}

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
  return currentAssets();
}

export function getRepoRegistry(): RepoEntry[] {
  return currentRepos();
}

/** Find the authorized asset for a domain (or URL). Returns undefined if not authorized. */
export function findAsset(domainOrUrl: string): AuthorizedAsset | undefined {
  const d = normalizeDomain(domainOrUrl);
  return currentAssets().find((a) => normalizeDomain(a.domain) === d);
}

export function findRepo(repo: string): RepoEntry | undefined {
  const r = currentRepos().find((x) => x.canonicalPrivateRepo === repo || x.publicRepo === repo);
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