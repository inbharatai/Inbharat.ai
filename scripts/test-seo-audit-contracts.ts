import assert from "node:assert/strict";
import { validateJsonLd, validateSitemapXml, hasPublicAnchor, isIsoDate } from "../lib/growth/seo-contracts.js";
import { parsePage } from "../lib/growth/crawler.js";
import { scoreSeo } from "../lib/growth/seo-auditor.js";

const origin = "https://www.example.com";
const json = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
assert.ok(validateJsonLd("<html></html>", ["Organization"]).some((e) => e.includes("missing expected")));
for (const stub of [{ '@type': 'Organization' }, { '@type': 'FAQPage' }, { '@type': 'Organization', '@id': origin + '/#missing' }]) {
  assert.ok(validateJsonLd(json(stub), [String(stub['@type'])]).length, 'type-only/unresolved stub must fail');
}
assert.ok(validateJsonLd(json({ '@type': 'Question', name: 'Why?', acceptedAnswer: 'not an Answer object' }), ['Question']).length);
for (const name of [false, 0, [], {}]) assert.ok(validateJsonLd(json({ '@type': 'Organization', name }), ['Organization']).length);
for (const author of ['not-an-author-object', false, [], { '@type': 'Person', name: false }]) {
  assert.ok(validateJsonLd(json({ '@type': 'TechArticle', headline: 'X', author, mainEntityOfPage: origin + '/x' }), ['TechArticle'], origin + '/x').length);
}
for (const item of [false, 7, {}, 'javascript:alert(1)', { name: false }]) {
  assert.ok(validateJsonLd(json({ '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item }] }), ['ItemList']).length);
}
assert.deepEqual(validateJsonLd(json({ '@graph': [
  { '@type': 'Person', '@id': origin + '/#author', name: 'Example Author' },
  { '@type': 'TechArticle', headline: 'X', author: { '@type': 'Person', '@id': origin + '/#author' }, mainEntityOfPage: origin + '/x' },
  { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: { '@id': origin + '/x' } }] }
] }), ['TechArticle', 'ItemList'], origin + '/x'), []);
assert.ok(validateJsonLd(json({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 3, name: 'Home', item: origin }] }), ['BreadcrumbList']).length);
assert.deepEqual(validateJsonLd(json({ '@graph': [{ '@type': 'Organization', '@id': origin + '/#org' }, { '@type': 'Organization', '@id': origin + '/#org', name: 'Example' }] }), ['Organization']), []);
assert.ok(validateJsonLd(json({ "@type": "FAQPage", mainEntity: [] }), ["FAQPage"]).length);
assert.ok(validateJsonLd(json({ "@type": "FAQPage", mainEntity: "not an array" }), ["FAQPage"]).length);
const graph = { "@graph": [{ "@type": "Organization", name: "Example", url: origin }, { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "What is it?", acceptedAnswer: { "@type": "Answer", text: "An example." } }] }] };
assert.deepEqual(validateJsonLd(json(graph), ["Organization", "FAQPage"]), []);
assert.ok(validateJsonLd(json({ "@type": "TechArticle", headline: "Test", author: { "@type": "Person", name: "Example" }, datePublished: "2026-01-01", mainEntityOfPage: origin + "/old" }), ["TechArticle"], origin + "/new").some((e) => e.includes("canonical")));
assert.ok(validateJsonLd(json({ "@type": "Article", headline: "Test", author: { "@id": origin + "/#author" }, datePublished: "2026-02-30" }), ["Article"]).some((e) => e.includes("datePublished")));
assert.ok(!hasPublicAnchor(json({ url: origin + "/target" }), origin + "/target", origin));
assert.ok(!hasPublicAnchor('<div aria-hidden="true"><a href="/target">Target</a></div>', origin + "/target", origin));
assert.ok(hasPublicAnchor('<main><a href="/target">Target</a></main>', origin + "/target", origin));
const sitemap = (locs: string[]) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<url><loc>${loc}</loc><lastmod>2026-01-01</lastmod></url>`).join("")}</urlset>`;
assert.deepEqual(validateSitemapXml(sitemap([origin + "/"]), origin, [origin + "/"]).errors, []);
for (const foreign of ["https://evil.test/", "https://www.example.com.evil.test/", "https://www.example.com@evil.test/"]) {
  assert.ok(validateSitemapXml(sitemap([origin + "/", foreign]), origin, [origin + "/"]).errors.some((e) => e.includes("foreign")));
}
assert.ok(validateSitemapXml(sitemap([origin + "/", origin + "/"]), origin, [origin + "/"]).errors.some((e) => e.includes("duplicate")));
assert.ok(validateSitemapXml(sitemap([origin + "/?lang=hi"]), origin, [origin + "/"]).errors.some((e) => e.includes("query/fragment")));
assert.ok(validateSitemapXml("<invalid/>", origin, [origin + "/"]).errors.length);
assert.ok(validateSitemapXml(sitemap([origin + "/"]).replace("2026-01-01", "2099-01-01"), origin, [origin + "/"]).errors.some((e) => e.includes("future")));
assert.ok(isIsoDate("2024-02-29")); assert.ok(!isIsoDate("2025-02-29"));
const page = parsePage('<html><body><nav>Ignore these many navigation words</nav><main><h1>Real title</h1><p>Useful content.</p><div hidden>faq proof demo</div><div aria-hidden="true">faq proof demo</div><div style="display:none">faq proof demo</div></main><footer>Ignore footer words</footer></body></html>', origin);
assert.equal(page.wordCount, 4);
assert.equal(page.proofPresent, false);
assert.equal(page.faqPresent, false);
const redirect = (statuses: number[]) => scoreSeo({ ...page, redirectChain: statuses.map((status, i) => ({ status, url: origin + "/" + i })) }).issues.filter((i) => i.field === "redirect");
assert.equal(redirect([200]).length, 0);
assert.equal(redirect([308, 200]).length, 0);
assert.match(redirect([301, 308, 200])[0].message, /2 redirect hops/);
assert.ok(!scoreSeo(page).issues.some((i) => i.field === "wordCount" && i.severity === "high"));
console.log("seo-audit-contracts: schema absence/nesting, anchor presence, exact sitemap origins/dates, visible-content estimate and redirect-count fixtures passed");
