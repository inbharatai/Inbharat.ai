/**
 * InBharat Growth Agent — Stage 3 syndication: DEV.to (Forem) client.
 *
 * Creates an article on DEV.to via POST https://dev.to/api/articles with the
 * `api-key` header ( Forem API v1 — https://developers.forem.com/api/v1 ).
 * `published: false` → the post is created as a DEV.to DRAFT so the founder can
 * review the rendered post + canonical on DEV.to before flipping it public
 * (the human-gate philosophy: the founder's "Syndicate" click is gate 1; the
 * DEV.to draft is the final review gate 2). The InBharat canonical URL is set
 * as `canonical_url` so Google attributes the original to www.inbharat.ai.
 *
 * Pure payload builder (`buildDevtoArticlePayload`) is split out so it is
 * unit-testable without network; the async `publishToDevto` only adds the
 * fetch + response parsing. Server-only.
 */
import type { SyndicationResult } from "./types.js";
import { buildDevtoTagsString } from "./tags.js";

const DEVTO_ENDPOINT = "https://dev.to/api/articles";
const REQUEST_TIMEOUT_MS = 30000;

/** The DEV.to article payload (the `article` wrapper the Forem API requires). Pure. */
export interface DevtoArticlePayload {
  article: {
    title: string;
    body_markdown: string;
    published: boolean;
    tags: string; // comma-separated, max 4
    canonical_url: string;
    description?: string;
    main_image?: string;
  };
}

/**
 * Build the DEV.to article payload from the syndication inputs. Pure — no fetch,
 * no env reads (the api-key is applied in publishToDevto, not here). `published`
 * is always false (draft for founder review). Tags from the article hashtags,
 * comma-separated as the Forem spec requires.
 */
export function buildDevtoArticlePayload(input: {
  title: string;
  bodyMarkdown: string;
  hashtags: string[] | null;
  canonicalUrl: string;
  description?: string | null;
  coverImageUrl?: string | null;
}): DevtoArticlePayload {
  const article: DevtoArticlePayload["article"] = {
    title: input.title,
    body_markdown: input.bodyMarkdown,
    published: false,
    tags: buildDevtoTagsString(input.hashtags),
    canonical_url: input.canonicalUrl,
  };
  if (input.description && input.description.trim()) {
    article.description = input.description.trim().slice(0, 160);
  }
  if (input.coverImageUrl && input.coverImageUrl.trim()) {
    article.main_image = input.coverImageUrl.trim();
  }
  return { article };
}

/**
 * Create the article on DEV.to. Returns a SyndicationResult. Never throws —
 * network/parse failures become `ok:false` results with an `error` string so
 * the orchestrator can persist + surface them without try/catch at every
 * call site. `apiKey` missing → not_configured (no POST attempted).
 */
export async function publishToDevto(args: {
  apiKey: string | undefined;
  title: string;
  bodyMarkdown: string;
  hashtags: string[] | null;
  canonicalUrl: string;
  description?: string | null;
  coverImageUrl?: string | null;
}): Promise<SyndicationResult> {
  const { canonicalUrl } = args;
  if (!args.apiKey || !args.apiKey.trim()) {
    return { platform: "devto", ok: false, url: null, postId: null, status: "not_configured", error: "DEVTO_API_KEY not set", canonicalUrl };
  }
  const payload = buildDevtoArticlePayload({
    title: args.title,
    bodyMarkdown: args.bodyMarkdown,
    hashtags: args.hashtags,
    canonicalUrl,
    description: args.description,
    coverImageUrl: args.coverImageUrl,
  });
  try {
    const res = await fetch(DEVTO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": args.apiKey.trim(),
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        platform: "devto",
        ok: false,
        url: null,
        postId: null,
        status: "failed",
        error: `DEV.to HTTP ${res.status}: ${text.slice(0, 500)}`,
        canonicalUrl,
      };
    }
    const data = (await res.json()) as { id?: number; url?: string; slug?: string };
    // DEV.to returns the post url for published posts; for drafts the `url` is
    // the canonical slug path but the preview needs a dashboard token. Surface
    // whatever url + id the API returns; the founder opens DEV.to to review.
    return {
      platform: "devto",
      ok: true,
      url: typeof data.url === "string" && data.url ? data.url : null,
      postId: data.id != null ? String(data.id) : null,
      status: "draft",
      error: null,
      canonicalUrl,
    };
  } catch (e) {
    return {
      platform: "devto",
      ok: false,
      url: null,
      postId: null,
      status: "failed",
      error: `DEV.to request failed: ${(e as Error).message}`,
      canonicalUrl,
    };
  }
}