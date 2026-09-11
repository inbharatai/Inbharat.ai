import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLOBAL_SCHEMA, SITE, founderPerson } from "../seo.config.js";
import { ARTICLES } from "../content/articles.meta.js";
import { buildTechArticle } from "../content/article-schema.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const AI_CRAWLERS = [
  "OAI-SearchBot", "ChatGPT-User", "GPTBot", "PerplexityBot", "Perplexity-User",
  "ClaudeBot", "anthropic-ai", "Google-Extended", "CCBot", "Applebot-Extended",
];

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function userAgentBlock(robots: string, agent: string): string {
  const match = robots.match(new RegExp(`User-agent: ${agent}\\n([\\s\\S]*?)(?=\\nUser-agent:|\\nSitemap:|$)`));
  assert.ok(match, `missing robots block for ${agent}`);
  return match[0];
}

const robots = read("public/robots.txt");
for (const agent of AI_CRAWLERS) {
  const block = userAgentBlock(robots, agent);
  assert.match(block, /Allow: \/\n/);
  assert.match(block, /Disallow: \/api\//);
  assert.match(block, /Disallow: \/admin\//);
}
assert.ok(robots.includes(`Sitemap: ${SITE.url}/sitemap.xml`));

const vercel = JSON.parse(read("vercel.json")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const apiHeaders = vercel.headers.find((entry) => entry.source === "/api/(.*)")?.headers ?? [];
assert.ok(apiHeaders.some((header) => header.key === "X-Robots-Tag" && /noindex/i.test(header.value)));

const llms = read("public/llms.txt");
assert.match(llms, /^# InBharat AI$/m);
assert.match(llms, /^> /m);
const llmsLinks = [...llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\): .+$/gm)].map((match) => match[1]);
assert.ok(llmsLinks.length >= 10, "llms.txt should expose a concise, citable link set");
assert.ok(llmsLinks.every((link) => link.startsWith("https://")), "llms.txt links must be absolute HTTPS URLs");

const organization = GLOBAL_SCHEMA.find((node) => node["@type"] === "Organization");
const person = GLOBAL_SCHEMA.find((node) => node["@type"] === "Person");
const website = GLOBAL_SCHEMA.find((node) => node["@type"] === "WebSite");
assert.equal(organization?.["@id"], `${SITE.url}/#organization`);
assert.equal(person?.["@id"], `${SITE.url}/#founder-reeturaj-goswami`);
assert.equal(website?.["@id"], `${SITE.url}/#website`);
assert.equal(founderPerson["@id"], person?.["@id"]);
assert.deepEqual(founderPerson.sameAs, [SITE.social.linkedin]);

const article = buildTechArticle(ARTICLES[0], SITE, founderPerson);
assert.equal(article.mainEntityOfPage, `${SITE.url}/learn-ai-with-reeturaj/${ARTICLES[0].slug}`);
assert.equal((article.author as Record<string, unknown>)["@id"], founderPerson["@id"]);
assert.equal((article.publisher as Record<string, unknown>)["@id"], `${SITE.url}/#organization`);

console.log("seo-contract: robots, API noindex, llms.txt, canonical entity identity, and article schema passed");
