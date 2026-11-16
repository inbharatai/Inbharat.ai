/**
 * File-based SEO audit over the BUILT dist/ (no network, hermetic, CI-runnable).
 *
 * Run:  npm run audit:seo   (after `npm run build` or `npm run build:seo`)
 *
 * Verifies the Google Search Console hardening end-to-end against the static
 * shells that Vercel actually serves:
 *   - every indexable ROUTE has a built shell at dist/<path>/index.html
 *   - exactly one <link rel="canonical"> per page, self-referencing, absolute https://www
 *   - no duplicate canonicals across indexable shells
 *   - exactly one <h1> per page, non-empty
 *   - robots meta correct (indexable routes not noindex; admin shells noindex,nofollow)
 *   - JSON-LD required fields present per @type; NO obsolete SearchAction
 *     (regression guard for the /app?q={search_term_string} removal)
 *   - every indexable canonical appears in dist/sitemap.xml; no sitemap loc
 *     points at a missing shell; sitemap locs must not contain query strings
 *     and must not be under /api, /admin, or /silt
 *   - internal links resolve to a built shell (broken-link reporter)
 *   - homepage and /about shells expose the SILT and Pocket AI patent numbers
 *     and "Patent Pending" language
 *   - homepage shell cross-links to https://silt.inbharat.ai and the SILT GitHub repo
 *
 * Exits non-zero on any failure so CI catches regressions. The live-crawl
 * audit (lib/growth/audit-runner.ts) is a separate, networked tool — this one
 * is hermetic and runs on every build.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { ROUTES, SITE, GLOBAL_SCHEMA } from "../seo.config";
import type { SeoRoute } from "../seo.config";
import { parsePage, extractInternalLinks } from "../lib/growth/crawler";
import { validateJsonLd, validateSitemapXml, hasPublicAnchor, schemaNodes, schemaTypes } from "../lib/growth/seo-contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

type Failing = { path: string; check: string; detail: string };

const failures: Failing[] = [];
const rows: { path: string; shell: "ok" | "MISS"; canonical: string; canN: number; h1N: number; robots: string; sitemap: "yes" | "no" | "n/a"; schema: "ok" | string }[] = [];

function shellFilePath(routePath: string): string {
  return routePath === "/" ? join(DIST, "index.html") : join(DIST, routePath, "index.html");
}
function expectedCanonical(routePath: string): string {
  return SITE.url + (routePath === "/" ? "/" : routePath);
}

/* ── Patent / cross-link constants ──────────────────────────────────── */
const SILT_PATENT = "202631101454";
const POCKETAI_PATENT = "202631102427";
const SILT_LANDING = "https://silt.inbharat.ai";
const SILT_REPO = "https://github.com/inbharatai/SILT";
const POCKETAI_REPO = "https://github.com/inbharatai/PAI.V2";

/* Validate expected set, exact origins, duplicate locs and dates. */
const sitemapPath = join(DIST, "sitemap.xml");
const expectedSitemap = ROUTES.filter((r) => !r.noIndex && !r.excludeFromSitemap).map((r) => expectedCanonical(r.path));
const sitemap = validateSitemapXml(existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "", SITE.url, expectedSitemap);
for (const detail of sitemap.errors) failures.push({ path: "/sitemap.xml", check: "sitemap contract", detail });
const sitemapLocs = new Set(sitemap.locs);

/* ── Audit every indexable route ──────────────────────────────────────── */
const indexable = (ROUTES as SeoRoute[]).filter((r) => !r.noIndex && !r.excludeFromSitemap);
const seenCanonicals = new Set<string>();

// Map of every built shell path (for internal-link reachability + sitemap cross-check).
const builtPaths = new Set<string>();
for (const r of ROUTES) {
  if (existsSync(shellFilePath(r.path))) builtPaths.add(r.path);
}

for (const r of indexable) {
  const path = r.path;
  const shell = shellFilePath(path);
  const expCanonical = expectedCanonical(path);
  if (!existsSync(shell)) {
    failures.push({ path, check: "shell exists", detail: `missing build output: ${shell}` });
    rows.push({ path, shell: "MISS", canonical: "", canN: 0, h1N: 0, robots: "", sitemap: "n/a", schema: "n/a" });
    continue;
  }
  const html = readFileSync(shell, "utf8");
  // Discovery hygiene: retired source/query strings in shipped HTML comments
  // can be rediscovered by crawlers even when they are no longer linked.
  if (html.includes("/index.tsx")) {
    failures.push({ path, check: "no source-path leakage", detail: "built shell exposes the development entry path" });
  }
  if (html.includes("search_term_string")) {
    failures.push({ path, check: "no retired search template", detail: "built shell exposes the removed SearchAction placeholder" });
  }
  if (/href=["'](?:http:\/\/inbharat\.ai|https:\/\/inbharat\.ai)(?:[/'"?#])/i.test(html)) {
    failures.push({ path, check: "canonical internal absolute links", detail: "built shell links to a non-www internal origin" });
  }
  const meta = parsePage(html, expCanonical);
  const canN = meta.canonicalCount ?? 0;
  const h1N = meta.h1Count ?? 0;

  // exactly one canonical + self-referencing absolute www
  if (canN !== 1) failures.push({ path, check: "exactly one canonical", detail: `got ${canN}` });
  if (meta.canonical !== expCanonical) failures.push({ path, check: "canonical self-ref www", detail: `got ${meta.canonical ?? "(none)"} expected ${expCanonical}` });
  if (meta.canonical && seenCanonicals.has(meta.canonical)) {
    failures.push({ path, check: "canonical unique", detail: `duplicate canonical ${meta.canonical}` });
  } else if (meta.canonical) {
    seenCanonicals.add(meta.canonical);
  }
  // exactly one h1, non-empty
  if (h1N !== 1) failures.push({ path, check: "exactly one H1", detail: `got ${h1N}` });
  if (!meta.h1) failures.push({ path, check: "H1 non-empty", detail: "h1 text empty" });
  // robots: indexable route must NOT carry noindex
  if (meta.metaRobots && /noindex/i.test(meta.metaRobots)) {
    failures.push({ path, check: "robots not noindex", detail: `meta robots = ${meta.metaRobots}` });
  }
  // sitemap inclusion
  const inSitemap = sitemapLocs.has(expCanonical);
  if (!inSitemap) failures.push({ path, check: "in sitemap.xml", detail: `${expCanonical} not in sitemap` });
  // Static content must be accessible and managed by React, not an offscreen
  // competing document that survives route navigation.
  const $ = load(html);
  if ($('body > section[aria-hidden="true"]').length) {
    failures.push({ path, check: "no permanent hidden SEO document", detail: "off-root aria-hidden section remains" });
  }
  if (!$("#root h1").length) failures.push({ path, check: "readable root content", detail: "H1 missing from managed static root" });
  // JSON-LD validity
  const expectedTypes = schemaTypes(schemaNodes([...GLOBAL_SCHEMA, ...(r.extraSchema || [])]));
  const ldErrs = validateJsonLd(html, expectedTypes, expCanonical);
  for (const expected of schemaNodes(r.extraSchema || []).filter((node) => node["@type"] === "TechArticle")) {
    const actual = $('script[type="application/ld+json"]').toArray().flatMap((el) => {
      try { return schemaNodes(JSON.parse($(el).text())); } catch { return []; }
    }).find((node) => node["@type"] === "TechArticle");
    for (const field of ["headline", "description", "abstract", "datePublished", "dateModified", "mainEntityOfPage"]) {
      if (JSON.stringify(actual?.[field]) !== JSON.stringify(expected[field])) ldErrs.push(`TechArticle ${field} differs from reviewed manifest`);
    }
  }
  for (const e of ldErrs) failures.push({ path, check: "JSON-LD valid", detail: e });

  rows.push({
    path,
    shell: "ok",
    canonical: meta.canonical ?? "(none)",
    canN,
    h1N,
    robots: meta.metaRobots ?? "(none)",
    sitemap: inSitemap ? "yes" : "no",
    schema: ldErrs.length ? `${ldErrs.length} err` : "ok",
  });
}

/* ── Deep-tech / patent presence on public shells ─────────────────────── */
const patentPaths = ["/", "/about"];
for (const path of patentPaths) {
  const shell = shellFilePath(path);
  if (!existsSync(shell)) {
    failures.push({ path, check: "patent shell exists", detail: `missing shell for ${path}` });
    continue;
  }
  const html = readFileSync(shell, "utf8");
  const text = load(html)("body").text();
  const lowerText = text.toLowerCase();
  for (const patent of [SILT_PATENT, POCKETAI_PATENT]) {
    if (!text.includes(patent)) {
      failures.push({ path, check: "patent number present", detail: `missing patent application ${patent}` });
    }
  }
  if (!lowerText.includes("patent pending")) {
    failures.push({ path, check: "patent-pending language", detail: `missing "Patent Pending" language` });
  }
  if (!hasPublicAnchor(html, SILT_LANDING, SITE.url)) {
    failures.push({ path, check: "SILT landing cross-link", detail: `missing link to ${SILT_LANDING}` });
  }
  if (!hasPublicAnchor(html, SILT_REPO, SITE.url)) {
    failures.push({ path, check: "SILT repo cross-link", detail: `missing link to ${SILT_REPO}` });
  }
  if (!hasPublicAnchor(html, POCKETAI_REPO, SITE.url)) {
    failures.push({ path, check: "Pocket AI repo cross-link", detail: `missing link to ${POCKETAI_REPO}` });
  }
}

/* ── Sitemap cross-check: no loc without a built shell ─────────────────── */
const indexableByCanonical = new Map(indexable.map((r) => [expectedCanonical(r.path), r.path]));
for (const loc of sitemapLocs) {
  // Foreign origins were rejected above; every entry still needs a known route.
  const path = indexableByCanonical.get(loc);
  if (path === undefined) {
    failures.push({ path: loc, check: "sitemap loc maps to a route", detail: "loc not in indexable ROUTES" });
    continue;
  }
  if (!builtPaths.has(path)) failures.push({ path, check: "sitemap loc has shell", detail: `${loc} → no built shell` });
}

/* ── Internal-link reachability (broken-link reporter) ────────────────── */
for (const r of indexable) {
  const shell = shellFilePath(r.path);
  if (!existsSync(shell)) continue;
  const html = readFileSync(shell, "utf8");
  const links = extractInternalLinks(html, expectedCanonical(r.path));
  for (const abs of links) {
    let p: string;
    try { p = new URL(abs).pathname; } catch { continue; }
    // Normalize to a route path the build would emit a shell for.
    const norm = p === "/" ? "/" : p.replace(/\/$/, "");
    // Skip asset/extension paths (not page shells).
    if (/\.[a-z0-9]+$/i.test(norm) || norm.startsWith("/assets/")) continue;
    if (!builtPaths.has(norm)) {
      failures.push({ path: r.path, check: "internal link resolves", detail: `links to ${abs} (${norm}) — no built shell` });
    }
  }
}

/* ── Admin shells: must be noindex,nofollow (private) ─────────────────── */
const adminRoutes = (ROUTES as SeoRoute[]).filter((r) => r.noIndex);
for (const r of adminRoutes) {
  const shell = shellFilePath(r.path);
  if (!existsSync(shell)) {
    failures.push({ path: r.path, check: "admin shell exists", detail: "admin route missing shell (SPA won't boot)" });
    continue;
  }
  const html = readFileSync(shell, "utf8");
  if (!/name="robots"\s+content="noindex,\s*nofollow"/i.test(html)) {
    failures.push({ path: r.path, check: "admin noindex,nofollow", detail: "admin shell not noindex,nofollow" });
  }
}

/* ── Report ───────────────────────────────────────────────────────────── */
console.log("\n=== audit-seo: file-based SEO audit over dist/ ===");
console.log("path                                   shell canonical                                              can h1 robots      smap schema");
for (const row of rows) {
  console.log(
    `${row.path.padEnd(38)} ${row.shell.padEnd(5)} ${row.canonical.padEnd(52)} ${String(row.canN).padEnd(3)} ${String(row.h1N).padEnd(2)} ${row.robots.padEnd(10)} ${row.sitemap.padEnd(4)} ${row.schema}`,
  );
}
console.log(`\nIndexable routes: ${indexable.length} | Sitemap locs: ${sitemapLocs.size} | Admin routes: ${adminRoutes.length}`);

if (failures.length === 0) {
  console.log("\nALL SEO AUDIT CHECKS PASSED");
  process.exit(0);
}
console.log(`\n${failures.length} CHECK(S) FAILED:`);
for (const f of failures) console.log(`  ✗ [${f.path}] ${f.check}: ${f.detail}`);
process.exit(1);