/**
 * InBharat Growth Agent — Instagram Graph API client.
 *
 * Publishes an inbox-sourced post (single image, 2–10 carousel, or Reel) to an
 * Instagram Business/Creator account via the Meta Graph API. The account's media
 * are fetched by the platform from short-lived signed Supabase Storage URLs
 * (see media.ts) — the bytes never pass through this process.
 *
 * Graph API version is pinned (see GRAPH_VERSION) rather than tracking whatever
 * graph.facebook.com currently defaults to, so a silent Meta version bump can't
 * change behavior with no code change (same reasoning as the Gemini model pins).
 *
 * Honest degradation: missing env → typed `not_configured` result (never a
 * thrown 500). dryRun() returns the exact request sequence (with real signed
 * URLs, tokens omitted) WITHOUT calling the API. Retries 429/5xx with exponential
 * backoff (max 3); NEVER retries a successful media_publish (double-post risk).
 *
 * Env (server-only, never in the browser bundle):
 *   IG_USER_ID          — the Instagram Business account's IG user id
 *   META_ACCESS_TOKEN   — a long-lived Page/User access token with
 *                         instagram_content_publish (+ pages_read_engagement)
 *
 * Server-only. Never touches the chat backend.
 */
import type {
  SocialPostDraft,
  SocialPublishResult,
  DryRunResult,
  DryRunStep,
} from "./types.js";
import { notConfigured } from "./types.js";
import { signMediaItem, DEFAULT_MEDIA_URL_TTL_SEC } from "./media.js";

/** Pinned Graph API version. Bump deliberately (Meta deprecates ~2yr cadence). */
export const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Retry config for 429/5xx. NEVER applied to media_publish (see publishContainer). */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

/** Container FINISHED polling: cap total wait. Vercel serverless maxDuration is
 *  finite (this route sets 300s); videos can take a while, so we cap ~4min and
 *  leave headroom for the publish + permalink calls. */
const POLL_TIMEOUT_MS = 4 * 60 * 1000;
const POLL_INTERVAL_MS = 4000;

interface IgEnv {
  igUserId: string;
  accessToken: string;
}

/** Read + validate env. Returns null when either var is absent/placeholder. */
export function igEnv(): IgEnv | null {
  const igUserId = process.env.IG_USER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!igUserId || !accessToken) return null;
  if (igUserId.includes("your-") || accessToken.includes("your-")) return null;
  return { igUserId, accessToken };
}

export function isInstagramConfigured(): boolean {
  return igEnv() !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function backoff(attempt: number): Promise<void> {
  const wait = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 250);
  await sleep(wait);
}

/** A Graph API error surfaced with the response body (mirrors gemini.ts). */
export class GraphApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
  }
}

/**
 * POST/GET a Graph endpoint with retry on 429/5xx. `retry` defaults true; pass
 * false for media_publish so a successful-but-slow publish is never re-sent
 * (double-post risk). The access token is added to the form/query here so call
 * sites never embed it. Throws GraphApiError with the response body on failure.
 */
async function graphFetch(
  path: string,
  init: { method: "GET" | "POST"; params?: Record<string, string> },
  env: IgEnv,
  retry = true,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams(init.params ?? {});
  params.set("access_token", env.accessToken);
  const url = `${GRAPH_BASE}${path}`;

  let lastErr: unknown;
  const attempts = retry ? MAX_RETRIES : 0;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const res =
        init.method === "GET"
          ? await fetch(`${url}?${params.toString()}`, { method: "GET", signal: AbortSignal.timeout(30000) })
          : await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: params.toString(),
              signal: AbortSignal.timeout(30000),
            });
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        if (retry && isRetryableStatus(res.status) && attempt < attempts) {
          lastErr = new GraphApiError(`graph HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
          await backoff(attempt);
          continue;
        }
        throw new GraphApiError(`graph HTTP ${res.status}: ${body.slice(0, 500)}`, res.status);
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      // Network/abort errors are retryable when retry is on.
      if (retry && attempt < attempts && (aborted || !(e instanceof GraphApiError))) {
        await backoff(attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new GraphApiError("graph call failed", 0);
}

// ─── Container creation ──────────────────────────────────────────────────────

/** POST /{ig-user-id}/media for a single image. Returns the creation (container) id. */
export async function createImageContainer(env: IgEnv, imageUrl: string, caption?: string): Promise<string> {
  const params: Record<string, string> = { image_url: imageUrl };
  if (caption) params.caption = caption;
  const data = await graphFetch(`/${env.igUserId}/media`, { method: "POST", params }, env);
  return String(data.id);
}

/** POST /{ig-user-id}/media with is_carousel_item=true — one carousel child. */
export async function createCarouselItemContainer(env: IgEnv, imageUrl: string): Promise<string> {
  const data = await graphFetch(
    `/${env.igUserId}/media`,
    { method: "POST", params: { image_url: imageUrl, is_carousel_item: "true" } },
    env,
  );
  return String(data.id);
}

/** POST /{ig-user-id}/media with media_type=CAROUSEL + children CSV. */
export async function createCarouselContainer(env: IgEnv, children: string[], caption: string): Promise<string> {
  const data = await graphFetch(
    `/${env.igUserId}/media`,
    { method: "POST", params: { media_type: "CAROUSEL", children: children.join(","), caption } },
    env,
  );
  return String(data.id);
}

/** POST /{ig-user-id}/media with media_type=REELS for a video Reel. */
export async function createReelContainer(env: IgEnv, videoUrl: string, caption: string, coverUrl?: string): Promise<string> {
  const params: Record<string, string> = { media_type: "REELS", video_url: videoUrl, caption };
  if (coverUrl) params.cover_url = coverUrl;
  const data = await graphFetch(`/${env.igUserId}/media`, { method: "POST", params }, env);
  return String(data.id);
}

/**
 * GET /{creation-id}?fields=status_code — poll until FINISHED or ERROR (or the
 * cap). status_code ∈ EXPIRED|ERROR|FINISHED|IN_PROGRESS|PUBLISHED. Image
 * containers finish almost immediately; Reels can take minutes. Throws on ERROR/
 * EXPIRED/timeout so the caller records `failed` (never publishes a bad container).
 */
export async function waitForContainer(env: IgEnv, creationId: string, timeoutMs = POLL_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const data = await graphFetch(`/${creationId}`, { method: "GET", params: { fields: "status_code,status" } }, env);
    const code = String(data.status_code ?? "");
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new GraphApiError(`container ${creationId} status=${code}: ${String(data.status ?? "")}`, 0);
    }
    if (Date.now() >= deadline) {
      throw new GraphApiError(`container ${creationId} not FINISHED within ${Math.round(timeoutMs / 1000)}s (last status=${code || "unknown"})`, 0);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * POST /{ig-user-id}/media_publish — publish a FINISHED container. retry=false:
 * a successful-but-slow publish must NOT be re-sent (it would double-post). The
 * caller treats a network error here as "unknown outcome" and does NOT retry.
 */
export async function publishContainer(env: IgEnv, creationId: string): Promise<string> {
  const data = await graphFetch(`/${env.igUserId}/media_publish`, { method: "POST", params: { creation_id: creationId } }, env, false);
  return String(data.id);
}

/** GET /{media-id}?fields=permalink. Best-effort — a missing permalink is not fatal. */
export async function fetchPermalink(env: IgEnv, mediaId: string): Promise<string | null> {
  try {
    const data = await graphFetch(`/${mediaId}`, { method: "GET", params: { fields: "permalink" } }, env);
    return typeof data.permalink === "string" ? data.permalink : null;
  } catch {
    return null;
  }
}

/** POST /{media-id}/comments — post the first comment (hashtags convention). */
export async function publishFirstComment(env: IgEnv, mediaId: string, text: string): Promise<string | null> {
  try {
    const data = await graphFetch(`/${mediaId}/comments`, { method: "POST", params: { message: text } }, env);
    return typeof data.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

/**
 * GET /{ig-user-id}/content_publishing_limit — the rolling 25-posts/24h quota.
 * Returns { quota, used, remaining } or null when the call fails / not configured.
 */
export async function contentPublishingLimit(env?: IgEnv): Promise<{ quota: number; used: number; remaining: number } | null> {
  const e = env ?? igEnv();
  if (!e) return null;
  try {
    const data = await graphFetch(
      `/${e.igUserId}/content_publishing_limit`,
      { method: "GET", params: { fields: "config,quota_usage" } },
      e,
    );
    const arr = (data.data as Array<Record<string, unknown>> | undefined) ?? [];
    const row = arr[0] ?? {};
    const cfg = (row.config as { quota_total?: number } | undefined) ?? {};
    const quota = typeof cfg.quota_total === "number" ? cfg.quota_total : 25;
    const used = typeof row.quota_usage === "number" ? (row.quota_usage as number) : 0;
    return { quota, used, remaining: Math.max(0, quota - used) };
  } catch {
    return null;
  }
}

// ─── Orchestration ─────────────────────────────────────────────────────────

/**
 * Publish a SocialPostDraft end-to-end. Signs media URLs, creates the right
 * container(s), waits for FINISHED, publishes, then posts the first comment and
 * fetches the permalink.
 *
 * Idempotent retry: `alreadyCreated` maps inboxItemId → creationId for children
 * already created on a prior attempt (a carousel that partially succeeded), so
 * a retry skips re-creating them. The successful media_publish itself is never
 * retried (returned in the result; the route persists it).
 */
export async function publishPost(
  draft: SocialPostDraft,
  opts: { alreadyCreated?: Record<string, string> } = {},
): Promise<SocialPublishResult> {
  const env = igEnv();
  if (!env) return notConfigured("instagram", "IG_USER_ID / META_ACCESS_TOKEN not set");
  if (draft.media.length === 0) {
    return { channel: "instagram", ok: false, status: "failed", permalink: null, platformPostId: null, error: "no media" };
  }

  const already = opts.alreadyCreated ?? {};
  const createdChildren: { inboxItemId: string; creationId: string }[] = [];

  try {
    // Pre-flight quota: never start a publish that would exceed the 25/24h cap.
    const limit = await contentPublishingLimit(env);
    if (limit && limit.remaining <= 0) {
      return { channel: "instagram", ok: false, status: "failed", permalink: null, platformPostId: null, error: `Instagram publishing limit reached (${limit.used}/${limit.quota} in 24h).` };
    }

    let containerId: string;

    if (draft.kind === "carousel") {
      const childIds: string[] = [];
      for (const m of draft.media) {
        if (already[m.inboxItemId]) {
          childIds.push(already[m.inboxItemId]);
          createdChildren.push({ inboxItemId: m.inboxItemId, creationId: already[m.inboxItemId] });
          continue;
        }
        const url = await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC);
        if (!url) return failWith(createdChildren, `could not sign media URL for item ${m.inboxItemId}`);
        const child = await createCarouselItemContainer(env, url);
        createdChildren.push({ inboxItemId: m.inboxItemId, creationId: child });
        childIds.push(child);
      }
      // Each child must reach FINISHED before the parent carousel is created.
      for (const c of childIds) await waitForContainer(env, c);
      containerId = await createCarouselContainer(env, childIds, draft.caption);
    } else if (draft.kind === "video") {
      const m = draft.media[0];
      const url = await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC);
      if (!url) return failWith(createdChildren, "could not sign video URL");
      containerId = await createReelContainer(env, url, draft.caption);
    } else {
      const m = draft.media[0];
      const url = await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC);
      if (!url) return failWith(createdChildren, "could not sign image URL");
      containerId = await createImageContainer(env, url, draft.caption);
    }

    // Wait for the (parent) container to finish, then publish.
    await waitForContainer(env, containerId);
    const mediaId = await publishContainer(env, containerId);

    // Post the first comment (hashtags) — best-effort, never fails the publish.
    let firstCommentId: string | null = null;
    if (draft.firstComment && draft.firstComment.trim()) {
      firstCommentId = await publishFirstComment(env, mediaId, draft.firstComment.trim());
    }
    const permalink = await fetchPermalink(env, mediaId);

    return {
      channel: "instagram",
      ok: true,
      status: "published",
      permalink,
      platformPostId: mediaId,
      firstCommentId,
      error: null,
      createdChildren: createdChildren.length ? createdChildren : undefined,
    };
  } catch (e) {
    return failWith(createdChildren, (e as Error).message);
  }
}

/** Build a failed result, carrying any children already created for retry. */
function failWith(createdChildren: { inboxItemId: string; creationId: string }[], error: string): SocialPublishResult {
  return {
    channel: "instagram",
    ok: false,
    status: "failed",
    permalink: null,
    platformPostId: null,
    error,
    createdChildren: createdChildren.length ? createdChildren : undefined,
  };
}

/**
 * Return the exact request sequence publishPost WOULD make, with the real signed
 * media URLs, WITHOUT calling the API. Access tokens are never included. Used by
 * the /dryrun action so the founder can inspect the plan before approving.
 */
export async function dryRun(draft: SocialPostDraft): Promise<DryRunResult> {
  const env = igEnv();
  const configured = env !== null;
  const steps: DryRunStep[] = [];
  const notes: string[] = [];
  const igUserId = env?.igUserId ?? "{IG_USER_ID}";

  if (!configured) notes.push("IG_USER_ID / META_ACCESS_TOKEN not set — a real publish would return not_configured.");

  // Sign the media URLs so the plan shows exactly what Meta would fetch.
  const signed: (string | null)[] = await Promise.all(draft.media.map((m) => signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC)));
  signed.forEach((u, i) => {
    if (!u) notes.push(`item ${i + 1}: could not sign a media URL (Storage/DB absent) — a real publish would fail here.`);
  });

  steps.push({ method: "GET", endpoint: `${GRAPH_BASE}/${igUserId}/content_publishing_limit?fields=config,quota_usage`, payload: null, note: "Pre-flight the 25-posts/24h publishing limit." });

  if (draft.kind === "carousel") {
    draft.media.forEach((m, i) => {
      steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/${igUserId}/media`, payload: { image_url: signed[i] ?? "{signed_url}", is_carousel_item: true }, note: `Create carousel child ${i + 1} (inbox item ${m.inboxItemId}).` });
    });
    steps.push({ method: "GET", endpoint: `${GRAPH_BASE}/{child-creation-id}?fields=status_code`, payload: null, note: "Poll each child until FINISHED." });
    steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/${igUserId}/media`, payload: { media_type: "CAROUSEL", children: "{child ids CSV}", caption: draft.caption }, note: "Create the parent CAROUSEL container." });
  } else if (draft.kind === "video") {
    steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/${igUserId}/media`, payload: { media_type: "REELS", video_url: signed[0] ?? "{signed_url}", caption: draft.caption }, note: `Create the REELS container (inbox item ${draft.media[0]?.inboxItemId}).` });
  } else {
    steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/${igUserId}/media`, payload: { image_url: signed[0] ?? "{signed_url}", caption: draft.caption }, note: `Create the image container (inbox item ${draft.media[0]?.inboxItemId}).` });
  }

  steps.push({ method: "GET", endpoint: `${GRAPH_BASE}/{creation-id}?fields=status_code`, payload: null, note: "Poll the container until FINISHED (cap ~4min for Reels)." });
  steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/${igUserId}/media_publish`, payload: { creation_id: "{creation-id}" }, note: "Publish the container (NEVER retried — double-post risk)." });
  if (draft.firstComment && draft.firstComment.trim()) {
    steps.push({ method: "POST", endpoint: `${GRAPH_BASE}/{media-id}/comments`, payload: { message: draft.firstComment.trim() }, note: "Post the first comment (hashtags)." });
  }
  steps.push({ method: "GET", endpoint: `${GRAPH_BASE}/{media-id}?fields=permalink`, payload: null, note: "Fetch the public permalink." });

  return { channel: "instagram", configured, steps, notes };
}
