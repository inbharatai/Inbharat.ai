/**
 * InBharat Growth Agent — Stage 3 syndication orchestrator.
 *
 * DEV.to, Hashnode, and Medium channels have been removed. The orchestrator
 * is retained for the growth_syndication ledger and any future platform
 * additions (e.g. instagram). syndicateArticle() currently returns an empty
 * array for unknown platform strings (no-op).
 *
 * No model call → no budget impact. Human-gated by the route's requireAdmin.
 * Server-only. Never throws.
 */
import type { SyndicationContext, SyndicationPlatform, SyndicationResult } from "./types.js";
import { SITE } from "../../../seo.config.js";
import { articlePath } from "../../../content/articles.meta.js";
import { containsSecret } from "../redaction.js";

/** Canonical URL for an article slug. */
export function canonicalForSlug(slug: string): string {
  return `${SITE.url}${articlePath(slug)}`;
}

/**
 * Syndicate one article to the requested platforms. Returns one
 * SyndicationResult per requested platform (in the order requested). Never
 * throws. Known platforms: none currently (DEV.to / Hashnode / Medium removed).
 */
export async function syndicateArticle(
  platforms: SyndicationPlatform[],
  ctx: SyndicationContext,
): Promise<SyndicationResult[]> {
  const canonicalUrl = canonicalForSlug(ctx.slug);

  // Secret scan up front: if the draft body contains a secret pattern, abort
  // every platform. We do not cross-post a body that may have leaked a key.
  if (containsSecret(ctx.bodyMarkdown)) {
    return platforms.map((platform) => ({
      platform,
      ok: false,
      url: null,
      postId: null,
      status: "failed" as const,
      error: "article body contains a secret pattern; syndication aborted before any POST",
      canonicalUrl,
    }));
  }

  // No active platforms: return not_configured for any platform passed.
  return platforms.map((platform) => ({
    platform,
    ok: false,
    url: null,
    postId: null,
    status: "not_configured" as const,
    error: `platform "${platform}" is not a configured syndication channel`,
    canonicalUrl,
  }));
}

export type { SyndicationContext, SyndicationPlatform, SyndicationResult, SyndicationStatus } from "./types.js";
