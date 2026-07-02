/**
 * InBharat Growth Agent — Stage 3 syndication orchestrator.
 *
 * syndicateArticle(platforms, ctx) → SyndicationResult[]: fans the article out
 * to the requested platforms (DEV.to live client, Hashnode live client, Medium
 * manual helper), reading each platform's credentials from env. Does NOT
 * persist — the api/growth/syndicate.ts route owns DB persistence + auth so
 * the orchestrator stays focused + testable (its pure helpers + clients are
 * unit-tested; the orchestrator itself is exercised via the route).
 *
 * Safety: the article body is secret-scanned ONCE up front (containsSecret).
 * If a draft body contains a leaked secret pattern, every platform is aborted
 * with `status:"failed"` + an error naming the scan — we never ship a secret to
 * a third-party platform. This is the syndication analogue of the
 * redaction-before-model rule.
 *
 * No model call → no budget impact. Human-gated by the route's requireAdmin.
 * Server-only. Never throws (clients return result objects).
 */
import type { SyndicationContext, SyndicationPlatform, SyndicationResult } from "./types.js";
import { canonicalForSlug } from "./tags.js";
import { publishToDevto } from "./devto.js";
import { publishToHashnode } from "./hashnode.js";
import { buildMediumImportHelper } from "./medium.js";
import { containsSecret } from "../redaction.js";

/**
 * Syndicate one article to the requested platforms. Reads credentials from env:
 * DEVTO_API_KEY, HASHNODE_TOKEN, HASHNODE_PUBLICATION_ID. Returns one
 * SyndicationResult per requested platform (in the order requested). Never
 * throws. Medium is always ok:manual (no API).
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

  const results: SyndicationResult[] = [];
  for (const platform of platforms) {
    switch (platform) {
      case "devto":
        results.push(
          await publishToDevto({
            apiKey: process.env.DEVTO_API_KEY,
            title: ctx.title,
            bodyMarkdown: ctx.bodyMarkdown,
            hashtags: ctx.hashtags,
            canonicalUrl,
            description: ctx.description,
            coverImageUrl: ctx.coverImageUrl,
          }),
        );
        break;
      case "hashnode":
        results.push(
          await publishToHashnode({
            token: process.env.HASHNODE_TOKEN,
            publicationId: process.env.HASHNODE_PUBLICATION_ID,
            title: ctx.title,
            bodyMarkdown: ctx.bodyMarkdown,
            hashtags: ctx.hashtags,
            canonicalUrl,
            articleSlug: ctx.slug,
            description: ctx.description,
          }),
        );
        break;
      case "medium":
        results.push(buildMediumImportHelper(canonicalUrl));
        break;
    }
  }
  return results;
}

export type { SyndicationContext, SyndicationPlatform, SyndicationResult, SyndicationStatus } from "./types.js";
export { canonicalForSlug, buildDevtoTagsString, buildHashnodeTags, platformCredentialEnv, platformLabel } from "./tags.js";
export { buildDevtoArticlePayload } from "./devto.js";
export { buildHashnodeRequest } from "./hashnode.js";
export { buildMediumImportHelper, MEDIUM_IMPORT_URL, mediumInstructions } from "./medium.js";