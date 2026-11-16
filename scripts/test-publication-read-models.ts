/** Hermetic F3/F5 regression coverage. No credentials, API calls or SQL execution.
 * Run: node_modules/.bin/tsx scripts/test-publication-read-models.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Set before dynamic imports: accidentally invoking a real DB/client must fail.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
globalThis.fetch = async () => { throw new Error("Network forbidden in read-model tests"); };
const memory = await import("../lib/growth/publishedMemory.js");
const insights = await import("../lib/growth/analyticsInsights.js");
import type { PublishedMemoryRow } from "../lib/growth/publishedMemory.js";
import type { ArticleObservationInventory, ArticleObservation, AnalyticsSnapshot } from "../lib/growth/analyticsInsights.js";

let passed = 0;
async function test(name: string, run: () => void | Promise<void>) {
  await run(); passed++; console.log(`PASS ${name}`);
}
const first = "2026-07-01T00:00:00Z";
const latest = "2026-09-01T00:00:00Z";
const now = Date.parse(latest);
const legacy: PublishedMemoryRow = {
  slug: "new-undated-article", title: "Undated article", canonical_url: "https://www.inbharat.ai/learn-ai-with-reeturaj/new-undated-article",
  publish_date: null, category: "AI", keywords: [], source_meta_sha: "a".repeat(64), synced_at: first,
  inbharat_status: "published", linkedin_status: "published", linkedin_at: first,
  linkedin_url: "https://www.linkedin.com/posts/test", instagram_status: "published", instagram_at: first,
  instagram_url: "https://www.instagram.com/p/test", measured_at: latest,
};
const live: PublishedMemoryRow = {
  ...legacy, publication_state: "live", first_verified_at: first, verified_at: latest,
  verification_method: "canonical_snapshot", canonical_snapshot_id: "b".repeat(64), source_commit_sha: "c".repeat(40),
  canonical_snapshot_built_at: first,
};
const observed: ArticleObservation = {
  slug: legacy.slug, title: legacy.title, publicationState: "live", firstVerifiedAt: first, verifiedAt: latest,
  verificationMethod: "canonical_snapshot", canonicalSnapshotId: "b".repeat(64), sourceCommitSha: "c".repeat(40),
};
const inventory = (articles: ArticleObservation[] = [observed]): ArticleObservationInventory => ({ status: "available", articles });
const snapshot: AnalyticsSnapshot = {
  configured: true, range: { days: 28, start: "2026-08-04", end: "2026-09-01" },
  gsc: { totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, topQueries: [], topPages: [], queryByPage: [], pagesOk: true },
};
const generate = (articleInventory: ArticleObservationInventory | undefined = inventory(), s = snapshot) =>
  insights.generateInsights({ snapshot: s, now, articleInventory }).filter((i) => i.type === "no_traffic_page");

// A deliberately small Supabase read-only double supporting only reader methods.
function database(rows: object[], fail = false) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      let from = 0, to = 499;
      const q = {
        select(columns: string) { assert.equal(columns, "*"); return q; },
        order() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; },
        range(a: number, b: number) { from = a; to = b; return q; },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: fail ? null : rows.slice(from, to + 1), error: fail ? { message: "test failure" } : null }).then(resolve); },
      };
      return q;
    },
  };
  return { client: client as unknown as NonNullable<Parameters<typeof memory.listPublishedMemory>[1]>, calls };
}

await test("legacy constant published is unverified, never live; historical visibility retained", async () => {
  const row = memory.mapPublishedMemoryRow(legacy);
  assert.equal(row.inbharatStatus, "unverified"); assert.equal(row.publicationState, "unverified");
  assert.equal(row.firstVerifiedAt, null); assert.equal(row.verificationMethod, null);
  const db = database([legacy]);
  assert.deepEqual(await memory.listPublishedMemory({}, db.client), []);
  assert.equal((await memory.listPublishedMemory({ selection: "history" }, db.client))[0].slug, legacy.slug);
});
await test("legacy → unverified → live → removed → revived preserves social URLs/status and first observation", () => {
  const states = [legacy, { ...legacy, publication_state: "unverified" }, live,
    { ...live, publication_state: "removed", removed_at: latest }, { ...live, removed_at: null }];
  const expected = ["unverified", "unverified", "live", "removed", "live"];
  states.forEach((state, i) => {
    const row = memory.mapPublishedMemoryRow(state);
    assert.equal(row.inbharatStatus, expected[i]);
    assert.equal(memory.selectPublishedMemory([row]).length, expected[i] === "live" ? 1 : 0);
    assert.equal(memory.selectPublishedMemory([row], { selection: "history" }).length, 1);
    assert.deepEqual(row.linkedin, { status: "published", at: first, url: legacy.linkedin_url });
    assert.deepEqual(row.instagram, { status: "published", at: first, url: legacy.instagram_url });
    assert.deepEqual(memory.syndicationSummary(row), { deposited: true, platforms: ["linkedin", "instagram"] });
    if (i >= 2) assert.equal(row.firstVerifiedAt, first);
  });
});
await test("new snapshot provenance exposed independently of optional Vercel evidence", () => {
  const row = memory.mapPublishedMemoryRow(live);
  assert.equal(row.canonicalSnapshotId, live.canonical_snapshot_id);
  assert.equal(row.sourceCommitSha, live.source_commit_sha);
  assert.equal(row.verifiedAt, latest); assert.equal(row.deploymentId, null);
  assert.equal(memory.mapPublishedMemoryRow({ ...live, deployment_id: "dpl_test" }).deploymentId, "dpl_test");
});
await test("explicit removed/unverified selections and platform filtering preserve history", async () => {
  const db = database([legacy, live, { ...live, publication_state: "removed" }]);
  const history = await memory.listPublishedMemory({ selection: "history", platform: "linkedin", status: "published" }, db.client);
  assert.equal(history.length, 3);
  assert.equal((await memory.listPublishedMemory({ selection: "removed" }, db.client)).length, 1);
  assert.equal((await memory.listPublishedMemory({ selection: "unverified" }, db.client)).length, 1);
});
await test("limit applies after lifecycle/social filtering across pages", async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ ...live, slug: `removed-${i}`, publication_state: "removed" }));
  const db = database([...rows, live]);
  assert.equal((await memory.listPublishedMemory({ limit: 1 }, db.client))[0].slug, live.slug);
  assert.equal(db.calls.length, 2);
});
await test("inventory reader loads DB evidence, not source publication dates", async () => {
  const db = database([live]);
  const fetched = await memory.getArticleObservationInventory(db.client);
  assert.deepEqual(fetched, inventory());
  assert.deepEqual(db.calls, ["published_articles"]);
  assert.equal(generate(fetched).length, 1);
});
await test("legacy inventory remains explicitly unverified, DB failures explicitly unavailable", async () => {
  const fetched = await memory.getArticleObservationInventory(database([legacy]).client);
  assert.equal(fetched.articles[0].publicationState, "unverified");
  assert.equal(insights.publicationInsightCoverage(fetched, now).unverified, 1);
  assert.deepEqual(generate(fetched), []);
  const failed = await memory.getArticleObservationInventory(database([], true).client);
  assert.equal(failed.status, "unavailable"); assert.match(failed.reason!, /unknown/);
  assert.deepEqual(generate(failed), []);
  assert.equal((await memory.getArticleObservationInventory(null)).status, "unavailable");
});
await test("inventory pagination includes late undated articles", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...live, slug: `article-${i}` }));
  const db = database(rows); const fetched = await memory.getArticleObservationInventory(db.client);
  assert.equal(fetched.articles.length, 501); assert.equal(db.calls.length, 2);
});
await test("undated observed-live article produces age-based coverage insight, NOT measured zero", () => {
  const [result] = generate(); assert.ok(result);
  assert.match(result.summary, /observed live for at least 62 days/);
  assert.match(result.summary, /limited top-pages report/);
  assert.match(result.summary, /does not establish zero impressions or clicks/);
  assert.match(result.summary, /not proof of continuous availability/);
  assert.match(result.recommendedAction, /URL-level Search Console report/);
  assert.doesNotMatch(result.summary, /published .*ago/);
  assert.deepEqual(result.metrics, { ageDays: 62 });
  assert.match(insights.insightToKnowledge(result).summary, /Absence.*not evidence/);
});
await test("30-day threshold floors completed days, never rounds young article up", () => {
  const age = (days: number) => ({ ...observed, firstVerifiedAt: new Date(now - days * 86400000).toISOString() });
  assert.equal(generate(inventory([age(29.9)])).length, 0);
  assert.equal(generate(inventory([age(30)])).length, 1);
  assert.equal(insights.publicationInsightCoverage(inventory([age(29.9)]), now).tooYoung, 1);
});
await test("missing, invalid, future or contradictory verification and provenance stays unknown", () => {
  for (const change of [
    { firstVerifiedAt: null }, { firstVerifiedAt: "garbage" }, { firstVerifiedAt: "2027-01-01" },
    { verifiedAt: null }, { verifiedAt: "2027-01-01" }, { verifiedAt: "2026-06-01" },
    { verificationMethod: null }, { verificationMethod: "build" }, { canonicalSnapshotId: null },
    { canonicalSnapshotId: "dpl_not_a_snapshot" }, { sourceCommitSha: null },
  ]) {
    const a = { ...observed, ...change };
    assert.equal(insights.observedLiveAge(a, now), null);
    assert.deepEqual(generate(inventory([a])), []);
    assert.equal(insights.publicationInsightCoverage(inventory([a]), now).unknownVerification, 1);
  }
});
await test("removed and unverified excluded even with valid old evidence; revival eligible", () => {
  for (const state of ["unverified", "removed"] as const) {
    const inv = inventory([{ ...observed, publicationState: state }]);
    assert.deepEqual(generate(inv), []);
    assert.equal(insights.publicationInsightCoverage(inv, now)[state], 1);
  }
  assert.equal(generate(inventory([observed])).length, 1);
});
await test("missing inventory is unknown, never fallback to historical source dates", () => {
  const results = insights.generateInsights({ snapshot, now });
  assert.equal(results.some((i) => i.type === "no_traffic_page"), false);
  assert.equal(insights.publicationInsightCoverage(undefined, now).status, "unavailable");
  assert.match(insights.publicationInsightCoverage(undefined, now).summary, /unknown/);
});
await test("failed GSC report cannot emit coverage gap; present URL cannot be called absent", () => {
  assert.deepEqual(generate(inventory(), { ...snapshot, gsc: { ...snapshot.gsc!, pagesOk: false } }), []);
  const page = { keys: [legacy.canonical_url], clicks: 1, impressions: 5, ctr: 0.2, position: 3 };
  assert.deepEqual(generate(inventory(), { ...snapshot, gsc: { ...snapshot.gsc!, topPages: [page] } }), []);
});
await test("migration preserves complete social joins, column prefix, security_invoker and all history", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261116000002_article_publication_read_models.sql", import.meta.url), "utf8");
  const prior = readFileSync(new URL("../supabase/migrations/20260810000002_social_publishing.sql", import.meta.url), "utf8");
  const strip = (text: string) => text.replace(/--[^\n]*/g, "").trim();
  assert.doesNotMatch(strip(sql), /\b(DROP|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.growth_published_memory/);
  assert.match(sql, /WITH \(security_invoker = on\)/);
  assert.equal(sql.slice(sql.indexOf("FROM published_articles pa"), sql.indexOf("COMMIT;")).trim(), prior.slice(prior.indexOf("FROM published_articles pa"), prior.indexOf("-- NOTE: growth_outcomes")).trim());
  const originalPrefix = strip(prior.slice(prior.indexOf("SELECT\n"), prior.indexOf("FROM published_articles pa")));
  const newPrefix = strip(sql.slice(sql.indexOf("SELECT\n"), sql.indexOf("  pa.publication_state,")));
  assert.equal(newPrefix.replace(/CASE WHEN[\s\S]+?END::text AS inbharat_status/, "'published'::text                       AS inbharat_status").replace(/,\s*$/, "").replace(/\s+/g, " "), originalPrefix.replace(/\s+/g, " "));
  const core = readFileSync(new URL("../supabase/migrations/20261116000001_article_publication_lifecycle.sql", import.meta.url), "utf8");
  for (const column of ["publication_state", "first_verified_at", "verified_at", "removed_at", "source_commit_sha", "canonical_snapshot_id", "canonical_snapshot_built_at", "verification_method", "deployment_id", "deployment_created_at", "vercel_verified_at"]) {
    assert.match(sql, new RegExp(`pa\\.${column}`));
    assert.match(core, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} `));
  }
});
await test("both existing async callers wire observation inventory and coverage diagnostics", () => {
  for (const file of ["performance.ts", "agentTools.ts"]) {
    const source = readFileSync(new URL(`../lib/growth/${file}`, import.meta.url), "utf8");
    assert.match(source, /await getArticleObservationInventory\(\)/);
    assert.match(source, /generateInsights\(\{[^}]*articleInventory/);
    assert.match(source, /publicationInsightCoverage\(articleInventory, now\)/);
  }
});
console.log(`\n${passed} publication read-model tests passed (hermetic; SQL source contracts only, not PostgreSQL execution).`);
