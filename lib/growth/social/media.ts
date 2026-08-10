/**
 * InBharat Growth Agent — Social publishing: Inbox → media pipeline.
 *
 * CORE DESIGN RULE: a social post's visuals come from the Growth Engine Inbox.
 * The uploaded assets ARE the post; nothing is AI-invented. This module turns
 * inbox rows / folders into ordered, channel-validated media lists and signs
 * short-lived HTTPS URLs the platform APIs can fetch.
 *
 * What CAN be validated server-side from a growth_inbox_items row: file
 * extension, mime (from original_name), byte size (from storage metadata),
 * carousel item count. What CANNOT (without ffprobe / decoding bytes): exact
 * pixel dimensions, aspect ratio, and video duration. Those are returned as
 * `unverified` issues — an honest "we couldn't check this" rather than a false
 * pass/fail. The founder reviews the preview before approving, and the platform
 * itself rejects a truly invalid asset at container time (surfaced as `failed`).
 *
 * Signed URLs reuse the SAME Supabase Storage helper the inbox GET handler uses
 * (supabaseAdmin.storage.from(INBOX_BUCKET).createSignedUrl) — Instagram/LinkedIn
 * fetch media by public HTTPS URL, so the URL must outlive container creation
 * (default 1h vs the inbox preview's 5min).
 *
 * Server-only. Never throws on the validation path (returns issues); signing can
 * return null when Storage/DB is absent (honest degradation).
 */
import { supabaseAdmin } from "../../../api/lib/supabaseAdmin.js";
import { INBOX_BUCKET, sanitizeFolder } from "../inbox.js";
import type {
  SocialChannel,
  SocialPostKind,
  SocialMediaItem,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

/** Default signed-URL lifetime (seconds). Graph API container creation +
 *  FINISHED polling for a video can take minutes; 1h gives ample headroom. */
export const DEFAULT_MEDIA_URL_TTL_SEC = 60 * 60;

/** Instagram image container accepts JPEG/PNG fetched by URL. (Heic/webp are
 *  NOT accepted by the media container endpoint.) */
const IG_IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);
const IG_IMAGE_EXT = new Set(["jpg", "jpeg", "png"]);
/** Instagram video (Reel) container accepts MP4/MOV. */
const IG_VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);
const IG_VIDEO_EXT = new Set(["mp4", "mov"]);

/** Carousel bounds (Instagram: 2–10 items). */
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

/** Instagram video hard limits (what platform docs state; we can only check size). */
export const IG_VIDEO_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
/** Documented Reel duration window (3s–15min) — NOT checkable without ffprobe. */
export const IG_REEL_MIN_SEC = 3;
export const IG_REEL_MAX_SEC = 15 * 60;

/** The subset of a growth_inbox_items row this module needs. */
export interface InboxMediaRow {
  id: string;
  storage_path: string;
  kind: string;
  original_name: string | null;
  folder?: string | null;
  post_order?: number | null;
  alt_text?: string | null;
  /** Byte size when known (from Storage metadata); null when not fetched. */
  sizeBytes?: number | null;
}

/** Lowercased file extension from a name/path ('' when none). */
function extOf(name: string | null | undefined): string {
  if (!name) return "";
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Best-effort mime guess from an extension (the inbox stores no mime column;
 *  original_name carries the extension the founder uploaded). */
function mimeFromExt(ext: string): string | null {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "webm":
      return "video/webm";
    default:
      return null;
  }
}

/**
 * Validate a single inbox item for a channel + post kind. Instagram-focused
 * (the only channel with hard container constraints today); LinkedIn accepts a
 * broader set, so its checks are lighter. Returns `unverified` issues for
 * anything not knowable from the row alone (aspect ratio, duration, exact size
 * when Storage metadata wasn't loaded).
 *
 * Never throws. The caller aggregates per-item results for a carousel.
 */
export function validateForChannel(
  item: InboxMediaRow,
  channel: SocialChannel,
  kind: SocialPostKind,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ext = extOf(item.original_name || item.storage_path);
  const mime = mimeFromExt(ext);
  const isVideoKind = kind === "video";

  if (channel === "instagram") {
    if (isVideoKind) {
      const extOk = IG_VIDEO_EXT.has(ext);
      const mimeOk = mime ? IG_VIDEO_MIME.has(mime) : false;
      if (!extOk && !mimeOk) {
        issues.push({ level: "error", code: "unsupported_video", message: `Instagram Reels accept MP4/MOV; got .${ext || "?"}.` });
      }
      if (typeof item.sizeBytes === "number") {
        if (item.sizeBytes > IG_VIDEO_MAX_BYTES) {
          issues.push({ level: "error", code: "video_too_large", message: `Video is ${(item.sizeBytes / 1e9).toFixed(2)} GB; Instagram max is 1 GB.` });
        }
      } else {
        issues.push({ level: "unverified", code: "video_size_unverified", message: "Byte size not loaded from Storage — size ≤1GB not verified server-side." });
      }
      // Duration + aspect ratio need ffprobe / decoding — cannot verify here.
      issues.push({ level: "unverified", code: "video_duration_unverified", message: `Reel duration (${IG_REEL_MIN_SEC}s–${IG_REEL_MAX_SEC / 60}min) and 9:16 aspect ratio can't be checked without ffprobe; the platform validates at container time.` });
    } else {
      // image / carousel item.
      const extOk = IG_IMAGE_EXT.has(ext);
      const mimeOk = mime ? IG_IMAGE_MIME.has(mime) : false;
      if (!extOk && !mimeOk) {
        issues.push({ level: "error", code: "unsupported_image", message: `Instagram images accept JPEG/PNG; got .${ext || "?"}.` });
      }
      // Aspect ratio (4:5 … 1.91:1) needs pixel dimensions — not in the row.
      issues.push({ level: "unverified", code: "aspect_unverified", message: "Aspect ratio (4:5 … 1.91:1) needs image dimensions; not checkable from the inbox row — the platform validates at container time." });
    }
  } else {
    // LinkedIn: broad support. Only flag an obviously wrong kind/ext.
    if (isVideoKind) {
      if (!IG_VIDEO_EXT.has(ext) && ext !== "webm") {
        issues.push({ level: "unverified", code: "linkedin_video_mime", message: `LinkedIn video is typically MP4; got .${ext || "?"} — upload init will validate.` });
      }
    } else if (!["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      issues.push({ level: "unverified", code: "linkedin_image_mime", message: `Unexpected image extension .${ext || "?"} — LinkedIn upload will validate.` });
    }
  }

  const hasError = issues.some((i) => i.level === "error");
  const hasUnverified = issues.some((i) => i.level === "unverified");
  return { ok: !hasError, unverified: !hasError && hasUnverified, issues };
}

/**
 * Validate a whole post's media set (carousel count + per-item checks).
 * Aggregates every item's issues, prefixing the item index so the admin UI can
 * point at the offending slot.
 */
export function validatePostMedia(
  items: InboxMediaRow[],
  channel: SocialChannel,
  kind: SocialPostKind,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (items.length === 0) {
    issues.push({ level: "error", code: "no_media", message: "A social post needs at least one inbox item — visuals come from the Inbox." });
    return { ok: false, unverified: false, issues };
  }
  if (kind === "carousel") {
    if (items.length < CAROUSEL_MIN || items.length > CAROUSEL_MAX) {
      issues.push({ level: "error", code: "carousel_count", message: `A carousel needs ${CAROUSEL_MIN}–${CAROUSEL_MAX} items; got ${items.length}.` });
    }
  } else if (items.length !== 1) {
    issues.push({ level: "error", code: "single_media", message: `A ${kind} post takes exactly 1 item; got ${items.length}.` });
  }

  items.forEach((it, idx) => {
    // For a carousel each item is validated as an image (carousel is images).
    const itemKind: SocialPostKind = kind === "carousel" ? "image" : kind;
    const r = validateForChannel(it, channel, itemKind);
    for (const iss of r.issues) {
      issues.push({ ...iss, message: `item ${idx + 1} (${it.original_name ?? it.storage_path}): ${iss.message}` });
    }
  });

  const hasError = issues.some((i) => i.level === "error");
  const hasUnverified = issues.some((i) => i.level === "unverified");
  return { ok: !hasError, unverified: !hasError && hasUnverified, issues };
}

/**
 * Sign a short-lived HTTPS URL for a Storage object so a platform API can fetch
 * it. Reuses the SAME helper the inbox GET handler uses. Returns null when
 * Storage/DB is absent or signing fails (honest degradation — the caller
 * surfaces a `failed`/`not_configured` result rather than throwing).
 */
export async function signedMediaUrl(
  storagePath: string,
  expiresSec: number = DEFAULT_MEDIA_URL_TTL_SEC,
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(INBOX_BUCKET)
      .createSignedUrl(storagePath, expiresSec);
    if (error || !data) return null;
    return (data as { signedUrl?: string } | null)?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Sign the effective URL for a media slot (rendition preferred over original). */
export async function signMediaItem(
  item: SocialMediaItem,
  expiresSec: number = DEFAULT_MEDIA_URL_TTL_SEC,
): Promise<string | null> {
  const path = item.renditionPath || item.storagePath;
  return signedMediaUrl(path, expiresSec);
}

/**
 * Turn an inbox folder into an ordered media list. Orders by `post_order`
 * ascending (nulls last), then by created_at ascending as a stable fallback so
 * a folder with no explicit ordering still yields a deterministic sequence.
 * Only image/video items are returned (md/txt drops aren't post media).
 *
 * Reads the Phase-B columns (folder/post_order/alt_text). Falls back to the
 * legacy column set when a column is missing on the live DB (mirrors the inbox
 * GET handler's degrade path) so composing works pre-migration (order = created_at,
 * alt = "").
 *
 * Never throws; returns [] when the DB is absent / the folder is empty.
 */
export async function orderedCarousel(folder: string): Promise<InboxMediaRow[]> {
  if (!supabaseAdmin) return [];
  const folderSeg = sanitizeFolder(folder);
  try {
    const FULL = "id,storage_path,kind,original_name,folder,post_order,alt_text,created_at";
    const LEGACY = "id,storage_path,kind,original_name,created_at";
    let rows: Record<string, unknown>[] = [];
    const full = await supabaseAdmin
      .from("growth_inbox_items")
      .select(FULL)
      .eq("folder", folderSeg)
      .in("kind", ["image", "video"])
      .order("post_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(CAROUSEL_MAX * 2);
    if (full.error) {
      // post_order / alt_text / folder column absent → legacy order by created_at.
      const legacy = await supabaseAdmin
        .from("growth_inbox_items")
        .select(LEGACY)
        .in("kind", ["image", "video"])
        .order("created_at", { ascending: true })
        .limit(CAROUSEL_MAX * 2);
      if (legacy.error) return [];
      rows = (legacy.data ?? []) as Record<string, unknown>[];
    } else {
      rows = (full.data ?? []) as Record<string, unknown>[];
    }
    return rows.map((r) => ({
      id: String(r.id),
      storage_path: String(r.storage_path),
      kind: String(r.kind),
      original_name: (r.original_name as string | null) ?? null,
      folder: (r.folder as string | null) ?? folderSeg,
      post_order: typeof r.post_order === "number" ? (r.post_order as number) : null,
      alt_text: (r.alt_text as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Build ordered SocialMediaItem[] from inbox rows (carrying alt text + kind). */
export function toMediaItems(rows: InboxMediaRow[]): SocialMediaItem[] {
  return rows.map((r) => ({
    inboxItemId: r.id,
    storagePath: r.storage_path,
    renditionPath: null,
    alt: r.alt_text ?? "",
    originalName: r.original_name,
    kind: r.kind === "video" ? "video" : "image",
  }));
}
