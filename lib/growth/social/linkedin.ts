/**
 * InBharat Growth Agent — LinkedIn Posts API client.
 *
 * The REAL API path for LinkedIn (the deep-link share flow in api/growth/publish.ts
 * stays as a documented, zero-infra fallback — this client does NOT replace or
 * delete it; it is an additional, richer path that posts natively via the API).
 *
 * Posts API on rest.linkedin.com with the versioned header LinkedIn-Version
 * (pinned to LINKEDIN_VERSION). Text, image (single or multi-image), and video
 * posts. Image/video bytes are streamed from Supabase Storage via a signed URL
 * into LinkedIn's uploaded-media URL (initializeUpload → PUT bytes → create post
 * referencing the returned media URN).
 *
 * The author URN decides personal vs company posting:
 *   urn:li:person:xxxx        → personal profile post (needs w_member_social)
 *   urn:li:organization:xxxx  → company page post   (needs w_organization_social)
 *
 * Honest degradation: missing env → typed `not_configured`. dryRun() returns the
 * exact request sequence (real signed URLs, tokens omitted) without calling the
 * API. Retries 429/5xx (max 3); never retries the post-create after it succeeds.
 *
 * Env (server-only, never in the browser bundle):
 *   LINKEDIN_ACCESS_TOKEN — a valid OAuth access token (3-legged)
 *   LINKEDIN_AUTHOR_URN   — urn:li:person:... or urn:li:organization:...
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

/** Pinned LinkedIn API version (YYYYMM). Bump deliberately. */
export const LINKEDIN_VERSION = "202506";
const REST_BASE = "https://api.linkedin.com/rest";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

interface LiEnv {
  accessToken: string;
  authorUrn: string;
  /** True when the author URN is an organization (company page). */
  isOrg: boolean;
}

export function linkedinEnv(): LiEnv | null {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN;
  if (!accessToken || !authorUrn) return null;
  if (accessToken.includes("your-") || authorUrn.includes("your-")) return null;
  const isOrg = authorUrn.includes(":organization:");
  return { accessToken, authorUrn, isOrg };
}

export function isLinkedInConfigured(): boolean {
  return linkedinEnv() !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
async function backoff(attempt: number): Promise<void> {
  await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 250));
}

export class LinkedInApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
  }
}

/** Standard headers for a REST call (token + version + Restli protocol). */
function liHeaders(env: LiEnv, extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${env.accessToken}`,
    "linkedin-version": LINKEDIN_VERSION,
    "x-restli-protocol-version": "2.0.0",
    ...extra,
  };
}

/**
 * JSON REST call with retry on 429/5xx. `retry=false` for post-create so a
 * successful-but-slow create is never re-sent. Throws LinkedInApiError with the
 * body on failure. Returns { json, headers } so callers can read x-restli-id.
 */
async function liFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string> },
  env: LiEnv,
  retry = true,
): Promise<{ json: Record<string, unknown>; headers: Headers }> {
  const url = `${REST_BASE}${path}`;
  const attempts = retry ? MAX_RETRIES : 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: liHeaders(env, { "content-type": "application/json", ...(init.headers ?? {}) }),
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        if (retry && isRetryableStatus(res.status) && attempt < attempts) {
          lastErr = new LinkedInApiError(`linkedin HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
          await backoff(attempt);
          continue;
        }
        throw new LinkedInApiError(`linkedin HTTP ${res.status}: ${body.slice(0, 500)}`, res.status);
      }
      // Some create endpoints return 201 with an empty body + the id in a header.
      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      return { json, headers: res.headers };
    } catch (e) {
      lastErr = e;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      if (retry && attempt < attempts && (aborted || !(e instanceof LinkedInApiError))) {
        await backoff(attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new LinkedInApiError("linkedin call failed", 0);
}

/** The post's public permalink, derived from the returned post URN. LinkedIn
 *  does not always return a browsable URL, so we build the canonical feed URL. */
function permalinkFromUrn(urn: string): string {
  // urn:li:share:123 / urn:li:ugcPost:123 → https://www.linkedin.com/feed/update/<urn>
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`;
}

/** Extract the created post URN from the response (header first, then body). */
function postUrnFrom(headers: Headers, json: Record<string, unknown>): string | null {
  const hdr = headers.get("x-restli-id") || headers.get("x-linkedin-id");
  if (hdr) return hdr;
  if (typeof json.id === "string") return json.id;
  return null;
}

// ─── Media upload (image / video) ────────────────────────────────────────────

/**
 * initializeUpload → returns { uploadUrl, imageUrn } (or videoUrn). Posts API:
 *   POST /images?action=initializeUpload  { initializeUploadRequest: { owner } }
 *   POST /videos?action=initializeUpload  { initializeUploadRequest: { owner, fileSizeBytes, ... } }
 */
export async function initializeImageUpload(env: LiEnv): Promise<{ uploadUrl: string; urn: string }> {
  const { json } = await liFetch(
    `/images?action=initializeUpload`,
    { method: "POST", body: { initializeUploadRequest: { owner: env.authorUrn } } },
    env,
  );
  const value = (json.value as { uploadUrl?: string; image?: string } | undefined) ?? {};
  if (!value.uploadUrl || !value.image) throw new LinkedInApiError("image initializeUpload returned no uploadUrl/urn", 0);
  return { uploadUrl: value.uploadUrl, urn: value.image };
}

export async function initializeVideoUpload(env: LiEnv, fileSizeBytes: number): Promise<{ uploadUrl: string; urn: string }> {
  const { json } = await liFetch(
    `/videos?action=initializeUpload`,
    { method: "POST", body: { initializeUploadRequest: { owner: env.authorUrn, fileSizeBytes, uploadCaptions: false, uploadThumbnail: false } } },
    env,
  );
  const value = (json.value as { uploadInstructions?: Array<{ uploadUrl?: string }>; video?: string } | undefined) ?? {};
  const uploadUrl = value.uploadInstructions?.[0]?.uploadUrl;
  if (!uploadUrl || !value.video) throw new LinkedInApiError("video initializeUpload returned no uploadUrl/urn", 0);
  return { uploadUrl, urn: value.video };
}

/**
 * Stream bytes from a Supabase Storage signed URL and PUT them to LinkedIn's
 * upload URL. The bytes never buffer through disk here — we fetch the signed URL
 * and pipe the body to the PUT. Returns nothing on success; throws on failure.
 */
export async function uploadBytesFromSignedUrl(uploadUrl: string, signedSourceUrl: string, env: LiEnv): Promise<void> {
  const src = await fetch(signedSourceUrl, { signal: AbortSignal.timeout(60000) });
  if (!src.ok || !src.body) throw new LinkedInApiError(`could not fetch source media (HTTP ${src.status})`, src.status);
  const bytes = new Uint8Array(await src.arrayBuffer());
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${env.accessToken}`, "content-type": src.headers.get("content-type") ?? "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (!put.ok) {
    const body = await put.text().catch(() => "<unreadable>");
    throw new LinkedInApiError(`media byte upload failed (HTTP ${put.status}): ${body.slice(0, 300)}`, put.status);
  }
}

// ─── Post creation ───────────────────────────────────────────────────────────

/** POST /posts with a plain-text commentary (no media). */
export async function createTextPost(env: LiEnv, caption: string): Promise<SocialPublishResult> {
  const body = {
    author: env.authorUrn,
    commentary: caption,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const { json, headers } = await liFetch(`/posts`, { method: "POST", body }, env, false);
  const urn = postUrnFrom(headers, json);
  return {
    channel: "linkedin",
    ok: !!urn,
    status: urn ? "published" : "failed",
    permalink: urn ? permalinkFromUrn(urn) : null,
    platformPostId: urn,
    error: urn ? null : "post created but no URN returned",
  };
}

/**
 * Create an image (single) or multiImage post. `media` carries the uploaded
 * image URNs + alt text (in the same order as the inbox media). Single image →
 * `content.media`; 2+ → `content.multiImage`.
 */
export async function createImagePost(
  env: LiEnv,
  caption: string,
  media: { urn: string; alt: string }[],
): Promise<SocialPublishResult> {
  const content =
    media.length === 1
      ? { media: { id: media[0].urn, altText: media[0].alt || undefined } }
      : { multiImage: { images: media.map((m) => ({ id: m.urn, altText: m.alt || undefined })) } };
  const body = {
    author: env.authorUrn,
    commentary: caption,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content,
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const { json, headers } = await liFetch(`/posts`, { method: "POST", body }, env, false);
  const urn = postUrnFrom(headers, json);
  return {
    channel: "linkedin",
    ok: !!urn,
    status: urn ? "published" : "failed",
    permalink: urn ? permalinkFromUrn(urn) : null,
    platformPostId: urn,
    error: urn ? null : "post created but no URN returned",
  };
}

/** Create a video post referencing an uploaded video URN. */
export async function createVideoPost(env: LiEnv, caption: string, videoUrn: string, alt: string): Promise<SocialPublishResult> {
  const body = {
    author: env.authorUrn,
    commentary: caption,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: videoUrn, altText: alt || undefined } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const { json, headers } = await liFetch(`/posts`, { method: "POST", body }, env, false);
  const urn = postUrnFrom(headers, json);
  return {
    channel: "linkedin",
    ok: !!urn,
    status: urn ? "published" : "failed",
    permalink: urn ? permalinkFromUrn(urn) : null,
    platformPostId: urn,
    error: urn ? null : "post created but no URN returned",
  };
}

/**
 * Publish a SocialPostDraft end-to-end. Uploads each image/video from its signed
 * Supabase Storage URL, then creates the post. Never retries the final post-create
 * after it succeeds (the upload steps are idempotent — a fresh URN each attempt).
 */
export async function publishPost(draft: SocialPostDraft): Promise<SocialPublishResult> {
  const env = linkedinEnv();
  if (!env) return notConfigured("linkedin", "LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN not set");
  try {
    if (draft.kind === "video") {
      const m = draft.media[0];
      const srcUrl = await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC);
      if (!srcUrl) return { channel: "linkedin", ok: false, status: "failed", permalink: null, platformPostId: null, error: "could not sign video URL" };
      // fileSizeBytes: LinkedIn wants it up front; we don't know it from the row,
      // so fetch the source HEAD to read content-length (best-effort → 0 lets the
      // API infer where allowed). Surface as unverified in dryRun, not here.
      const size = await sourceContentLength(srcUrl);
      const { uploadUrl, urn } = await initializeVideoUpload(env, size);
      await uploadBytesFromSignedUrl(uploadUrl, srcUrl, env);
      return await createVideoPost(env, draft.caption, urn, m.alt);
    }

    if (draft.media.length === 0) {
      return await createTextPost(env, draft.caption);
    }

    // image / carousel (multiImage). Upload each image, collect URNs + alt.
    const uploaded: { urn: string; alt: string }[] = [];
    for (const m of draft.media) {
      const srcUrl = await signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC);
      if (!srcUrl) return { channel: "linkedin", ok: false, status: "failed", permalink: null, platformPostId: null, error: `could not sign media URL for item ${m.inboxItemId}` };
      const { uploadUrl, urn } = await initializeImageUpload(env);
      await uploadBytesFromSignedUrl(uploadUrl, srcUrl, env);
      uploaded.push({ urn, alt: m.alt });
    }
    return await createImagePost(env, draft.caption, uploaded);
  } catch (e) {
    return { channel: "linkedin", ok: false, status: "failed", permalink: null, platformPostId: null, error: (e as Error).message };
  }
}

/** Best-effort content-length of a source URL (for video initializeUpload). */
async function sourceContentLength(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    const len = Number(head.headers.get("content-length"));
    return Number.isFinite(len) && len > 0 ? len : 0;
  } catch {
    return 0;
  }
}

/**
 * Return the exact request sequence publishPost WOULD make, with real signed
 * source URLs, WITHOUT calling the API. Access tokens are never included.
 */
export async function dryRun(draft: SocialPostDraft): Promise<DryRunResult> {
  const env = linkedinEnv();
  const configured = env !== null;
  const author = env?.authorUrn ?? "{LINKEDIN_AUTHOR_URN}";
  const steps: DryRunStep[] = [];
  const notes: string[] = [];
  if (!configured) notes.push("LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN not set — a real publish would return not_configured.");
  else notes.push(env!.isOrg ? "Author URN is an organization → company page post (needs w_organization_social)." : "Author URN is a person → personal post (needs w_member_social).");

  const signed: (string | null)[] = await Promise.all(draft.media.map((m) => signMediaItem(m, DEFAULT_MEDIA_URL_TTL_SEC)));
  signed.forEach((u, i) => {
    if (!u) notes.push(`item ${i + 1}: could not sign a source URL (Storage/DB absent) — a real publish would fail here.`);
  });

  if (draft.kind === "video") {
    steps.push({ method: "POST", endpoint: `${REST_BASE}/videos?action=initializeUpload`, payload: { initializeUploadRequest: { owner: author, fileSizeBytes: "{content-length}" } }, note: "Initialize a video upload; returns an uploadUrl + video URN." });
    steps.push({ method: "PUT", endpoint: "{linkedin uploadUrl}", payload: { source: signed[0] ?? "{signed_url}" }, note: `Stream video bytes from the signed Storage URL (inbox item ${draft.media[0]?.inboxItemId}).` });
    steps.push({ method: "POST", endpoint: `${REST_BASE}/posts`, payload: { author, commentary: draft.caption, content: { media: { id: "{video URN}", altText: draft.media[0]?.alt || undefined } } }, note: "Create the video post (NOT retried after success)." });
  } else if (draft.media.length === 0) {
    steps.push({ method: "POST", endpoint: `${REST_BASE}/posts`, payload: { author, commentary: draft.caption }, note: "Create a text-only post." });
  } else {
    draft.media.forEach((m, i) => {
      steps.push({ method: "POST", endpoint: `${REST_BASE}/images?action=initializeUpload`, payload: { initializeUploadRequest: { owner: author } }, note: `Initialize image upload ${i + 1} (inbox item ${m.inboxItemId}).` });
      steps.push({ method: "PUT", endpoint: "{linkedin uploadUrl}", payload: { source: signed[i] ?? "{signed_url}" }, note: `Stream image bytes from the signed Storage URL (item ${i + 1}).` });
    });
    const isMulti = draft.media.length > 1;
    steps.push({
      method: "POST",
      endpoint: `${REST_BASE}/posts`,
      payload: isMulti
        ? { author, commentary: draft.caption, content: { multiImage: { images: draft.media.map((m) => ({ id: "{image URN}", altText: m.alt || undefined })) } } }
        : { author, commentary: draft.caption, content: { media: { id: "{image URN}", altText: draft.media[0]?.alt || undefined } } },
      note: `Create the ${isMulti ? "multiImage" : "image"} post (NOT retried after success).`,
    });
  }

  return { channel: "linkedin", configured, steps, notes };
}
