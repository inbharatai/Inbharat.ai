/** Read-only production HTTP check. Does not submit URLs, authenticate, or mutate data.
 * Run AFTER promotion: npm run audit:deployment. Local Vite is not a substitute.
 */
import { load } from "cheerio";
import { ROUTES, SITE, GLOBAL_SCHEMA } from "../seo.config.js";
import { validateSitemapXml, validateJsonLd, schemaNodes, schemaTypes } from "../lib/growth/seo-contracts.js";

const failures: string[] = [];
const check = (name: string, passed: boolean) => { console.log(`${passed ? "PASS" : "FAIL"} ${name}`); if (!passed) failures.push(name); };
const request = (url: string) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "InBharatReadOnlyDeploymentAudit/1.0" } });
const canonical = (path: string) => SITE.url + path;
const routes = ROUTES.filter((r) => !r.noIndex && !r.excludeFromSitemap);
try {
  const response = await request(canonical("/sitemap.xml"));
  check("sitemap HTTP 200", response.status === 200);
  check("sitemap XML content type", /xml/i.test(response.headers.get("content-type") || ""));
  const result = validateSitemapXml(await response.text(), SITE.url, routes.map((r) => canonical(r.path)));
  for (const error of result.errors) check(error, false);
  check("deployed sitemap matches reviewed route set", result.errors.length === 0);
} catch (error) { check(`sitemap request: ${String(error)}`, false); }
// Sequential by design: low load, no third-party domains or API calls.
for (const route of routes) {
  try {
    const response = await request(canonical(route.path));
    const html = await response.text();
    const $ = load(html);
    check(`${route.path} HTTP 200 HTML`, response.status === 200 && /text\/html/i.test(response.headers.get("content-type") || ""));
    check(`${route.path} no HTTP noindex`, !/noindex/i.test(response.headers.get("x-robots-tag") || ""));
    check(`${route.path} self canonical`, $('link[rel="canonical"]').length === 1 && $('link[rel="canonical"]').attr("href") === canonical(route.path));
    check(`${route.path} indexable robots`, !/noindex/i.test($('meta[name="robots"]').attr("content") || ""));
    check(`${route.path} readable managed-root H1`, $("#root h1").length === 1 && !$('body > section[aria-hidden="true"]').length);
    const expected = schemaTypes(schemaNodes([...GLOBAL_SCHEMA, ...(route.extraSchema || [])]));
    const errors = validateJsonLd(html, expected, canonical(route.path));
    check(`${route.path} current structured-data contract`, errors.length === 0);
    for (const error of errors) console.error(`  ${error}`);
  } catch (error) { check(`${route.path} request: ${String(error)}`, false); }
}
for (const path of ["/seo-audit-intentionally-missing-page", "/learn-ai-with-reeturaj/seo-audit-intentionally-missing-article", "/assets/seo-audit-intentionally-missing.js"]) {
  try { check(`${path} real HTTP 404`, (await request(canonical(path))).status === 404); }
  catch (error) { check(`${path} request: ${String(error)}`, false); }
}
for (const route of ROUTES.filter((r) => r.noIndex)) {
  try {
    const response = await request(canonical(route.path)); const html = await response.text();
    check(`${route.path} private noindex response`, /noindex/i.test(response.headers.get("x-robots-tag") || "") || /noindex/i.test(load(html)('meta[name="robots"]').attr("content") || ""));
  } catch (error) { check(`${route.path} request: ${String(error)}`, false); }
}
console.log("This audit checks deployed HTTP contracts only. It does not establish indexing, rankings, field Core Web Vitals, authorization security, or AI citations.");
if (failures.length) { console.error(`${failures.length} deployment check(s) failed`); process.exitCode = 1; }
