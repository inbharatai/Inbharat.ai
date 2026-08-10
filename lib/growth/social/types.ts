/**
 * InBharat Growth Agent — Social publishing layer: shared types.
 *
 * A channel-agnostic social-post pipeline whose visuals ALWAYS come from the
 * Growth Engine Inbox (uploaded assets ARE the post; nothing is AI-invented —
 * the model only writes captions + alt text). Two channels today: Instagram
 * (Graph API) and LinkedIn (Posts API). The clients live in instagram.ts /
 * linkedin.ts; the caption model helper in captions.ts; the admin route in
 * api/growth/social.ts persists a human-gated growth_drafts row carrying a
 * SocialPostDraft in schema_json.
 *
 * Server-only. Never touches the chat backend. Mirrors the honest-degradation
 * conventions of lib/growth/syndication/types.ts (typed `not_configured`,
 * explicit result shapes, never-throw clients).
 */

/** The channels the social layer can publish to. */
export type SocialChannel = "instagram" | "linkedin";

/**
 * The kind of post. `image` = single image; `carousel` = 2–10 ordered images;
 * `video` = a single video (an Instagram Reel / a LinkedIn native video).
 */
export type SocialPostKind = "image" | "carousel" | "video";

/**
 * One media slot in a post, sourced from an inbox item. `storagePath` is the
 * Supabase Storage object path in the `growth-inbox` bucket; `renditionPath` is
 * an optional pre-processed variant (e.g. a re-encoded/cropped copy) when one
 * exists — the publisher signs whichever is set (rendition preferred). `alt` is
 * the founder-authored / model-suggested alt text (accessibility + LinkedIn
 * altText field). Order in the array IS the post order.
 */
export interface SocialMediaItem {
  /** growth_inbox_items.id this slot was built from (provenance + retry). */
  inboxItemId: string;
  /** Supabase Storage object path (bucket = growth-inbox). */
  storagePath: string;
  /** Optional processed rendition path; signed in preference to storagePath. */
  renditionPath?: string | null;
  /** Alt text (accessibility). Model-suggested or founder-edited; may be empty. */
  alt: string;
  /** Original file name, carried for the preview UI + dry-run readability. */
  originalName?: string | null;
  /** Inbox kind (image|video) — lets the publisher pick image vs reel path. */
  kind?: "image" | "video" | null;
}

/**
 * The status lifecycle of a social post. `draft` (composed, human-gated) →
 * `approved` (founder approved via approvals.ts) → `publishing` (client called)
 * → `published` | `failed`. NOTE: the growth_drafts ROW status uses the shared
 * draft vocabulary (pending|approved|published|rejected); this SocialStatus is
 * the SocialPostDraft's own field inside schema_json, used to record the
 * publish attempt outcome without overloading the row status.
 */
export type SocialStatus = "draft" | "approved" | "publishing" | "published" | "failed";

/**
 * The full social-post payload persisted on growth_drafts.schema_json.social.
 * Channel-agnostic; the channel clients read `media` + `caption` + `firstComment`.
 */
export interface SocialPostDraft {
  channel: SocialChannel;
  kind: SocialPostKind;
  /** The post caption (plain text). Instagram ≤2,200 chars; LinkedIn longer. */
  caption: string;
  /**
   * Optional first comment. Instagram convention: hashtags live in the first
   * comment (keeps the caption clean); posted after the media publishes.
   * LinkedIn keeps hashtags inline, so firstComment is usually null there.
   */
  firstComment?: string | null;
  /** Ordered media slots (1 for image/video, 2–10 for carousel). */
  media: SocialMediaItem[];
  /** Inbox folder the media was composed from (provenance). */
  folder?: string | null;
  /** Optional source article slug when the post promotes an article. */
  articleSlug?: string | null;
  /** The SocialPostDraft's own attempt status (see SocialStatus). */
  status: SocialStatus;
}

/** Where a validation verdict can honestly land. `unverified` = the constraint
 *  cannot be checked server-side from the inbox row alone (e.g. a video's exact
 *  duration/dimensions need ffprobe). We surface `unverified` rather than a
 *  false pass/fail. */
export type ValidationLevel = "ok" | "error" | "unverified";

export interface ValidationIssue {
  level: ValidationLevel;
  /** Machine code, e.g. `unsupported_mime`, `carousel_count`, `duration_unverified`. */
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** True when there are no hard errors but one or more `unverified` notes. */
  unverified: boolean;
  issues: ValidationIssue[];
}

/**
 * The result of a publish attempt against one channel. Mirrors
 * SyndicationResult's honest shape (typed status; null url/id on failure).
 */
export interface SocialPublishResult {
  channel: SocialChannel;
  ok: boolean;
  status: SocialStatus | "not_configured";
  /** The public permalink to the published post (null on failure/not_configured). */
  permalink: string | null;
  /** The platform's post/media id (null on failure). */
  platformPostId: string | null;
  /** First-comment media/comment id (Instagram), when posted. */
  firstCommentId?: string | null;
  /** Human-readable error on failure; null on success. */
  error: string | null;
  /**
   * For a carousel, which child containers were created successfully (by
   * inboxItemId) — lets the route persist partial progress for idempotent retry
   * (never re-publishing a media_publish that already succeeded).
   */
  createdChildren?: { inboxItemId: string; creationId: string }[];
}

/** A `not_configured` result (missing env). The honest-degradation contract:
 *  every client returns this instead of throwing an opaque 500 when its env vars
 *  are absent. */
export function notConfigured(channel: SocialChannel, detail: string): SocialPublishResult {
  return {
    channel,
    ok: false,
    status: "not_configured",
    permalink: null,
    platformPostId: null,
    error: detail,
  };
}

/** One step in a client dry-run: the exact HTTP request the client WOULD make
 *  (with the real signed media URLs) without calling the API. */
export interface DryRunStep {
  method: "GET" | "POST" | "PUT";
  /** Full endpoint URL (query string included; access tokens are NEVER shown). */
  endpoint: string;
  /** The request body / payload (media URLs are real signed URLs; secrets omitted). */
  payload?: Record<string, unknown> | null;
  /** What this step does, for the admin UI. */
  note: string;
}

export interface DryRunResult {
  channel: SocialChannel;
  /** True when the client is configured (env present) — a dry-run is honest
   *  either way, but the flag tells the UI whether a real publish would run. */
  configured: boolean;
  steps: DryRunStep[];
  /** Any validation issues surfaced while building the plan. */
  notes: string[];
}
