/* Hermetic: fake GitHub and reconciliation adapters; no API/DB calls or env secrets. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validArticleDate, articleLastmod, articleSchemaDates } from '../content/article-lifecycle.js';
import { formatArticleEntry, manifestRecords, planArticlePublication, insertArticleVisual, hasArticleMeta, type ArticleInput } from '../lib/growth/article-publication.js';
import { commitArticleSnapshot, type RepositoryRequest } from '../lib/growth/article-repository.js';
import { assertSyncInvocation, assertProductionPromotion, buildMirrorRows, reconcileVerifiedProduction, type Promotion } from '../lib/growth/production-article-sync.js';
import { computeRouteLastmod } from '../lib/growth/sitemap-lastmod.js';
import { buildTechArticle } from '../content/article-schema.js';
import type { ArticleMeta } from '../content/articles.meta.js';
import type { SeoRoute } from '../seo.config.js';

let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log(`ok ${checks} - ${name}`); }
const now = '2026-08-04T12:00:00.000Z';
const input: ArticleInput = { slug: 'test-article', title: "What's AI?", description: 'Description', category: 'AI Foundations', readMinutes: 3, abstract: 'Answer', faq: [{ q: 'Why?', a: 'Because.' }], hashtags: ['AI'], datePublished: '2026-07-01' };
const empty = 'export const ARTICLES: ArticleMeta[] = [\n];\n\nexport function getArticleBySlug() {}';
const metaOf = (source: string) => manifestRecords(source).records[0].data;

check('valid calendar dates including leap years; reject rollovers, precision and future dates', () => {
  assert(validArticleDate('2024-02-29')); assert(!validArticleDate('2025-02-29')); assert(!validArticleDate('2026-02-31'));
  for (const date of ['2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', '', null]) assert(!validArticleDate(date));
  assert(!validArticleDate('2026-08-05', '2026-08-04'));
});
check('schema/lastmod use substantive edit, preserve known publication, omit unknown', () => {
  assert.deepEqual(articleSchemaDates({}, '2026-08-04'), {});
  assert.equal(articleLastmod({ datePublished: '2026-07-01', dateModified: '2026-08-03' }, '2026-08-04'), '2026-08-03');
  assert.equal(articleLastmod({ datePublished: '2026-07-01', dateModified: '2026-06-03' }, '2026-08-04'), '2026-07-01');
  assert.equal(articleLastmod({ datePublished: '2026-02-30' }, '2026-08-04'), null);
  assert.equal(articleLastmod({ datePublished: '2026-07-01', dateModified: '2027-01-01' }, '2026-08-04'), '2026-07-01');
});
check('draft T1 is not first publication at repository snapshot T2', () => {
  const result = planArticlePublication(empty, input, null, 'Body', now);
  const meta = metaOf(result.source);
  assert.equal(meta.datePublished, undefined); assert.equal(meta.dateModified, undefined);
  assert.equal(meta.repositoryRecordedAt, now); assert.equal(meta.generatedAt, undefined);
  assert.equal(planArticlePublication(result.source, input, 'Body', 'Body', '2026-08-05T12:00:00.000Z').changed, false);
});
const old = empty.replace('\n];', '\n' + formatArticleEntry({ ...input, visual: 'old.png', videoUrl: 'https://example.com/video', futureEditorialField: { retain: true } }) + '\n];');
check('existing slug updates title, abstract and FAQ while retaining dates, visuals and unknown fields', () => {
  const update = planArticlePublication(old, { ...input, title: 'New title', abstract: 'New abstract', faq: [{ q: 'New question', a: 'New answer' }] }, 'Body', 'Revised body', now);
  const meta = metaOf(update.source);
  assert.equal(manifestRecords(update.source).records.length, 1);
  assert.equal(meta.title, 'New title'); assert.equal(meta.abstract, 'New abstract');
  assert.deepEqual(JSON.parse(JSON.stringify(meta.faq)), [{ q: 'New question', a: 'New answer' }]);
  assert.equal(meta.datePublished, '2026-07-01'); assert.equal(meta.dateModified, '2026-08-04');
  assert.equal(meta.visual, 'old.png'); assert.equal(meta.videoUrl, 'https://example.com/video');
  assert.equal((meta.futureEditorialField as { retain: boolean }).retain, true);
});
check('body-only change advances modification once; repeat is byte-idempotent', () => {
  const update = planArticlePublication(old, input, 'Body', 'Revised', now);
  assert.equal(metaOf(update.source).dateModified, '2026-08-04');
  const repeat = planArticlePublication(update.source, input, 'Revised', 'Revised', '2026-08-06T12:00:00.000Z');
  assert.equal(repeat.changed, false); assert.equal(repeat.source, update.source);
});
check('unknown legacy first publication is not fabricated; malformed old value is retained but not advertised', () => {
  const unknown = old.replace("    datePublished: '2026-07-01',\n", '');
  const update = planArticlePublication(unknown, input, 'Body', 'Revised', now);
  assert.equal(metaOf(update.source).datePublished, undefined);
  const malformed = old.replace('2026-07-01', '2026-02-30');
  const updatedMalformed = metaOf(planArticlePublication(malformed, input, 'Body', 'Revised', now).source);
  assert.equal(updatedMalformed.datePublished, '2026-02-30');
  assert.equal(articleSchemaDates(updatedMalformed as { datePublished: string }).datePublished, undefined);
});
check('safe serialization roundtrips control characters, quotes, unicode and script-close strings', () => {
  const hostile = "Line one\nLine two\r\n\t'\"\\</script><script>alert(1)</script>\u2028\u2029 भारत \0";
  const result = planArticlePublication(empty, { ...input, title: hostile, abstract: hostile, faq: [{ q: hostile, a: hostile }] }, null, 'Body', now);
  const meta = metaOf(result.source);
  assert.equal(meta.title, hostile); assert.equal(meta.abstract, hostile);
  assert.equal((meta.faq as { q: string; a: string }[])[0].a, hostile);
  assert(!result.source.includes('Line one\nLine two'));
  // Parse emitted literal as JS independently of our data parser. node --check
  // only parses synthetic source; it never executes the sentinel script string.
  const literal = formatArticleEntry(meta).trim().slice(0, -1);
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: `const article = ${literal};`, stdio: ['pipe', 'pipe', 'pipe'] });
});
check('literal parser fails closed on executable expressions, duplicate slugs and malformed files', () => {
  assert.throws(() => manifestRecords(empty.replace('= [', '= [process.exit(),')));
  assert.throws(() => manifestRecords(old.replace('\n];', '\n' + formatArticleEntry(input) + '\n];')));
  assert.throws(() => planArticlePublication('bad manifest', input, null, 'Body', now));
  assert.throws(() => planArticlePublication(old, input, 'Body', 'New', '2026-02-30T00:00:00.000Z'));
  assert.throws(() => planArticlePublication(old.replace('2026-07-01', '2027-07-01'), input, 'Body', 'New', now));
});
check('cover wiring cannot confuse metadata text with slug/visual properties and is idempotent', () => {
  const trap = empty.replace('\n];', '\n' + formatArticleEntry({ ...input, title: `slug: "not-an-entry" visual: "not-a-property"` }) + '\n];');
  assert.equal(hasArticleMeta(trap, 'not-an-entry'), false);
  assert.equal(insertArticleVisual(trap, 'not-an-entry', 'bad.png'), null);
  const wired = insertArticleVisual(trap, input.slug, 'safe.png');
  assert(wired); assert.equal(metaOf(wired).visual, 'safe.png');
  assert.equal(insertArticleVisual(wired, input.slug, 'safe.png'), null);
  assert(/readMinutes: 3,\n {4}visual: 'safe.png',/.test(wired));
  assert.equal(hasArticleMeta('', input.slug), false);
});
check('current repository manifest parses without executing source', () => {
  const records = manifestRecords(readFileSync('content/articles.meta.ts', 'utf8')).records;
  assert(records.length > 20);
});
check('TechArticle emits changed date and known first publication, omits unknown dates', () => {
  const site = { url: 'https://www.inbharat.ai', name: 'InBharat', social: { linkedin: '', twitter: '', github: '', instagram: '' } };
  const author = { '@type': 'Person', name: 'Author', url: site.url + '/about' };
  const dates = { ...input, dateModified: '2026-08-04' } as ArticleMeta & { dateModified?: string };
  const schema = buildTechArticle(dates, site, author);
  assert.equal(schema.datePublished, '2026-07-01'); assert.equal(schema.dateModified, '2026-08-04');
  const unknown = { ...dates }; delete unknown.datePublished; delete unknown.dateModified;
  const unknownSchema = buildTechArticle(unknown, site, author);
  assert(!Object.hasOwn(unknownSchema, 'datePublished')); assert(!Object.hasOwn(unknownSchema, 'dateModified'));
});
check('sitemap omits unknown/impossible/future dates rather than using build day', () => {
  const route = { path: '/learn-ai-with-reeturaj/test', articleSlug: 'test' } as SeoRoute;
  assert.equal(computeRouteLastmod(route, null, () => '2026-07-01', '2026-08-04'), null);
  assert.equal(computeRouteLastmod(route, '2026-02-30', () => null, '2026-08-04'), null);
  assert.equal(computeRouteLastmod(route, '2027-01-01', () => null, '2026-08-04'), null);
  assert.equal(computeRouteLastmod({ path: '/' } as SeoRoute, null, () => null, '2026-08-04'), null);
  assert.equal(computeRouteLastmod(route, '2026-08-04', () => null, '2026-08-04'), '2026-08-04');
});

let writes: { path: string; body: unknown }[] = [];
const repository: RepositoryRequest = async (path, method = 'GET', body) => {
  if (method !== 'GET') {
    writes.push({ path, body });
    return { sha: path === '/git/trees' ? 'tree-new' : 'commit-new' };
  }
  if (path === '/git/ref/heads/main') return { object: { sha: 'head' } };
  if (path === '/git/commits/head') return { tree: { sha: 'tree-old' } };
  assert(path.endsWith('?ref=head'));
  return { encoding: 'base64', content: Buffer.from(path.includes('articles.meta.ts') ? old : 'Body').toString('base64') };
};
const committed = await commitArticleSnapshot(repository, input, 'New body', now);
check('Git publication is one tree/commit for metadata and body with non-force ref update', () => {
  assert.equal(committed.commitSha, 'commit-new'); assert.equal(writes.length, 3);
  const tree = writes[0].body as { tree: { path: string; content: string }[]; base_tree: string };
  assert.equal(tree.base_tree, 'tree-old'); assert.equal(tree.tree.length, 2);
  assert.equal(tree.tree[0].content, 'New body'); assert.equal(metaOf(tree.tree[1].content).dateModified, '2026-08-04');
  assert.deepEqual(writes[2].body, { sha: 'commit-new', force: false });
});
writes = [];
assert.equal((await commitArticleSnapshot(repository, input, 'Body', now)).skipped, true);
check('same repository article makes no write requests', () => assert.equal(writes.length, 0));
await assert.rejects(commitArticleSnapshot(async (path, method, body) => {
  if (method === 'PATCH') throw new Error('Concurrent edit, not fast-forward');
  return repository(path, method, body);
}, input, 'Change', now), /Concurrent edit/);
checks++; console.log(`ok ${checks} - concurrent branch change fails instead of force-pushing`);

check('ordinary/local/preview/unpromoted builds cannot enter production sync', () => {
  for (const env of [{}, { VERCEL_ENV: 'production' }, { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' }]) assert.throws(() => assertSyncInvocation([], env));
  for (const env of [{ npm_lifecycle_event: 'build' }, { npm_lifecycle_event: 'postbuild', VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) assert.throws(() => assertSyncInvocation(['--confirm-production-sync'], env));
  assertSyncInvocation(['--confirm-production-sync'], {});
  const buildEntrypoint = readFileSync('scripts/sync-published-articles.ts', 'utf8');
  assert(!/supabaseAdmin|fetch\(|\.upsert\(|\.delete\(/.test(buildEntrypoint));
});
const sha = 'a'.repeat(40);
const promotion: Promotion = { id: 'dpl_test', readyState: 'READY', target: 'production', createdAt: Date.parse('2026-08-04T11:00:00.000Z'), meta: { githubCommitSha: sha, githubCommitOrg: 'inbharatai', githubCommitRepo: 'Inbharat.ai' } };
check('promotion proof rejects wrong alias/sha/repository and unready/preview deployment', () => {
  assertProductionPromotion(promotion, 'dpl_test', 'dpl_test', sha);
  assert.throws(() => assertProductionPromotion(promotion, 'dpl_old', 'dpl_test', sha));
  assert.throws(() => assertProductionPromotion(promotion, 'dpl_test', 'dpl_test', 'b'.repeat(40)));
  for (const patch of [{ readyState: 'BUILDING' }, { target: 'preview' }, { meta: { ...promotion.meta, githubCommitRepo: 'other' } }]) assert.throws(() => assertProductionPromotion({ ...promotion, ...patch }, 'dpl_test', 'dpl_test', sha));
});
const rows = buildMirrorRows([input], { [input.slug]: 'Body' }, '2026-08-04');
check('mirror hash covers body, abstract, FAQ and modification; validates duplicates/dates', () => {
  for (const patch of [{ abstract: 'New' }, { faq: [{ q: 'Other', a: 'Answer' }] }, { dateModified: '2026-08-03' }]) assert.notEqual(buildMirrorRows([{ ...input, ...patch }], { [input.slug]: 'Body' }, '2026-08-04')[0].source_meta_sha, rows[0].source_meta_sha);
  assert.notEqual(buildMirrorRows([input], { [input.slug]: 'Revised' }, '2026-08-04')[0].source_meta_sha, rows[0].source_meta_sha);
  assert.equal(buildMirrorRows([{ ...input, datePublished: undefined }], { [input.slug]: 'Body' }, '2026-08-04')[0].publish_date, null);
  assert.throws(() => buildMirrorRows([], {}, '2026-08-04'));
  assert.throws(() => buildMirrorRows([input, input], { [input.slug]: 'Body' }, '2026-08-04'));
  assert.throws(() => buildMirrorRows([{ ...input, dateModified: '2027-01-01' }], { [input.slug]: 'Body' }, '2026-08-04'));
});
let reconciliations: unknown[] = [];
const deps = { promotion: async () => promotion, aliasDeploymentId: async () => 'dpl_test', verifyPage: async () => true, reconcile: async (payload: unknown) => { reconciliations.push(payload); } };
await reconcileVerifiedProduction(deps, 'dpl_test', sha, rows, now);
check('verified promotion sends one atomic snapshot with explicit freshness/provenance', () => {
  assert.equal(reconciliations.length, 1);
  assert.deepEqual(reconciliations[0], { rows, deployment_id: 'dpl_test', source_commit_sha: sha, deployment_created_at: '2026-08-04T11:00:00.000Z', verified_at: now });
});
reconciliations = [];
await assert.rejects(reconcileVerifiedProduction({ ...deps, verifyPage: async () => false }, 'dpl_test', sha, rows, now));
let aliases = 0;
await assert.rejects(reconcileVerifiedProduction({ ...deps, aliasDeploymentId: async () => ++aliases === 1 ? 'dpl_test' : 'dpl_changed' }, 'dpl_test', sha, rows, now));
check('page failures and promotion races produce no DB writes', () => assert.equal(reconciliations.length, 0));
check('SQL reconciliation is non-destructive, stateful, freshness-explicit and service-role gated (source contract)', () => {
  const sql = readFileSync('supabase/migrations/20261116000001_article_publication_lifecycle.sql', 'utf8');
  assert(!/\bDELETE\s+FROM\b|\bTRUNCATE\b/i.test(sql));
  assert(sql.includes("publication_state = 'removed'")); assert(sql.includes('removed_at = COALESCE(p.removed_at, observed)'));
  assert(sql.includes('synced_at = observed')); assert(sql.includes('first_verified_at = COALESCE(old.first_verified_at, observed)'));
  assert(sql.includes('pg_advisory_xact_lock')); assert(sql.includes('observed < previous.verified_at'));
  assert(sql.includes("THEN 'rollback'"));
  assert(sql.includes('REVOKE ALL ON FUNCTION')); assert(sql.includes('TO service_role'));
});
console.log(`\n${checks} hermetic article lifecycle checks passed (SQL source contract only; no PostgreSQL/live deployment exercised).`);
