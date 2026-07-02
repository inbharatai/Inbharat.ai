/**
 * InBharat Growth Agent — Stage 3 syndication: pure tag + canonical helpers.
 *
 * Pure + hermetic (no React, no DB, no fetch) so the tag-mapping + canonical
 * logic is unit-testable without network. The platform clients (devto.ts,
 * hashnode.ts) build their platform-specific payloads from these.
 */
import { SITE } from "../../../seo.config.js";
import { articlePath } from "../../../content/articles.meta.js";
import type { SyndicationPlatform } from "./types.js";

/**
 * The InBharat canonical URL for an article. Always the www host (SITE.url is
 * `https://www.inbharat.ai`, the canonical host — apex 308-redirects to www)
 * + the article path. This is the URL sent as `canonical_url` (DEV.to) /
 * `originalArticleURL` (Hashnode) so Google attributes the original here and
 * the cross-post ranks as a copy.
 */
export function canonicalForSlug(slug: string): string {
  return `${SITE.url}${articlePath(slug)}`;
}

/**
 * Normalize one raw hashtag to a platform tag token: lowercase, strip a leading
 * `#`, collapse spaces/underscores to hyphens, trim, drop anything still empty.
 * Pure.
 */
function normalizeTag(raw: string): string {
  let t = raw.trim().toLowerCase();
  if (t.startsWith("#")) t = t.slice(1);
  // DEV.to + Hashnode tag slugs are lowercase-hyphen; spaces + underscores → hyphen.
  t = t.replace(/[\s_]+/g, "-");
  // Strip any char that isn't a-z0-9- (drop camelCase punctuation, emojis, etc.).
  t = t.replace(/[^a-z0-9-]/g, "");
  // Collapse repeated hyphens + trim leading/trailing hyphens.
  t = t.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return t;
}

/**
 * Build the comma-separated tags string DEV.to expects (Forem API spec: `tags`
 * is a string, max 4, each ≤ 31 chars). Lowercased + kebab-cased from the
 * article hashtags. Deduped, capped at 4, ≤31 chars each. Returns "" when no
 * hashtags yield a usable tag (caller passes null → DEV.to omits tags).
 *
 * DEV.to rejects tags longer than 31 chars, so truncate (don't drop) to keep a
 * recognizable tag for long hashtags like "SoftwareDevelopment" → "softwaredevelopmen".
 */
export function buildDevtoTagsString(hashtags: string[] | null | undefined): string {
  if (!Array.isArray(hashtags)) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hashtags) {
    if (typeof raw !== "string") continue;
    let t = normalizeTag(raw);
    if (!t) continue;
    if (t.length > 31) t = t.slice(0, 31).replace(/-+$/, "");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 4) break; // DEV.to max 4 tags
  }
  return out.join(",");
}

/**
 * Build the Hashnode tag objects (`{ slug, name }`, max 5). Hashnode's
 * PublishPostInput.tags takes objects with a slug (lowercase-hyphen) + name
 * (display). We keep the original hashtag as the display name and the
 * normalized form as the slug. Deduped by slug, capped at 5.
 */
export function buildHashnodeTags(hashtags: string[] | null | undefined): { slug: string; name: string }[] {
  if (!Array.isArray(hashtags)) return [];
  const seen = new Set<string>();
  const out: { slug: string; name: string }[] = [];
  for (const raw of hashtags) {
    if (typeof raw !== "string") continue;
    const slug = normalizeTag(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    // Display name = the original hashtag without a leading #, capped to a sane length.
    const name = raw.trim().replace(/^#/, "").slice(0, 60) || slug;
    out.push({ slug, name });
    if (out.length >= 5) break; // Hashnode max 5 tags
  }
  return out;
}

/** The env var name holding each platform's credential (null for Medium — no API). */
export function platformCredentialEnv(platform: SyndicationPlatform): string | null {
  switch (platform) {
    case "devto":
      return "DEVTO_API_KEY";
    case "hashnode":
      return "HASHNODE_TOKEN";
    case "medium":
      return null;
  }
}

/** Human-readable platform name for logs + UI. */
export function platformLabel(platform: SyndicationPlatform): string {
  switch (platform) {
    case "devto":
      return "DEV.to";
    case "hashnode":
      return "Hashnode";
    case "medium":
      return "Medium";
  }
}