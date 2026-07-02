/**
 * InBharat Growth Agent — Stage 3 syndication: Medium manual-import helper.
 *
 * Medium's public API is deprecated — Medium no longer issues new integration
 * tokens (https://help.medium.com/hc/en-us/articles/213480228-API-Importing),
 * so there is no write endpoint to POST to. The ONLY working path to bring an
 * external article into Medium is the manual import tool at
 * https://medium.com/p/import, where the founder pastes a URL and Medium's
 * server-side scraper fetches + renders it. That scrape is gated server-side
 * and cannot be replicated via HTTP from our side (it must run from Medium's
 * own IPs).
 *
 * So Medium is surfaced as a MANUAL helper: this module returns the InBharat
 * canonical URL (for the founder to paste into Medium's importer) + the real
 * import-page URL (to open). No API key, no outbound POST, no fabricated
 * endpoint. The founder reviews the imported draft on Medium and adds the
 * canonical link (Edit story → three-dot menu → "Customize canonical link")
 * before publishing — the human gate.
 *
 * Pure + synchronous. Server-only.
 */
import type { SyndicationResult } from "./types.js";

/** Medium's import tool — paste a URL, Medium scrapes + renders it. Real, documented URL. */
export const MEDIUM_IMPORT_URL = "https://medium.com/p/import";

/**
 * Build the Medium manual-import helper result. Never makes a network call —
 * returns the canonical URL (to copy) + the import-page URL (to open) so the
 * founder can complete the import in Medium's UI. `ok: true` means the helper
 * produced its surfaces; the actual import is a human action on Medium, hence
 * `status: "manual"`.
 */
export function buildMediumImportHelper(canonicalUrl: string): SyndicationResult {
  return {
    platform: "medium",
    ok: true,
    url: null, // no platform post URL — the import hasn't happened yet
    postId: null,
    status: "manual",
    error: null,
    canonicalUrl,
  };
}

/** Human-readable, copy-pasteable instructions for the founder. Pure. */
export function mediumInstructions(canonicalUrl: string): string {
  return (
    `Medium's API is deprecated, so syndication is manual:\n` +
    `1. Open ${MEDIUM_IMPORT_URL}\n` +
    `2. Paste the canonical URL: ${canonicalUrl}\n` +
    `3. Medium imports + renders the article as a draft.\n` +
    `4. Edit story → three-dot menu → "Customize canonical link" → set it to ${canonicalUrl} (so Google attributes the original to InBharat).\n` +
    `5. Review + publish.`
  );
}