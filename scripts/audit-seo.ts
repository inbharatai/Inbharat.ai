/**
 * File-based SEO audit over the BUILT dist/ (no network, hermetic, CI-runnable).
 *
 * Run:  npm run audit:seo   (after `npm run build` or `npm run build:seo`)
 *
 * Verifies the Google Search Console hardening end-to-end against the static
 * shells that Vercel actually serves:
 *   - every indexable ROUTE has a built shell at dist/<path>/index.html
 *   - exactly one <link rel="canonical"> per page, self-referencing, absolute https://www
 *   - exactly one <h1> per page, non-empty
 *   - robots meta correct (indexable routes not noindex; admin shells noindex,nofollow)
 *   - JSON-LD required fields present per @type; NO obsolete SearchAction
 *     (regression guard for the /app?q={search_term_string} removal)
 *   - every indexable canonical appears in dist/sitemap.xml; no sitemap loc
 *     points at a missing shell
 *   - internal links resolve to a built shell (broken-link reporter)
 *
 * Exits non-zero on any failure so CI catches regressions. The live-crawl
 * audit (lib/growth/audit-runner.ts) is a separate, networked tool — this one
 * is hermetic and runs on every build.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { ROUTES, SITE } from "../seo.config";
import type { SeoRoute } from "../seo.config";
import { parsePage, extractInternalLinks } from "../lib/growth/crawler";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

/* ── JSON-LD required-field rules (per @type) ─────────────────────────── */
const SCHEMA_REQUIRED: Record<string, string[]> = {
  TechArticle: ["headline", "author", "datePublished"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
  FAQPage: ["mainEntity"],
  Person: ["name"],
  ItemList: ["itemListElement"],
  SoftwareApplication: ["name", "applicationCategory"],
};

type Failing = { path: string; check: string; detail: string };

const failures: Failing[] = [];
const rows: { path: string; shell: "ok" | "MISS"; canonical: string; canN: number; h1N: number; robots: string; sitemap: "yes" | "no" | "n/a"; schema: "ok" | string }[] = [];

function shellFilePath(routePath: string): string {
  return routePath === "/" ? join(DIST, "index.html") : join(DIST, routePath, "index.html");
}
function expectedCanonical(routePath: string): string {
  return SITE.url + (routePath === "/" ? "/" : routePath);
}

/* ── Load sitemap locs once ───────────────────────────────────────────── */
const sitemapPath = join(DIST, "sitemap.xml");
const sitemapLocs = new Set<string>();
if (existsSync(sitemapPath)) {
  const xml = readFileSync(sitemapPath, "utf8");
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapLocs.add(m[1].trim());
}
if (sitemapLocs.size === 0) {
  console.error("audit-seo: no sitemap locs found — run `npm run build` first.");
  process.exit(1);
}

/** Extract + validate JSON-LD blocks from a shell. Returns error list. */
function validateJsonLd(html: string): string[] {
  const errs: string[] = [];
  const $ = load(html);
  const objects: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text() || "");
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const o of arr) if (o && typeof o === "object") objects.push(o);
    } catch {
      errs.push("malformed JSON-LD block (invalid JSON)");
    }
  });
  // Regression guard: no obsolete SearchAction anywhere (Gap 1).
  for (const o of objects) {
    const t = (o as Record<string, unknown>)["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.includes("SearchAction")) {
      errs.push("obsolete SearchAction present (Google retired sitelinks search box Nov 2024)");
    }
    const pa = (o as Record<string, unknown>).potentialAction;
    if (pa && typeof pa === "object") {
      const pt = (pa as Record<string, unknown>)["@type"];
      const ptypes = Array.isArray(pt) ? pt : [pt];
      if (ptypes.includes("SearchAction")) {
        errs.push("obsolete SearchAction in potentialAction");
      }
    }
  }
  // Required fields per @type.
  for (const o of objects) {
    const t = o["@type"];
    const types = Array.isArray(t) ? t.map(String) : [String(t)];
    for (const ty of types) {
      const req = SCHEMA_REQUIRED[ty];
      if (!req) continue; // unknown/unmapped type — don't fail
      const missing = req.filter((f) => !(f in o) || o[f] === null || o[f] === "");
      if (missing.length) errs.push(`${ty} missing required field(s): ${missing.join(", ")}`);
    }
  }
  return errs;
}

/* ── Audit every indexable route ──────────────────────────────────────── */
const indexable = (ROUTES as SeoRoute[]).filter((r) => !r.noIndex && !r.excludeFromSitemap);

// Map of every built shell path (for internal-link reachability + sitemap cross-check).
const builtPaths = new Set<string>();
for (const r of indexable) {
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
  const meta = parsePage(html, expCanonical);
  const canN = meta.canonicalCount ?? 0;
  const h1N = meta.h1Count ?? 0;

  // exactly one canonical + self-referencing absolute www
  if (canN !== 1) failures.push({ path, check: "exactly one canonical", detail: `got ${canN}` });
  if (meta.canonical !== expCanonical) failures.push({ path, check: "canonical self-ref www", detail: `got ${meta.canonical ?? "(none)"} expected ${expCanonical}` });
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
  // JSON-LD validity
  const ldErrs = validateJsonLd(html);
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

/* ── Sitemap cross-check: no loc without a built shell ─────────────────── */
const indexableByCanonical = new Map(indexable.map((r) => [expectedCanonical(r.path), r.path]));
for (const loc of sitemapLocs) {
  // Only check locs on our canonical host (the sitemap hygiene test already
  // enforces no foreign/query/admin locs; here we confirm each maps to a shell).
  if (!loc.startsWith(SITE.url)) continue;
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