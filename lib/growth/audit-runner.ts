/**
 * InBharat Growth Agent — audit orchestration (Phase 1: crawl + audit only).
 *
 * Runs the crawler over an authorized domain's homepage + discovered internal
 * links (capped), scores each page with the SEO + GEO auditors, and persists
 * the run + pages to Supabase when configured (graceful no-DB otherwise).
 * Never writes content, never publishes — audit-only.
 *
 * Server-only. Never touches the chat backend.
 */
import type { CrawlRun, GrowthPage } from "./types.js";
import { assertAuthorized, logInfo } from "./authorization.js";
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { crawlUrl, extractInternalLinks, fetchPage } from "./crawler.js";
import { scoreSeo } from "./seo-auditor.js";
import { scoreGeo } from "./geo-auditor.js";

const MAX_PAGES_PER_DOMAIN = 25;

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function rootUrlFor(domain: string): string {
  const d = domain.includes("://") ? domain : `https://${domain}`;
  try { const u = new URL(d); return `${u.origin}/`; } catch { return d; }
}

/** Run a full audit over an authorized domain. Returns the CrawlRun (also persisted if DB present). */
export async function auditDomain(domain: string): Promise<CrawlRun> {
  // Deny-by-default guard. Throws AuthorizationError if not allowed.
  assertAuthorized("audit", domain);
  const scope = domainOf(rootUrlFor(domain));
  const rootUrl = rootUrlFor(domain);

  await logInfo("audit-start", scope, `crawling up to ${MAX_PAGES_PER_DOMAIN} pages`);

  const run: CrawlRun = {
    domain: scope,
    status: "running",
    pagesCount: 0,
    startedAt: new Date().toISOString(),
    pages: [],
  };

  const targets = new Set<string>([rootUrl]);
  try {
    // Seed: discover internal links from the homepage.
    const { html, status } = await fetchPage(rootUrl);
    if (status < 400) {
      for (const link of extractInternalLinks(html, rootUrl)) {
        if (targets.size >= MAX_PAGES_PER_DOMAIN) break;
        targets.add(link);
      }
    }
  } catch {
    // homepage fetch failed — still try the root URL via crawlUrl below
  }

  for (const url of targets) {
    if (run.pages!.length >= MAX_PAGES_PER_DOMAIN) break;
    try {
      const meta = await crawlUrl(url); // re-checks authorization + robots + sitemap
      const seo = scoreSeo(meta);
      const geo = scoreGeo(meta);
      const page: GrowthPage = {
        url,
        domain: scope,
        httpStatus: meta.httpStatus,
        title: meta.title,
        metaDescription: meta.metaDescription,
        canonical: meta.canonical,
        h1: meta.h1,
        wordCount: meta.wordCount,
        seoScore: seo.score,
        geoScore: geo.score,
        issues: [...seo.issues, ...geo.issues],
        meta,
        crawledAt: new Date().toISOString(),
      };
      run.pages!.push(page);
    } catch (e) {
      // skip a single page failure; don't abort the whole run
      run.pages!.push({
        url,
        domain: scope,
        seoScore: 0,
        geoScore: 0,
        issues: [{ severity: "critical", field: "crawl", message: `Crawl failed: ${(e as Error).message}`, recommendedFix: "Check the URL / server." }],
        meta: {},
        crawledAt: new Date().toISOString(),
      });
    }
  }

  run.pagesCount = run.pages!.length;
  run.avgSeoScore = avg(run.pages!.map((p) => p.seoScore));
  run.avgGeoScore = avg(run.pages!.map((p) => p.geoScore));
  run.status = "completed";
  run.finishedAt = new Date().toISOString();

  await persistRun(run);
  await logInfo("audit-done", scope, `${run.pagesCount} pages, avg SEO ${run.avgSeoScore}, avg GEO ${run.avgGeoScore}`);
  return run;
}

/** Audit a single URL (used by the Issues page "audit this URL"). */
export async function auditSingleUrl(url: string): Promise<GrowthPage> {
  assertAuthorized("audit", url);
  const meta = await crawlUrl(url);
  const seo = scoreSeo(meta);
  const geo = scoreGeo(meta);
  const scope = domainOf(url);
  const page: GrowthPage = {
    url,
    domain: scope,
    httpStatus: meta.httpStatus,
    title: meta.title,
    metaDescription: meta.metaDescription,
    canonical: meta.canonical,
    h1: meta.h1,
    wordCount: meta.wordCount,
    seoScore: seo.score,
    geoScore: geo.score,
    issues: [...seo.issues, ...geo.issues],
    meta,
    crawledAt: new Date().toISOString(),
  };
  await persistPage(scope, page);
  return page;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return Math.round(xs.reduce((s, n) => s + n, 0) / xs.length);
}

async function persistRun(run: CrawlRun): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_crawl_runs")
      .insert({
        domain: run.domain,
        status: run.status,
        pages_count: run.pagesCount,
        avg_seo_score: run.avgSeoScore,
        avg_geo_score: run.avgGeoScore,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
      })
      .select("id")
      .single();
    if (error || !data?.id) return;
    const runId = data.id as string;
    // Persist pages (lightweight subset to keep rows small).
    const rows = (run.pages || []).map((p) => ({
      run_id: runId,
      url: p.url,
      domain: p.domain,
      http_status: p.httpStatus ?? null,
      title: p.title ?? null,
      meta_description: p.metaDescription ?? null,
      canonical: p.canonical ?? null,
      h1: p.h1 ?? null,
      word_count: p.wordCount ?? null,
      seo_score: p.seoScore,
      geo_score: p.geoScore,
      issues: p.issues,
      meta: p.meta,
      crawled_at: p.crawledAt,
    }));
    if (rows.length) await supabaseAdmin.from("growth_pages").insert(rows);
  } catch {
    // DB optional — run still returned to caller
  }
}

async function persistPage(domain: string, page: GrowthPage): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("growth_pages").upsert(
      {
        url: page.url,
        domain,
        http_status: page.httpStatus ?? null,
        title: page.title ?? null,
        meta_description: page.metaDescription ?? null,
        canonical: page.canonical ?? null,
        h1: page.h1 ?? null,
        word_count: page.wordCount ?? null,
        seo_score: page.seoScore,
        geo_score: page.geoScore,
        issues: page.issues,
        meta: page.meta,
        crawled_at: page.crawledAt,
      },
      { onConflict: "url" }
    );
  } catch {
    // DB optional
  }
}