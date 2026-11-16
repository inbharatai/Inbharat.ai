import assert from "node:assert/strict";
import { buildIndexNowPayload, submitIndexNow, gscSitemapUrl, gscPropertyCoversSite, submitSitemapToGsc } from "../lib/growth/search-submit.ts";

const origin = "https://www.example.com";
const key = "0123456789abcdef"; // Public protocol-test identifier, not a credential.
const payload = buildIndexNowPayload(origin, key, [origin + "/", origin + "/a", origin + "/a", "https://www.example.com.evil.test/a", "https://www.example.com@evil.test/a", "https://evil.test/a", "javascript:alert(1)", origin + "/a#fragment", "http://www.example.com/a"]);
assert.ok(!("error" in payload));
assert.equal(payload.host, "www.example.com");
assert.equal(payload.keyLocation, `${origin}/${key}.txt`);
assert.deepEqual(payload.urlList, [origin + "/", origin + "/a"]);
for (const invalid of ["www.example.com", origin + "/path", origin + "?x=1", "https://owner@www.example.com", "https://www.example.com:8000", "ftp://www.example.com"]) {
  assert.ok("error" in buildIndexNowPayload(invalid, key, [origin + "/"]), invalid);
}
assert.ok("error" in buildIndexNowPayload(origin, key, ["https://foreign.test/"]));
assert.ok("error" in buildIndexNowPayload(origin, key, Array.from({ length: 10001 }, (_, i) => `${origin}/${i}`)));
let posted: Record<string, unknown> | undefined;
const fakeFetch: typeof fetch = async (_input, init) => {
  posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
  return new Response(null, { status: 202 });
};
const result = await submitIndexNow(fakeFetch, origin, key, [origin + "/", origin + "/"]);
assert.equal(posted?.host, "www.example.com");
assert.equal(result.urls, 1);
assert.match(result.detail, /validation pending/);
assert.match(result.detail, /Indexing is not confirmed/);
assert.equal((await submitIndexNow(async () => new Response(null, { status: 422 }), origin, key, [origin + "/"])).status, "failed");
assert.equal((await submitIndexNow(async () => { throw new Error("network unavailable"); }, origin, key, [origin + "/"])).status, "failed");
assert.ok(gscPropertyCoversSite("sc-domain:example.com", origin));
assert.ok(gscPropertyCoversSite("sc-domain:www.example.com", origin));
assert.ok(gscPropertyCoversSite(origin + "/", origin));
assert.ok(!gscPropertyCoversSite("sc-domain:evil.test", origin));
assert.ok(!gscPropertyCoversSite("sc-domain:ample.com", origin));
assert.ok(!gscPropertyCoversSite(origin + "/subset", origin));
assert.ok(!gscPropertyCoversSite("http://www.example.com/", origin));
const endpoint = gscSitemapUrl(origin + "/", origin + "/sitemap.xml");
assert.ok(endpoint.includes("https%3A%2F%2Fwww.example.com%2F/sitemaps/"));
assert.ok(gscSitemapUrl("sc-domain:example.com", origin + "/sitemap.xml").includes("sc-domain%3Aexample.com"));
let actualEndpoint = "";
const gscResult = await submitSitemapToGsc(async (input) => {
  actualEndpoint = String(input); return new Response(null, { status: 204 });
}, origin + "/", origin + "/sitemap.xml", "fixture-only");
assert.equal(actualEndpoint, endpoint);
assert.equal(gscResult.status, "submitted");
console.log("search-submission: protocol, origin isolation, batch bounds, status semantics and exact GSC property tests passed (hermetic; no submissions)");
