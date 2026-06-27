/**
 * InBharat Growth Agent — Module: Full-site discovery (sitemap-driven, with
 * change + orphan detection).
 *
 * The audit runner seeds from the homepage's internal links + the sitemap (capped
 * at 60). This module goes wider: it pulls EVERY url from the sitemap, diffs it
 * against the latest known growth_pages rows for the domain, and reports:
 *   - new:      sitemap URLs never audited
 *   - changed:  known URLs whose fresh crawl differs (word_count / seo_score / title)
 *   - orphaned: known pages no longer in the sitemap, or with zero internal links
 * New + changed URLs are re-audited (auditSingleUrl → fresh growth_pages rows);
 * orphaned pages are flagged on their newest row's meta (best-effort). Feeds the
 * outcome baseline + keeps the full-site picture current.
 *
 * Deny-by-default (assertAuthorized('crawl')). Never throws past the auth guard
 * in a way that aborts the cron — callers wrap in try/catch. Never publishes.
 *
 * Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { assertAuthorized, logInfo, normalizeDomain } from "./authorization.js";
import { fetchSitemapUrls, crawlUrl } from "./crawler.js";
import { auditSingleUrl } from "./audit-runner.js";
import type { DiscoveryDiff } from "./types.js";

export interface KnownPage {
  url: string;
  wordCount: number | null;
  seoScore: number | null;
  title: string | null;
  internalLinks: number | null;
}
export interface FreshPage {
  url: string;
  wordCount: number | null;
  seoScore: number | null;
  title: string | null;
}

const WORD_COUNT_DELTA = 50;

/** Pure: diff sitemap URLs against the known pages set (+ optional fresh crawls)
 *  into new / changed / orphaned. Hermetically testable on fixtures. */
export function diffSitePages(
  sitemapUrls: string[],
  knownPages: KnownPage[],
  freshPages: FreshPage[] = [],
): DiscoveryDiff {
  const knownByUrl = new Map(knownPages.map((p) => [p.url, p]));
  const sitemapSet = new Set(sitemapUrls);

  const isNew = sitemapUrls.filter((u) => !knownByUrl.has(u));

  const changed: DiscoveryDiff["changed"] = [];
  for (const f of freshPages) {
    const k = knownByUrl.get(f.url);
    if (!k) continue; // new pages aren't "changed"
    if (k.wordCount != null && f.wordCount != null && Math.abs(f.wordCount - k.wordCount) > WORD_COUNT_DELTA) {
      changed.push({ url: f.url, field: "word_count", before: k.wordCount, after: f.wordCount });
    } else if (k.seoScore != null && f.seoScore != null && f.seoScore !== k.seoScore) {
      changed.push({ url: f.url, field: "seo_score", before: k.seoScore, after: f.seoScore });
    } else if ((k.title ?? null) !== (f.title ?? null)) {
      changed.push({ url: f.url, field: "title", before: k.title, after: f.title });
    }
  }

  const orphaned: DiscoveryDiff["orphaned"] = [];
  for (const k of knownPages) {
    if (!sitemapSet.has(k.url)) {
      orphaned.push({ url: k.url, reason: "not in sitemap" });
    } else if (k.internalLinks != null && k.internalLinks === 0) {
      orphaned.push({ url: k.url, reason: "no internal links" });
    }
  }

  return { discovered: sitemapUrls, new: isNew, changed, orphaned };
}

/** Build the root URL for a domain (https://<domain>/). */
function rootUrlFor(domain: string): string {
  const d = domain.includes("://") ? domain : `https://${domain}`;
  try {
    const u = new URL(d);
    return `${u.origin}/`;
  } catch {
    return d;
  }
}

/**
 * Discover the full site via its sitemap, diff vs known growth_pages, and
 * persist new + changed URLs (re-audited). Throws AuthorizationError if the
 * domain isn't authorized for crawl — callers must wrap. Best-effort persist;
 * never throws for a single page failure.
 */
export async function discoverSitePages(domain: string): Promise<DiscoveryDiff> {
  assertAuthorized("crawl", domain); // throws AuthorizationError if not crawl-authorized
  const scope = normalizeDomain(domain);
  const root = rootUrlFor(domain);

  const sitemapUrls = await fetchSitemapUrls(root);
  const sameOrigin = sitemapUrls.filter((u) => normalizeDomain(u) === scope);

  // Latest known page per URL for this domain.
  let knownPages: KnownPage[] = [];
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("growth_pages")
        .select("url,word_count,seo_score,title,meta,crawled_at")
        .eq("domain", scope)
        .order("crawled_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        const seen = new Set<string>();
        for (const r of data as Record<string, unknown>[]) {
          const url = r.url as string;
          if (seen.has(url)) continue; // newest first → keep the first (latest)
          seen.add(url);
          const meta = (r.meta ?? null) as { internalLinks?: number } | null;
          knownPages.push({
            url,
            wordCount: typeof r.word_count === "number" ? r.word_count : null,
            seoScore: typeof r.seo_score === "number" ? r.seo_score : null,
            title: typeof r.title === "string" ? r.title : null,
            internalLinks: typeof meta?.internalLinks === "number" ? meta.internalLinks : null,
          });
        }
      }
    } catch {
      knownPages = [];
    }
  }

  // Re-crawl the known sitemap URLs to detect changes (fresh values).
  const freshPages: FreshPage[] = [];
  const knownSitemapUrls = sameOrigin.filter((u) => knownPages.some((k) => k.url === u));
  for (const u of knownSitemapUrls.slice(0, 40)) {
    try {
      const meta = await crawlUrl(u);
      freshPages.push({
        url: u,
        wordCount: meta.wordCount ?? null,
        seoScore: null, // crawlUrl returns PageMeta (no score); score derived in auditSingleUrl
        title: meta.title ?? null,
      });
    } catch {
      // skip a single page failure
    }
  }

  const diff = diffSitePages(sameOrigin, knownPages, freshPages);

  // Persist new + changed URLs as fresh growth_pages rows (re-audited + scored).
  const toAudit = new Set<string>([...diff.new, ...diff.changed.map((c) => c.url)]);
  for (const u of toAudit) {
    try {
      await auditSingleUrl(u);
    } catch {
      // skip
    }
  }

  // Flag orphaned pages on their newest row's meta (best-effort; append-only
  // growth_pages has no updated_at, so this is a one-shot metadata mark).
  for (const o of diff.orphaned) {
    await markOrphaned(o.url, o.reason).catch(() => undefined);
  }

  await logInfo("discovery-run", scope, `discovered=${diff.discovered.length} new=${diff.new.length} changed=${diff.changed.length} orphaned=${diff.orphaned.length}`);
  return diff;
}

/** Mark the newest growth_pages row for a URL as orphaned (meta.orphaned). */
async function markOrphaned(url: string, reason: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { data } = await supabaseAdmin
    .from("growth_pages")
    .select("id,meta")
    .eq("url", url)
    .order("crawled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id?: string; meta?: Record<string, unknown> | null } | null;
  if (!row?.id) return;
  const mergedMeta = { ...(row.meta ?? {}), orphaned: true, orphanReason: reason };
  await supabaseAdmin.from("growth_pages").update({ meta: mergedMeta }).eq("id", row.id);
}