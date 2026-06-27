/**
 * InBharat Growth Agent — Module: GitHub Contents API WRITE helpers.
 *
 * The cover-publish step commits a generated cover PNG + edits
 * content/articles.meta.ts (the `visual:` field) to inbharatai/Inbharat.ai.
 * The repo is connected to Vercel → the commit auto-triggers a rebuild so the
 * new cover ships without any manual deploy. The Growth Agent runs serverless
 * (read-only FS) so it CANNOT write the deployed file directly — GitHub is the
 * write path. Human-gated: the publish endpoint calls this only after the
 * founder clicks "Publish cover".
 *
 * Hardened vs. a naive Contents PUT:
 *   - Repo allow-list: only inbharatai/Inbharat.ai is ever written (defends
 *     against a misconfigured repo var clobbering the wrong project).
 *   - Push-permission precheck: GET /repos/{repo} → permissions.push; if false,
 *     return a structured 412-style error so the endpoint surfaces it (no
 *     silent commit failure). Verified once per process via a cache.
 *   - Binary (PNG) commits use raw base64 (no newline / no encoding pitfalls).
 *   - Text upsert GETs the existing file's sha (needed to update, not create).
 *   - Surfaces the GitHub error body on !res.ok (the same robustness principle as
 *     gemini.ts) so a 401/403/409 is diagnosable, not "github HTTP 403".
 *
 * Uses plain fetch (zero new deps; ESM-safe). Token from GITHUB_TOKEN (GH_TOKEN
 * fallback). Server-only. Never touches the chat backend.
 */
import { logInfo } from "./authorization.js";

/** The ONLY repo these helpers will ever write to. */
export const COVER_REPO = "inbharatai/Inbharat.ai";
/** Branch to commit to (the repo's default branch; Vercel watches it). */
const BRANCH = "main";

let pushPermissionCache: { ok: boolean; checkedAt: number; reason?: string } | null = null;
const PUSH_CACHE_TTL_MS = 5 * 60 * 1000; // re-check at most every 5 min

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

function authHeaders(accept: string): Record<string, string> {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "inbharat-growth-agent" };
  const t = token();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

export interface GithubWriteResult {
  ok: boolean;
  commitSha?: string;
  /** The blob path on the default branch (for the fileUrl / audit log). */
  path?: string;
  error?: string;
  /** True when the failure was a missing/insufficient token (so the endpoint can 412). */
  needsToken?: boolean;
}

/**
 * Confirm the configured token can push to COVER_REPO. Cached for PUSH_CACHE_TTL_MS.
 * Returns {ok:false, needsToken:true} when the token is missing or lacks push.
 * Never throws.
 */
export async function canPushToCoverRepo(): Promise<{ ok: boolean; reason?: string; needsToken?: boolean }> {
  if (!token()) return { ok: false, reason: "GITHUB_TOKEN not configured", needsToken: true };
  if (pushPermissionCache && Date.now() - pushPermissionCache.checkedAt < PUSH_CACHE_TTL_MS) {
    return { ok: pushPermissionCache.ok, reason: pushPermissionCache.reason };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${COVER_REPO}`, {
      headers: authHeaders("application/vnd.github+json"),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      pushPermissionCache = { ok: false, checkedAt: Date.now(), reason: `github auth failed (${res.status})` };
      return { ok: false, reason: pushPermissionCache.reason!, needsToken: true };
    }
    if (!res.ok) {
      pushPermissionCache = { ok: false, checkedAt: Date.now(), reason: `github HTTP ${res.status}` };
      return { ok: false, reason: pushPermissionCache.reason! };
    }
    const data = (await res.json()) as { permissions?: { push?: boolean; admin?: boolean } };
    const canPush = !!data.permissions?.push || !!data.permissions?.admin;
    pushPermissionCache = { ok: canPush, checkedAt: Date.now(), reason: canPush ? undefined : "token lacks push scope on the repo" };
    return { ok: canPush, reason: pushPermissionCache.reason, needsToken: !canPush };
  } catch (e) {
    pushPermissionCache = { ok: false, checkedAt: Date.now(), reason: `permission check failed: ${(e as Error).message}` };
    return { ok: false, reason: pushPermissionCache.reason! };
  }
}

/**
 * Commit a binary file (base64 content) to COVER_REPO. Creates or updates it
 * (fetches the existing sha first so an update succeeds). `path` is repo-relative
 * (e.g. "public/learn-ai-with-reeturaj/harness-engineering.png"). `base64` must be
 * raw base64 with no data: prefix and no newlines.
 */
export async function commitBinary(path: string, base64: string, message: string): Promise<GithubWriteResult> {
  const allowed = await canPushToCoverRepo();
  if (!allowed.ok) {
    return { ok: false, error: allowed.reason || "cannot push to cover repo", needsToken: allowed.needsToken };
  }
  const url = `https://api.github.com/repos/${COVER_REPO}/contents/${encodeURIComponent(path)}`;
  try {
    // Fetch existing sha (404 = new file, fine). Needed to update an existing file.
    let sha: string | undefined;
    const head = await fetch(`${url}?ref=${BRANCH}`, {
      headers: authHeaders("application/vnd.github+json"),
      signal: AbortSignal.timeout(15000),
    });
    if (head.ok) {
      const existing = (await head.json()) as { sha?: string };
      sha = existing.sha;
    } // 404 → new file, leave sha undefined

    const res = await fetch(url, {
      method: "PUT",
      headers: authHeaders("application/vnd.github+json"),
      body: JSON.stringify({ message, content: base64, branch: BRANCH, ...(sha ? { sha } : {}) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `github PUT ${path} HTTP ${res.status}: ${body.slice(0, 300)}`, path };
    }
    const data = (await res.json()) as { commit?: { sha?: string } };
    return { ok: true, commitSha: data.commit?.sha, path };
  } catch (e) {
    return { ok: false, error: `commitBinary ${path} failed: ${(e as Error).message}`, path };
  }
}

/**
 * Upsert a text file: GET current contents (+sha), call `edit(currentText)` to
 * produce the new text, then PUT. If `edit` returns null (no change needed),
 * no commit is made and {ok:true, skipped:true} is returned.
 */
export interface UpsertTextResult extends GithubWriteResult {
  skipped?: boolean;
}

export async function upsertText(
  path: string,
  edit: (current: string) => string | null,
  message: string,
): Promise<UpsertTextResult> {
  const allowed = await canPushToCoverRepo();
  if (!allowed.ok) {
    return { ok: false, error: allowed.reason || "cannot push to cover repo", needsToken: allowed.needsToken };
  }
  const url = `https://api.github.com/repos/${COVER_REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  try {
    const head = await fetch(url, {
      headers: authHeaders("application/vnd.github+json"),
      signal: AbortSignal.timeout(15000),
    });
    if (!head.ok) {
      const body = await readBody(head);
      return { ok: false, error: `github GET ${path} HTTP ${head.status}: ${body.slice(0, 300)}`, path };
    }
    const meta = (await head.json()) as { sha?: string; content?: string; encoding?: string };
    if (!meta.sha) return { ok: false, error: `github GET ${path}: no sha returned`, path };
    const raw = meta.encoding === "base64" && typeof meta.content === "string"
      ? Buffer.from(meta.content, "base64").toString("utf-8")
      : "";
    const next = edit(raw);
    if (next === null) return { ok: true, skipped: true, path };
    if (next === raw) return { ok: true, skipped: true, path };
    const res = await fetch(`https://api.github.com/repos/${COVER_REPO}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: authHeaders("application/vnd.github+json"),
      body: JSON.stringify({ message, content: Buffer.from(next, "utf-8").toString("base64"), branch: BRANCH, sha: meta.sha }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await readBody(res);
      return { ok: false, error: `github PUT ${path} HTTP ${res.status}: ${body.slice(0, 300)}`, path };
    }
    const data = (await res.json()) as { commit?: { sha?: string } };
    void logInfo("github-write-text", COVER_REPO, `committed ${path} (${message})`).catch(() => undefined);
    return { ok: true, commitSha: data.commit?.sha, path };
  } catch (e) {
    return { ok: false, error: `upsertText ${path} failed: ${(e as Error).message}`, path };
  }
}