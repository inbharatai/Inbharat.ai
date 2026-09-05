import { SITE } from "../../seo.config.js";

const CANONICAL = new URL(SITE.url);
const SITE_HOSTS = new Set([CANONICAL.hostname, CANONICAL.hostname.replace(/^www\./, "")]);

/**
 * Normalize an InBharat URL to the public canonical origin while preserving
 * path, query and fragment. Foreign or malformed values are returned unchanged.
 */
export function canonicalizeInBharatUrl(input: string): string {
  try {
    const url = new URL(input);
    if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return input;
    url.protocol = "https:";
    url.hostname = CANONICAL.hostname;
    url.port = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return input;
  }
}

/**
 * Query aliases used during the apex→www data transition. New writes use only
 * the canonical URL; reads include historical apex/www HTTP(S) forms so old
 * Growth Engine rows remain discoverable and cannot bypass idempotency gates.
 */
export function inBharatUrlAliases(input: string): string[] {
  const canonical = canonicalizeInBharatUrl(input);
  try {
    const parsed = new URL(canonical);
    if (!SITE_HOSTS.has(parsed.hostname.toLowerCase())) return [input];
    const aliases = new Set<string>([canonical, input]);
    const pathnames = parsed.pathname === "/"
      ? ["/"]
      : [parsed.pathname.replace(/\/+$/, ""), `${parsed.pathname.replace(/\/+$/, "")}/`];
    for (const protocol of ["https:", "http:"]) {
      for (const hostname of SITE_HOSTS) {
        for (const pathname of pathnames) {
          const alias = new URL(canonical);
          alias.protocol = protocol;
          alias.hostname = hostname;
          alias.port = "";
          alias.pathname = pathname;
          aliases.add(alias.toString());
        }
      }
    }
    return [...aliases];
  } catch {
    return [input];
  }
}

export function sameInBharatUrl(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return canonicalizeInBharatUrl(left) === canonicalizeInBharatUrl(right);
}
