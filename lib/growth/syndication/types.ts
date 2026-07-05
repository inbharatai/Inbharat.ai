/**
 * InBharat Growth Agent — Stage 3 syndication: shared types.
 *
 * Syndication = republishing an APPROVED article draft to external platforms
 * (DEV.to, Hashnode) with the InBharat canonical URL set, so search engines
 * attribute the original to www.inbharat.ai and the cross-post ranks as a
 * copy, not duplicate content. Medium has no public write API anymore
 * (deprecated) → surfaced as a manual import helper (canonical URL the founder
 * pastes into Medium's importer), never a fabricated POST.
 *
 * Human-gated: the founder explicitly picks platforms per article in the
 * /admin/growth/syndication page and confirms before each run. There is no
 * cron auto-syndication — syndication is a deliberate, per-article action.
 *
 * Server-only. Never touches the chat backend. No model calls (so no budget
 * impact + no redaction-before-model rule applies); the article body IS
 * secret-scanned before each POST so a leaked secret in a draft is never
 * shipped to a third-party platform.
 */

/** The platforms Stage 3 can syndicate to. */
export type SyndicationPlatform = "devto" | "hashnode" | "medium";

/** The lifecycle status of one syndication attempt, persisted to growth_syndication.
 *  `playwright_draft` is the local Playwright path: the "Submit (local) ↗" click
 *  recorded a ledger row + copied the body/canonical, the founder runs
 *  scripts/syndicate-populate.ts on their machine to pre-fill the editor, then
 *  clicks Publish themselves. The deployed app never spawns a browser. */
export type SyndicationStatus =
  | "published" // live on the platform (Hashnode publishPost)
  | "draft" // created as a platform draft for founder review (DEV.to published:false)
  | "manual" // no API — founder pastes canonical into the platform's importer (Medium)
  | "playwright_draft" // local Playwright editor pre-fill (founder runs the script + clicks Publish)
  | "failed" // the platform API returned an error
  | "not_configured"; // the platform's env var (API key / publication id) is absent

/** One platform's outcome. Returned by the syndicator + persisted as a growth_syndication row. */
export interface SyndicationResult {
  platform: SyndicationPlatform;
  /** True when the platform accepted the post (published, draft, or manual helper built). */
  ok: boolean;
  /** The platform post URL on success (null for Medium manual + failures). */
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
  /** Optional cover image URL (used as DEV.to main_image when available). */
  coverImageUrl?: string | null;
  /** Optional short description (DEV.to description field). */
  description?: string | null;
}