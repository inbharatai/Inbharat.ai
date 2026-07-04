/**
 * InBharat Growth Agent — published-article body source for syndication.
 *
 * The canonical source of truth for a "Build with Reeturaj" article's body is
 * the file committed to the repo at `content/articles/<slug>.md` — that is the
 * exact markdown Vercel serves on www.inbharat.ai. The agent's raw draft body
 * (`growth_drafts.body_md`) is NOT the same thing: publish.ts strips citation
 * markers + sanitizes mermaid fences before committing, and the founder may
 * further edit the live .md after publish. Those refinements never flow back to
 * body_md. So syndicating body_md would ship a divergent, unpolished version to
 * DEV.to / Hashnode — defeating the point of canonical-based syndication (Google
 * attributes the original to www.inbharat.ai only when the cross-posted content
 * matches the canonical article).
 *
 * `fetchPublishedArticleBody(slug)` reads the published .md from the repo via
 * the GitHub contents API (raw accept → plain text, no base64 dance), using the
 * same GITHUB_TOKEN publish.ts already uses. It is the syndication analogue of
 * fetchReadme: never throws, structured errors only, server-only.
 *
 * No gate (assertAuthorized) — the cover repo is the org's OWN repo, not an
 * authorized-asset external repo; publish.ts already writes here ungated.
 */
import { COVER_REPO } from "../githubWrite.js";

const BRANCH = "main";

export interface PublishedBodyResult {
  ok: boolean;
  /** The raw published markdown body, present iff ok. */
  body?: string;
  error?: string;
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

function authHeaders(accept: string): Record<string, string> {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "inbharat-growth-agent" };
  const t = token();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/**
 * Fetch the PUBLISHED markdown body for `slug` from `content/articles/<slug>.md`
 * on the cover repo's main branch. Returns the raw markdown (already
 * citation-stripped + mermaid-sanitized by publish.ts at commit time). Caller
 * applies its own defense-in-depth clean before sending to a platform. Never
 * throws; GitHub 404/403/401/network all become structured errors.
 */
export async function fetchPublishedArticleBody(slug: string): Promise<PublishedBodyResult> {
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "invalid slug" };
  if (!token()) return { ok: false, error: "GITHUB_TOKEN not configured" };

  const path = `content/articles/${slug}.md`;
  const url = `https://api.github.com/repos/${COVER_REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: authHeaders("application/vnd.github.raw"),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { ok: false, error: "article .md not found in repo (not yet committed?)" };
    if (res.status === 403 || res.status === 401) return { ok: false, error: `github auth failed (${res.status})` };
    if (!res.ok) return { ok: false, error: `github HTTP ${res.status}` };
    const body = await res.text();
    if (!body.trim()) return { ok: false, error: "published body is empty" };
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: `article body fetch failed: ${(e as Error).message}` };
  }
}