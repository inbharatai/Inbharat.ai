/**
 * InBharat Growth Agent — Module: GitHub connect + private-read gate.
 *
 * Lets the agent verify a linked repo and read its README — including PRIVATE
 * repos under the founder's account (the account-wide GITHUB_TOKEN reaches them)
 * — EXCEPT any repo the registry denies. This is the first runtime caller of
 * isRepoAuthorized(), so the per-repo deny gate finally has teeth.
 *
 * HARD GATE at the top of every function: if !isRepoAuthorized(fullName), the
 * call is refused + logged to growth_agent_logs and returns {ok:false}. This
 * means RHCF-Seva (allowAgentRead=false, publicRepoStatus='do_not_use') is
 * denied here EVEN THOUGH the PAT could reach it — the deny is enforced, not
 * merely configured. The canonical healthcare repo Sahayaak Seva
 * (inbharatai/sahayaak-Seva) is authorized and readable.
 *
 * Uses plain fetch against the GitHub REST API (zero new deps; ESM-safe). The
 * token is read from GITHUB_TOKEN (fallback GH_TOKEN) and is NEVER sent to a
 * model — README text passes through redact() at the caller, never here.
 *
 * Server-only. Never touches the chat backend.
 */
import { isRepoAuthorized, logInfo } from "./authorization.js";
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export interface RepoVerifyResult {
  ok: boolean;
  defaultBranch?: string;
  lastCommitSha?: string;
  lastCommitAt?: string;
  openPrCount?: number;
  /** 'none' when the repo is authorized but has no open PRs. */
  lastPrState?: "open" | "closed" | "merged" | "none";
  error?: string;
  /** True when the deny gate refused the repo (distinct from a GitHub error). */
  denied?: boolean;
}

export interface ReadmeResult {
  ok: boolean;
  readme?: string;
  error?: string;
  denied?: boolean;
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

/** Enforce the per-repo deny gate. Returns true if the call may proceed. */
function gate(fullName: string, action: string): boolean {
  if (!isRepoAuthorized(fullName)) {
    void logInfo("github-deny", fullName, `refused ${action} (do_not_use or allowAgentRead=false)`);
    return false;
  }
  return true;
}

/**
 * Verify a repo is reachable + cache its latest commit/PR state to
 * growth_repo_registry (the columns added in the Phase 1A migration). Never
 * throws — GitHub 404/403/401 become structured errors.
 */
export async function verifyRepo(fullName: string): Promise<RepoVerifyResult> {
  if (!REPO_RE.test(fullName)) return { ok: false, error: "Invalid repo (expected owner/name)" };
  if (!gate(fullName, "verify")) return { ok: false, error: "repo not authorized", denied: true };
  if (!token()) return { ok: false, error: "GITHUB_TOKEN not configured" };

  const api = `https://api.github.com/repos/${fullName}`;
  try {
    const res = await fetch(api, { headers: authHeaders("application/vnd.github+json"), signal: AbortSignal.timeout(15000) });
    if (res.status === 404) return { ok: false, error: "repo not found (or token lacks access)" };
    if (res.status === 403 || res.status === 401) return { ok: false, error: `github auth failed (${res.status})` };
    if (!res.ok) return { ok: false, error: `github HTTP ${res.status}` };
    const data = (await res.json()) as {
      default_branch?: string;
      pushed_at?: string;
      open_issues_count?: number;
    };
    const defaultBranch = data.default_branch ?? "main";

    // Latest commit on the default branch.
    let lastCommitSha: string | undefined;
    let lastCommitAt: string | undefined;
    try {
      const c = await fetch(`https://api.github.com/repos/${fullName}/commits/${defaultBranch}`, {
        headers: authHeaders("application/vnd.github+json"),
        signal: AbortSignal.timeout(15000),
      });
      if (c.ok) {
        const cj = (await c.json()) as { sha?: string; commit?: { author?: { date?: string } } };
        lastCommitSha = cj.sha;
        lastCommitAt = cj.commit?.author?.date;
      }
    } catch {
      // non-fatal — verify still succeeds without commit detail
    }

    // Open PR count (capped at 100 per page; good enough for a status glance).
    let openPrCount = 0;
    let lastPrState: RepoVerifyResult["lastPrState"] = "none";
    try {
      const p = await fetch(`https://api.github.com/repos/${fullName}/pulls?state=open&per_page=1`, {
        headers: authHeaders("application/vnd.github+json"),
        signal: AbortSignal.timeout(15000),
      });
      if (p.ok) {
        const link = p.headers.get("link") || "";
        const lastMatch = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
        openPrCount = lastMatch ? Number(lastMatch[1]) : ((await p.json()) as unknown[]).length;
        lastPrState = openPrCount > 0 ? "open" : "none";
      }
    } catch {
      // non-fatal
    }

    // Persist verify cache to the registry row (best-effort, fire-and-forget).
    // Two clean .eq() updates avoid PostgREST or-filter parsing doubt with
    // dotted/slashed repo names; a repo that is both canonical + public just
    // updates the same row twice (idempotent).
    if (supabaseAdmin) {
      const patch = {
        last_commit_sha: lastCommitSha ?? null,
        last_commit_at: lastCommitAt ?? null,
        last_pr_state: lastPrState ?? null,
        last_checked_at: new Date().toISOString(),
      };
      void supabaseAdmin.from("growth_repo_registry").update(patch).eq("canonical_private_repo", fullName).then(() => undefined, () => undefined);
      void supabaseAdmin.from("growth_repo_registry").update(patch).eq("public_repo", fullName).then(() => undefined, () => undefined);
    }

    return { ok: true, defaultBranch, lastCommitSha, lastCommitAt, openPrCount, lastPrState };
  } catch (e) {
    return { ok: false, error: `verify failed: ${(e as Error).message}` };
  }
}

/** Fetch the README text for an authorized repo. Never throws. */
export async function fetchReadme(fullName: string): Promise<ReadmeResult> {
  if (!REPO_RE.test(fullName)) return { ok: false, error: "Invalid repo (expected owner/name)" };
  if (!gate(fullName, "readme")) return { ok: false, error: "repo not authorized", denied: true };
  if (!token()) return { ok: false, error: "GITHUB_TOKEN not configured" };

  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: authHeaders("application/vnd.github.raw"),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { ok: false, error: "no README" };
    if (res.status === 403 || res.status === 401) return { ok: false, error: `github auth failed (${res.status})` };
    if (!res.ok) return { ok: false, error: `github HTTP ${res.status}` };
    const readme = await res.text();
    return { ok: true, readme };
  } catch (e) {
    return { ok: false, error: `readme failed: ${(e as Error).message}` };
  }
}