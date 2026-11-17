/** HERMETIC: fake fetch/DB only. No network, credentials, live proof or SQL execution. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE } from '../seo.config.js';
import { CANONICAL_MANIFEST_PATH, SYNC_LIMITS, createCanonicalSnapshot, reconcileCanonicalProduction,
  snapshotIdentity, validateCanonicalSnapshot, validArticleHtml, type CanonicalSnapshot, type CanonicalPayload } from '../lib/growth/canonical-article-sync.js';

const sha = 'a'.repeat(40);
const builtAt = '2025-01-02T00:00:00.000Z';
const article = { slug: 'hermetic-test', title: 'Hermetic test', description: 'Test', abstract: 'Test', category: 'Engineering', faq: [], readMinutes: 1 };
const url = `${SITE.url}/learn-ai-with-reeturaj/${article.slug}`;
const html = `<html><head><link href="${url}" rel="canonical"><script type="application/ld+json">{"@type":"TechArticle"}</script></head><body>Exact final bytes ✓</body></html>`;
const input = { articles: [article], bodies: { [article.slug]: '# Hermetic body' }, html: { [article.slug]: html }, builtAt, sourceCommitSha: sha, productionBuild: true, cleanSource: true };
const snapshot = createCanonicalSnapshot(input);
const json = (s: unknown) => new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } });
const page = (text = html, headers: Record<string, string> = {}) => new Response(text, { headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
function rehash(s: CanonicalSnapshot): CanonicalSnapshot { const { snapshotId: _, ...core } = s; return { ...core, snapshotId: snapshotIdentity(core) }; }
let checks = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); checks++; console.log(`PASS ${name}`); }
async function run(options: { manifest?: (count: number) => Response; page?: () => Response; sha?: string; dbFail?: boolean; beforeWrite?: () => Promise<CanonicalPayload['vercel_verification']> } = {}) {
  let writes = 0; let manifestReads = 0; const payloads: CanonicalPayload[] = []; const requests: string[] = [];
  const fetcher = (async (resource: string | URL | Request, init?: RequestInit) => {
    const target = String(resource); requests.push(target);
    assert.equal(new URL(target).origin, SITE.url); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert(init?.signal);
    if (target === `${SITE.url}${CANONICAL_MANIFEST_PATH}`) return options.manifest?.(++manifestReads) ?? json(snapshot);
    assert.equal(target, url); return options.page?.() ?? page();
  }) as typeof fetch;
  try {
    const result = await reconcileCanonicalProduction({ fetch: fetcher, beforeWrite: options.beforeWrite, reconcile: async payload => {
      writes++; if (options.dbFail) throw new Error('fake database rejects transaction'); payloads.push(payload);
    } }, options.sha ?? sha);
    return { result, writes, payloads, requests, error: null };
  } catch (error) { return { result: null, writes, payloads, requests, error }; }
}
async function rejectsBeforeWrite(options: Parameters<typeof run>[0]) { const r = await run(options); assert(r.error); assert.equal(r.writes, 0); }

await test('eligible snapshot identity covers build, rows, source/body hashes and exact final HTML', () => {
  assert.equal(snapshot.automatedSyncEligible, true); assert.equal(snapshot.articles[0].htmlBytes, Buffer.byteLength(html));
  assert.notEqual(snapshot.snapshotId, createCanonicalSnapshot({ ...input, bodies: { [article.slug]: '# Changed' } }).snapshotId);
  assert.notEqual(snapshot.snapshotId, createCanonicalSnapshot({ ...input, html: { [article.slug]: html + '\n' } }).snapshotId);
  assert.notEqual(snapshot.snapshotId, createCanonicalSnapshot({ ...input, builtAt: '2025-01-03T00:00:00.000Z' }).snapshotId);
  assert.equal(snapshot.articles[0].row.publish_date, null);
});
await test('local, preview, uncommitted and missing-SHA builds are ineligible', async () => {
  for (const override of [{ productionBuild: false }, { cleanSource: false }, { sourceCommitSha: undefined }, { sourceCommitSha: 'bad' }]) {
    const s = createCanonicalSnapshot({ ...input, ...override }); assert.equal(s.automatedSyncEligible, false);
    await rejectsBeforeWrite({ manifest: () => json(s) });
  }
});
await test('additive v1 provenance is identity-covered; legacy ineligible artifacts stay ineligible', async () => {
  const sourceProvenance = { version: 1 as const, eligible: true, method: 'public_commit_tree' as const,
    reason: 'VERIFIED_PUBLIC_TREE' as const, trackedFiles: 2, verifiedFiles: 2, verifiedBytes: 123 };
  const s = createCanonicalSnapshot({ ...input, sourceProvenance });
  assert.equal(s.version, 1); assert(s.automatedSyncEligible); assert.notEqual(s.snapshotId, snapshot.snapshotId);
  assert.equal(validateCanonicalSnapshot(s, sha, new Date().toISOString()).snapshotId, s.snapshotId);
  assert.equal((await run({ manifest: () => json(s) })).writes, 1);
  await rejectsBeforeWrite({ manifest: () => json({ ...s, sourceProvenance: { ...sourceProvenance, verifiedBytes: 124 } }) });
  for (const proof of [{ ...sourceProvenance, eligible: false }, { ...sourceProvenance, verifiedFiles: 1 }]) {
    assert.equal(createCanonicalSnapshot({ ...input, sourceProvenance: proof }).automatedSyncEligible, false);
    await rejectsBeforeWrite({ manifest: () => json(rehash({ ...s, sourceProvenance: proof })) });
  }
  const legacyLocal = createCanonicalSnapshot({ ...input, productionBuild: false });
  assert.equal(legacyLocal.sourceProvenance, undefined); assert.equal(legacyLocal.automatedSyncEligible, false);
  await rejectsBeforeWrite({ manifest: () => json(legacyLocal) });
  await rejectsBeforeWrite({ manifest: () => json(s), sha: 'b'.repeat(40) });
  await rejectsBeforeWrite({ manifest: () => json(s), page: () => page(html + '\n') });
});
await test('complete verification, second manifest check, exactly one atomic write; no Vercel dependency', async () => {
  const r = await run(); assert.equal(r.error, null); assert.equal(r.writes, 1);
  assert.equal(r.requests.length, 3); assert.equal(r.requests.at(-1), `${SITE.url}${CANONICAL_MANIFEST_PATH}`);
  const p = r.payloads[0]; assert.equal(p.snapshot_id, snapshot.snapshotId); assert.equal(p.snapshot_built_at, builtAt);
  assert.equal(p.verification_method, 'canonical_snapshot'); assert.equal(p.vercel_verification, undefined);
  assert.equal(p.rows[0].publish_date, null); assert(p.verified_at > p.snapshot_built_at);
});
await test('wrong running deployment commit rejects before page/DB', () => rejectsBeforeWrite({ sha: 'b'.repeat(40) }));
await test('snapshot byte/identity tampering rejects', () => rejectsBeforeWrite({ manifest: () => json({ ...snapshot, builtAt: '2025-01-04T00:00:00.000Z' }) }));
await test('future build rejected', () => rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, builtAt: '2999-01-01T00:00:00.000Z' })) }));
await test('empty snapshot cannot mass-tombstone', () => rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, articles: [] })) }));
await test('duplicate slug rejected', () => rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, articles: [...snapshot.articles, ...snapshot.articles] })) }));
await test('noncanonical origin or URL rejected without fetching arbitrary host', async () => {
  await rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, origin: 'https://evil.test' })) });
  await rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, articles: [{ ...snapshot.articles[0], row: { ...snapshot.articles[0].row, canonical_url: 'https://evil.test/a' } }] })) });
});
await test('foreign platform and future editorial dates rejected', async () => {
  for (const rowChange of [{ platform: 'linkedin' }, { publish_date: '2999-01-01' }, { source_meta_sha: 'bad' }]) {
    await rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, articles: [{ ...snapshot.articles[0], row: { ...snapshot.articles[0].row, ...rowChange } }] })) });
  }
});
await test('manifest changes during page verification: no write', () => rejectsBeforeWrite({ manifest: count => json(count === 1 ? snapshot : createCanonicalSnapshot({ ...input, builtAt: '2025-01-03T00:00:00.000Z' })) }));
await test('page missing, redirect, non-HTML, soft SPA fallback and exact-hash mismatch reject', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('', { status: 302, headers: { Location: url } }),
    new Response(html), page('<html>SPA fallback</html>'), page(html + ' ')]) await rejectsBeforeWrite({ page: () => response });
});
await test('response redirect flag or unexpected final URL rejects', async () => {
  for (const override of [{ redirected: true }, { url: 'https://evil.test/a' }]) {
    await rejectsBeforeWrite({ page: () => { const response = page(); for (const [key, value] of Object.entries(override)) Object.defineProperty(response, key, { value }); return response; } });
  }
});
await test('whole verification deadline expires before any write (fake clock)', async () => {
  const realNow = Date.now;
  try {
    await rejectsBeforeWrite({ page: () => { Date.now = () => realNow() + SYNC_LIMITS.runMs + 1; return page(); } });
  } finally { Date.now = realNow; }
});
await test('noindex and none HTTP headers reject exact matching HTML', async () => {
  for (const robots of ['noindex', 'googlebot: noindex', 'none']) await rejectsBeforeWrite({ page: () => page(html, { 'x-robots-tag': robots }) });
});
await test('HTML canonical/robots validation handles attr order, duplicates, scripts, unquoted and none', () => {
  assert(validArticleHtml(html, url));
  assert(!validArticleHtml(html.replace('</head>', '<meta content="none" name="robots"></head>'), url));
  assert(!validArticleHtml(html.replace('</head>', '<meta name=googlebot content=noindex></head>'), url));
  assert(!validArticleHtml(html.replace('</head>', `<link rel="canonical" href="${url}"></head>`), url));
  assert(!validArticleHtml(html.replace(`<link href="${url}" rel="canonical">`, `<script>const fake = '<link rel="canonical" href="${url}">'</script>`), url));
});
await test('bounded manifest and HTML responses reject advertised and streamed overflow', async () => {
  await rejectsBeforeWrite({ manifest: () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(SYNC_LIMITS.manifestBytes + 1) } }) });
  await rejectsBeforeWrite({ page: () => page(html, { 'content-length': String(SYNC_LIMITS.htmlBytes + 1) }) });
  await rejectsBeforeWrite({ page: () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(SYNC_LIMITS.htmlBytes + 1)); c.close(); } }), { headers: { 'content-type': 'text/html' } }) });
});
await test('malformed JSON, excessive count, corrupted stream reject', async () => {
  await rejectsBeforeWrite({ manifest: () => new Response('{broken', { headers: { 'content-type': 'application/json' } }) });
  await rejectsBeforeWrite({ manifest: () => json(rehash({ ...snapshot, articles: Array(SYNC_LIMITS.articles + 1).fill(snapshot.articles[0]) })) });
  await rejectsBeforeWrite({ page: () => new Response(new ReadableStream({ start(c) { c.error(new Error('fake stream failure')); } }), { headers: { 'content-type': 'text/html' } }) });
});
await test('DB failure surfaces failure; never per-row fallback', async () => { const r = await run({ dbFail: true }); assert(r.error); assert.equal(r.writes, 1); assert.equal(r.payloads.length, 0); });
await test('optional manual Vercel proof remains separately named evidence', async () => {
  const proof = { deployment_id: 'dpl_test', deployment_created_at: '2025-01-02T01:00:00.000Z', verified_at: '2025-01-02T02:00:00.000Z' };
  const r = await run({ beforeWrite: async () => proof }); assert.equal(r.error, null); assert.deepEqual(r.payloads[0].vercel_verification, proof);
  assert.equal(r.payloads[0].snapshot_built_at, builtAt);
  await rejectsBeforeWrite({ beforeWrite: async () => { throw new Error('alias changed'); } });
});
await test('repeated observation retains same snapshot identity, not a fabricated publication date', async () => {
  const a = await run(); const b = await run(); assert.equal(a.result?.snapshotId, b.result?.snapshotId); assert.equal(b.payloads[0].rows[0].publish_date, null);
});
await test('SQL source contract ONLY: atomic checkpoint, tombstone/revival, history, foreign isolation, service-role', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261116000001_article_publication_lifecycle.sql', import.meta.url), 'utf8');
  for (const text of ['pg_advisory_xact_lock', 'article_publication_observations', 'observed < previous.verified_at',
    'identity <> previous.canonical_snapshot_id', "publication_state = 'removed'", 'removed_at = NULL',
    'COALESCE(old.publish_date, excluded.publish_date)', 'COALESCE(old.first_verified_at, observed)',
    'COALESCE(p.removed_at, observed)', "p.syndication_type = 'original'", 'FROM PUBLIC, anon, authenticated',
    'TO service_role', 'vercel_verified_at']) assert(sql.includes(text), text);
  assert(!/DELETE\s+FROM\s+public\.published_articles/i.test(sql));
});
await test('cron/build wiring source contract ONLY: real auth, production gate, RPC deadline, no build DB writes', () => {
  const cron = readFileSync(new URL('../api/growth/cron/publication-sync.ts', import.meta.url), 'utf8');
  assert(cron.includes("delete headers['user-agent']")); assert(cron.includes("delete headers['x-vercel-cron-schedule']"));
  assert(cron.includes("auth.source !== 'cron-secret' && auth.source !== 'admin'"));
  assert(cron.includes("process.env.VERCEL_ENV !== 'production'")); assert(cron.includes("rpc('reconcile_production_articles'"));
  assert(cron.includes('AbortSignal.timeout(30000)')); assert(!cron.includes('VERCEL_TOKEN'));
  const build = readFileSync(new URL('../scripts/build-seo.ts', import.meta.url), 'utf8');
  assert(build.includes('createCanonicalSnapshot')); assert(build.includes('verifySourceProvenance'));
  assert(build.includes('JSON.stringify(sourceProvenance)')); assert(!build.includes('SUPABASE_SERVICE_ROLE_KEY'));
  const provenance = readFileSync(new URL('../lib/growth/source-provenance.ts', import.meta.url), 'utf8');
  assert(provenance.includes("'--porcelain'")); assert(provenance.includes("credentials: 'omit'"));
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert(config.crons.some((c: { path: string }) => c.path === '/api/growth/cron/publication-sync'));
  assert.equal(config.functions['api/growth/cron/publication-sync.ts'].maxDuration, 300);
});
assert.throws(() => validateCanonicalSnapshot(snapshot, '', new Date().toISOString()));
console.log(`Canonical article sync: ${checks} hermetic checks passed. NOT live production or executed SQL proof.`);
