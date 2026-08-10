/**
 * InBharat Growth Agent — Stage 3 syndication: shared types.
 *
 * Syndication channels DEV.to, Hashnode, and Medium have been removed.
 * The syndication infrastructure (ledger, route, articleBody) is retained
 * because LinkedIn cross-posting and the growth_syndication ledger are still
 * active. SyndicationPlatform is intentionally kept as a narrow type for
 * any future platform additions (e.g. instagram).
 *
 * Human-gated: the founder explicitly picks platforms per article. There is
 * no cron auto-syndication — syndication is a deliberate, per-article action.
 *
 * Server-only. Never touches the chat backend.
 */

/**
 * The platforms Stage 3 can syndicate to.
 * DEV.to, Hashnode, and Medium have been removed. This type is kept
 * for the ledger row shape and future platform additions.
 */
export type SyndicationPlatform = string;

/** The lifecycle status of one syndication attempt, persisted to growth_syndication. */
export type SyndicationStatus =
  | "published" // live on the platform
  | "draft" // created as a platform draft for founder review
  | "manual" // no API — founder pastes canonical into the platform's importer
  | "playwright_draft" // local Playwright editor pre-fill (founder runs the script + clicks Publish)
  | "failed" // the platform API returned an error
  | "not_configured"; // the platform's env var (API key / publication id) is absent

/** One platform's outcome. Returned by the syndicator + persisted as a growth_syndication row. */
export interface SyndicationResult {
  platform: SyndicationPlatform;
  /** True when the platform accepted the post (published, draft, or manual helper built). */
  ok: boolean;
  /** The platform post URL on success (null for failures). */
  url: string | null;
  /** The platform's internal post id on success (null when not provided / manual). */
  postId: string | null;
  status: SyndicationStatus;
  /** Human-readable error on failure; null on success. */
  error: string | null;
  /** The InBharat canonical URL sent as the cross-post canonical. */
  canonicalUrl: string;
}

/** Input to the orchestrator: everything needed to syndicate one article. */
export interface SyndicationContext {
  /** The growth_drafts row id (the approved article draft). */
  draftId: string;
  /** Article slug (drives the canonical URL). */
  slug: string;
  /** Article title. */
  title: string;
  /** Full article body in markdown (the same body committed to the InBharat repo). */
  bodyMarkdown: string;
  /** Hashtags from the article manifest / draft schema_json (drives platform tags). */
  hashtags: string[] | null;
  /** Optional cover image URL. */
  coverImageUrl?: string | null;
  /** Optional short description. */
  description?: string | null;
}
