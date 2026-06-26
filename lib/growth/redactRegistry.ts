/**
 * Shared registry redaction — the single place that decides what the admin UI
 * (client bundle) is allowed to see of a repo/asset registry entry.
 *
 * The cardinal rule: canonical PRIVATE repo names are never surfaced. They live
 * only in the server-side DB / JSON seed and the authed CRUD endpoints that
 * write them — never in a GET the overview/issues pages load, never in the
 * client bundle, sitemap, or SEO shells. Here a private repo becomes a boolean.
 *
 * Client-safe (types only) — imported by both api/growth/status.ts and
 * api/growth/registry.ts so the rule lives in one place.
 */
import type { AuthorizedAsset, RepoEntry } from "./types.js";

export interface RepoPublicView {
  productName: string;
  productSlug: string;
  publicRepo: string | null;
  websitePath: string | null;
  sourceOfTruth: RepoEntry["sourceOfTruth"];
  publicRepoStatus: RepoEntry["publicRepoStatus"];
  allowAgentRead: boolean;
  allowAgentPR: boolean;
  notes?: string;
  /** True if a canonical private repo exists — its name is never returned. */
  hasPrivateRepo: boolean;
  /** GitHub verify cache (read-only enrichment; null until verified). */
  lastCommitSha: string | null;
  lastCommitAt: string | null;
  lastPrState: string | null;
  lastCheckedAt: string | null;
}

/** Optional GitHub verify columns (snake_case DB → camelCase). */
export interface RepoVerifyCache {
  lastCommitSha?: string | null;
  lastCommitAt?: string | null;
  lastPrState?: string | null;
  lastCheckedAt?: string | null;
}

export interface AssetPublicView {
  domain: string;
  name: string;
  status: string;
  canCrawl: boolean;
  canAudit: boolean;
  canDraft: boolean;
  canCreatePR: boolean;
  requiresHumanApproval: boolean;
  notes?: string;
}

/** Strip the canonical private repo name, exposing only a boolean. */
export function redactRepo(r: RepoEntry, v: RepoVerifyCache = {}): RepoPublicView {
  return {
    productName: r.productName,
    productSlug: r.productSlug,
    publicRepo: r.publicRepo,
    websitePath: r.websitePath,
    sourceOfTruth: r.sourceOfTruth,
    publicRepoStatus: r.publicRepoStatus,
    allowAgentRead: r.allowAgentRead,
    allowAgentPR: r.allowAgentPR,
    notes: r.notes,
    hasPrivateRepo: !!r.canonicalPrivateRepo,
    lastCommitSha: v.lastCommitSha ?? null,
    lastCommitAt: v.lastCommitAt ?? null,
    lastPrState: v.lastPrState ?? null,
    lastCheckedAt: v.lastCheckedAt ?? null,
  };
}

/** Asset public view — canPublishDirectly is never surfaced (always false anyway). */
export function redactAsset(a: AuthorizedAsset): AssetPublicView {
  return {
    domain: a.domain,
    name: a.name,
    status: a.status,
    canCrawl: a.canCrawl,
    canAudit: a.canAudit,
    canDraft: a.canDraft,
    canCreatePR: a.canCreatePR,
    requiresHumanApproval: a.requiresHumanApproval,
    notes: a.notes,
  };
}

// ─── Admin views (authed edit surface only) ──────────────────────────────
// Returned ONLY by /api/growth/registry GET (requireAdmin-gated, runtime data —
// never baked into the static client bundle/sitemap/SEO shells). The founder
// needs the canonical private repo name here to grant/edit private-repo access;
// the /status GET that Overview/Issues load stays redacted. canPublishDirectly
// is included so the founder can see it is always false (it is not writable).

export interface RepoAdminView extends RepoEntry {
  source: "seed" | "ui";
  editorLocked: boolean;
  lastCommitSha: string | null;
  lastCommitAt: string | null;
  lastPrState: string | null;
  lastCheckedAt: string | null;
}

export interface AssetAdminView extends AuthorizedAsset {
  source: "seed" | "ui";
  editorLocked: boolean;
}

export function adminRepoView(
  r: RepoEntry,
  x: { source?: "seed" | "ui"; editorLocked?: boolean } & RepoVerifyCache = {},
): RepoAdminView {
  return {
    ...r,
    source: x.source ?? "seed",
    editorLocked: x.editorLocked ?? false,
    lastCommitSha: x.lastCommitSha ?? null,
    lastCommitAt: x.lastCommitAt ?? null,
    lastPrState: x.lastPrState ?? null,
    lastCheckedAt: x.lastCheckedAt ?? null,
  };
}

export function adminAssetView(
  a: AuthorizedAsset,
  x: { source?: "seed" | "ui"; editorLocked?: boolean } = {},
): AssetAdminView {
  return { ...a, source: x.source ?? "seed", editorLocked: x.editorLocked ?? false };
}