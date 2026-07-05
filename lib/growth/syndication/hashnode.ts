/**
 * InBharat Growth Agent — Stage 3 syndication: Hashnode GraphQL client.
 *
 * Publishes the article via the `publishPost` mutation on
 * https://gql.hashnode.com (Hashnode Public API — https://apidocs.hashnode.com).
 * Auth = `Authorization: <PAT>` header (NO Bearer prefix — Hashnode's spec).
 * `publicationId` is REQUIRED by PublishPostInput, so Hashnode syndication is
 * `not_configured` without HASHNODE_PUBLICATION_ID. The InBharat canonical URL
 * is sent as `originalArticleURL` (the field Hashnode maps to the post's
 * canonicalUrl) so Google attributes the original to www.inbharat.ai.
 *
 * Hashnode's `publishPost` publishes LIVE (there is no clean "save as draft
 * with canonical" mutation in the public API), so — unlike DEV.to's draft — a
 * Hashnode syndicate goes live on confirm. The admin UI shows a confirm step
 * naming Hashnode as live; the founder's explicit confirm is the gate.
 *
 * Pure mutation + variables builder (`buildHashnodeRequest`) is split out so
 * it is unit-testable without network; `publishToHashnode` only adds fetch +
 * response parsing. Server-only.
 */
import type { SyndicationResult } from "./types.js";
import { buildHashnodeTags } from "./tags.js";

const HASHNODE_ENDPOINT = "https://gql.hashnode.com";
const REQUEST_TIMEOUT_MS = 30000;

/** The GraphQL mutation (constant — values go in `variables`, never interpolated, to avoid injection). */
const PUBLISH_POST_MUTATION = `mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) {
    post {
      id
      slug
      title
      url
      canonicalUrl
    }
  }
}`;

/** The Hashnode request body (query + variables). Pure. */
export interface HashnodeRequestBody {
  query: string;
  variables: {
    input: {
      title: string;
      publicationId: string;
      contentMarkdown: string;
      originalArticleURL: string;
      tags?: { slug: string; name: string }[];
      subtitle?: string;
      slug?: string;
    };
  };
}

/**
 * Build the Hashnode GraphQL request body from the syndication inputs. Pure —
 * no fetch, no env reads. The PAT + publicationId are applied in
 * publishToHashnode, not here, EXCEPT publicationId is part of the input so it
 * is passed in (the caller reads it from env). Tags from the article hashtags
 * as `{ slug, name }` objects (max 5).
 */
export function buildHashnodeRequest(input: {
  title: string;
  bodyMarkdown: string;
  hashtags: string[] | null;
  canonicalUrl: string;
  publicationId: string;
  articleSlug?: string | null;
  description?: string | null;
}): HashnodeRequestBody {
  const req: HashnodeRequestBody = {
    query: PUBLISH_POST_MUTATION,
    variables: {
      input: {
        title: input.title,
        publicationId: input.publicationId,
        contentMarkdown: input.bodyMarkdown,
        originalArticleURL: input.canonicalUrl,
      },
    },
  };
  const tags = buildHashnodeTags(input.hashtags);
  if (tags.length > 0) req.variables.input.tags = tags;
  if (input.articleSlug && /^[a-z0-9-]+$/.test(input.articleSlug)) {
    // Hashnode slug rules: lowercase letters, numbers, hyphens. Reuse the
    // InBharat article slug so the Hashnode post URL is recognizable.
    req.variables.input.slug = input.articleSlug;
  }
  if (input.description && input.description.trim()) {
    req.variables.input.subtitle = input.description.trim().slice(0, 160);
  }
  return req;
}

/**
 * Publish the article to Hashnode. Returns a SyndicationResult. Never throws.
 * `token` or `publicationId` missing → not_configured (no POST attempted).
 */
export async function publishToHashnode(args: {
  token: string | undefined;
  publicationId: string | undefined;
  title: string;
  bodyMarkdown: string;
  hashtags: string[] | null;
  canonicalUrl: string;
  articleSlug?: string | null;
  description?: string | null;
}): Promise<SyndicationResult> {
  const { canonicalUrl } = args;
  if (!args.token || !args.token.trim()) {
    return { platform: "hashnode", ok: false, url: null, postId: null, status: "not_configured", error: "HASHNODE_TOKEN not set", canonicalUrl };
  }
  if (!args.publicationId || !args.publicationId.trim()) {
    return { platform: "hashnode", ok: false, url: null, postId: null, status: "not_configured", error: "HASHNODE_PUBLICATION_ID not set", canonicalUrl };
  }
  const body = buildHashnodeRequest({
    title: args.title,
    bodyMarkdown: args.bodyMarkdown,
    hashtags: args.hashtags,
    canonicalUrl,
    publicationId: args.publicationId.trim(),
    articleSlug: args.articleSlug,
    description: args.description,
  });
  try {
    const res = await fetch(HASHNODE_ENDPOINT, {
      method: "POST",
      // Hashnode PAT auth: bare token, NO "Bearer" prefix (per their API docs).
      headers: {
        "Authorization": args.token.trim(),
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        platform: "hashnode",
        ok: false,
        url: null,
        postId: null,
        status: "failed",
        error: `Hashnode HTTP ${res.status}: ${text.slice(0, 500)}`,
        canonicalUrl,
      };
    }
    const data = (await res.json()) as {
      data?: { publishPost?: { post?: { id?: string; url?: string; slug?: string } } };
      errors?: Array<{ message?: string }>;
    };
    if (data.errors && data.errors.length > 0) {
      const msg = data.errors.map((e) => e.message || "unknown").join("; ").slice(0, 500);
      return {
        platform: "hashnode",
        ok: false,
        url: null,
        postId: null,
        status: "failed",
        error: `Hashnode GraphQL errors: ${msg}`,
        canonicalUrl,
      };
    }
    const post = data.data?.publishPost?.post;
    // Honesty: a "published" status with no URL is not verifiable and misleads the
    // founder (and the ledger chip would show "published ✓" with no link). If the
    // API omitted post.url (partial response / breaking API change), treat it as a
    // soft failure so the founder knows to check the Hashnode dashboard manually.
    const hasUrl = typeof post?.url === "string" && !!post.url;
    return {
      platform: "hashnode",
      ok: hasUrl,
      url: hasUrl ? post!.url : null,
      postId: post?.id || null,
      status: hasUrl ? "published" : "failed",
      error: hasUrl ? null : "Hashnode published but returned no post URL — verify on your Hashnode dashboard.",
      canonicalUrl,
    };
  } catch (e) {
    return {
      platform: "hashnode",
      ok: false,
      url: null,
      postId: null,
      status: "failed",
      error: `Hashnode request failed: ${(e as Error).message}`,
      canonicalUrl,
    };
  }
}