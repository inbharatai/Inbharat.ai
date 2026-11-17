/** Local isolated fixtures and fake HTTP by default. --public-baseline adds ONE public read-only request. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVENANCE_LIMITS, SOURCE_REPOSITORY, verifySourceProvenance, type ProvenanceReason } from '../lib/growth/source-provenance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'source-provenance-'));
const sha = 'a'.repeat(40);
const env = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: sha };
const api = `https://api.github.com/repos/${SOURCE_REPOSITORY}/git/trees/${sha}`;
const text = 'export const source = "exact raw bytes ✓";\n';
const blob = (value: string) => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');
const entry = { path: 'source.ts', mode: '100644', type: 'blob', sha: blob(text), size: Buffer.byteLength(text) };
const tree = () => ({ sha, url: api, truncated: false, tree: [{ ...entry }] });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
let checks = 0;
async function test(name: string, fn: () => Promise<void>) { await fn(); checks++; console.log(`PASS ${name}`); }
async function fixture() { const dir = await fs.mkdtemp(path.join(tmp, 'case-')); await fs.writeFile(path.join(dir, 'source.ts'), text); return dir; }
async function check(reason: ProvenanceReason, opts: { body?: unknown; response?: () => Response | Promise<Response>; dir?: string; env?: typeof env } = {}) {
  let calls = 0;
  const result = await verifySourceProvenance({ root: opts.dir ?? await fixture(), env: opts.env ?? env,
    fetch: (async (url, init) => {
      calls++;
      assert.equal(String(url), `${api}?recursive=1`); assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert(init?.signal);
      assert(!new Headers(init?.headers).has('authorization'));
      return opts.response ? opts.response() : json(opts.body ?? tree());
    }) as typeof fetch });
  assert.equal(result.reason, reason, JSON.stringify(result));
  assert.equal(result.eligible, reason === 'VERIFIED_PUBLIC_TREE' || reason === 'VERIFIED_LOCAL_GIT');
  assert(calls <= 1);
  assert(!JSON.stringify(result).includes('source.ts'));
  return { result, calls };
}
try {
  await test('no-Git production verifies every raw Git blob against exact pinned public repository', async () => {
    const { result, calls } = await check('VERIFIED_PUBLIC_TREE'); assert.equal(calls, 1); assert.equal(result.trackedFiles, 1);
    assert.equal(result.verifiedFiles, 1); assert.equal(result.verifiedBytes, Buffer.byteLength(text));
  });
  await test('local/preview/missing-production/missing-or-malformed SHA never request network', async () => {
    for (const [override, reason] of [ [{ VERCEL: '' }, 'NOT_VERCEL'], [{ VERCEL_ENV: 'preview' }, 'NOT_PRODUCTION'],
      [{ VERCEL_ENV: '' }, 'NOT_PRODUCTION'], [{ VERCEL_GIT_COMMIT_SHA: '' }, 'INVALID_SOURCE_SHA'],
      [{ VERCEL_GIT_COMMIT_SHA: '../main' }, 'INVALID_SOURCE_SHA'] ] as const) {
      assert.equal((await check(reason, { env: { ...env, ...override } })).calls, 0);
    }
  });
  await test('known generated/untracked outputs ignored, arbitrary untracked source rejected', async () => {
    const dir = await fixture(); await fs.mkdir(path.join(dir, 'dist')); await fs.writeFile(path.join(dir, 'dist', 'index.html'), 'generated');
    await fs.mkdir(path.join(dir, 'node_modules')); await fs.writeFile(path.join(dir, '.env.local'), 'fixture-not-a-credential');
    await check('VERIFIED_PUBLIC_TREE', { dir }); await fs.writeFile(path.join(dir, 'injected.ts'), 'unexpected source');
    await check('UNTRACKED_SOURCE', { dir });
  });
  await test('mixed tracked UnoOne directory permits only known generated media, never extra source', async () => {
    const dir = await fixture();
    await fs.mkdir(path.join(dir, 'public', 'unoone'), { recursive: true });
    await fs.writeFile(path.join(dir, 'public', 'unoone', 'power-ui.png'), text);
    const entries = [entry,
      { path: 'public', type: 'tree', mode: '040000', sha },
      { path: 'public/unoone', type: 'tree', mode: '040000', sha },
      { ...entry, path: 'public/unoone/power-ui.png' }];
    for (const name of ['unoone-logo.png', 'unoone-logo-dark.png', 'unoone-demo.mp4', 'unoone-demo-poster.jpg', 'unoone-demo-en.vtt']) {
      await fs.writeFile(path.join(dir, 'public', 'unoone', name), 'generated fixture');
    }
    await check('VERIFIED_PUBLIC_TREE', { dir, body: { ...tree(), tree: entries } });
    await fs.writeFile(path.join(dir, 'public', 'unoone', 'injected.js'), 'unexpected source');
    await check('UNTRACKED_SOURCE', { dir, body: { ...tree(), tree: entries } });
    await fs.unlink(path.join(dir, 'public', 'unoone', 'injected.js'));
    await fs.writeFile(path.join(dir, 'public', 'unoone', 'power-ui.png'), 'wrong');
    await check('FILE_MISMATCH', { dir, body: { ...tree(), tree: entries } });
  });
  await test('tracked output paths are not exempt from raw hash verification', async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, '.env.local'), 'wrong');
    await check('FILE_MISMATCH', { dir, body: { ...tree(), tree: [{ ...entry, path: '.env.local' }] } });
  });
  await test('mutated same-size bytes, CRLF normalization and missing source reject', async () => {
    const dir = await fixture(); await fs.writeFile(path.join(dir, 'source.ts'), text.replace('exact', 'other')); await check('FILE_MISMATCH', { dir });
    await fs.writeFile(path.join(dir, 'source.ts'), text.replace('\n', '\r\n')); await check('FILE_MISMATCH', { dir });
    await fs.unlink(path.join(dir, 'source.ts')); await check('FILE_MISSING', { dir });
  });
  await test('wrong SHA/repository binding, redirects and non-JSON HTTP reject', async () => {
    for (const body of [{ ...tree(), sha: 'b'.repeat(40) }, { ...tree(), url: api.replace(SOURCE_REPOSITORY, 'evil/repo') }]) await check('TREE_RESPONSE_INVALID', { body });
    for (const response of [() => new Response('', { status: 302 }), () => new Response('{}'), () => new Response('', { status: 403 }),
      () => { const r = json(tree()); Object.defineProperty(r, 'url', { value: 'https://evil.test' }); return r; },
      () => { const r = json(tree()); Object.defineProperty(r, 'redirected', { value: true }); return r; }]) await check('TREE_RESPONSE_INVALID', { response });
  });
  await test('network errors, malformed JSON and broken streams fail closed without error leakage', async () => {
    for (const response of [() => { throw new Error('sensitive error details'); }, () => new Response('{', { headers: { 'content-type': 'application/json' } }),
      () => new Response(new ReadableStream({ start(c) { c.error(new Error('sensitive stream error')); } }), { headers: { 'content-type': 'application/json' } })]) await check('TREE_FETCH_FAILED', { response });
  });
  await test('missing/true truncation flags, excessive count, advertised and streamed size reject', async () => {
    await check('TREE_TRUNCATED', { body: { ...tree(), truncated: true } }); await check('TREE_TRUNCATED', { body: { ...tree(), truncated: undefined } });
    await check('TREE_LIMIT_EXCEEDED', { body: { ...tree(), tree: Array(PROVENANCE_LIMITS.entries + 1).fill(entry) } });
    await check('TREE_LIMIT_EXCEEDED', { response: () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(PROVENANCE_LIMITS.responseBytes + 1) } }) });
    await check('TREE_LIMIT_EXCEEDED', { response: () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(PROVENANCE_LIMITS.responseBytes + 1)); c.close(); } }), { headers: { 'content-type': 'application/json' } }) });
  });
  await test('whole verification deadline expires before any source is accepted (fake clock)', async () => {
    const now = Date.now;
    try {
      await check('VERIFICATION_DEADLINE', { response: () => {
        Date.now = () => now() + PROVENANCE_LIMITS.runMs + 1;
        return json(tree());
      } });
    } finally { Date.now = now; }
  });
  await test('unsafe tree paths never read outside checkout', async () => {
    for (const name of ['../outside', '/etc/passwd', 'x/../../outside', 'x\\outside', 'x//y', './source.ts', '.git/config', 'C:secret', 'x\0y']) {
      await check('UNSAFE_PATH', { body: { ...tree(), tree: [{ ...entry, path: name }] } });
    }
  });
  await test('symlink/submodule/unknown Git objects reject', async () => {
    for (const override of [{ mode: '120000' }, { type: 'commit', mode: '160000' }, { mode: '100664' }, { type: 'unknown' }]) {
      await check('UNSUPPORTED_GIT_OBJECT', { body: { ...tree(), tree: [{ ...entry, ...override }] } });
    }
  });
  await test('duplicate/malformed/tree-parent entries and file size limits reject', async () => {
    for (const entries of [[entry, entry], [{ ...entry, sha: 'bad' }], [{ ...entry, path: 'absent-parent/a.ts' }]]) await check('TREE_INVALID', { body: { ...tree(), tree: entries } });
    for (const size of [-1, 1.5, PROVENANCE_LIMITS.fileBytes + 1]) await check('TREE_LIMIT_EXCEEDED', { body: { ...tree(), tree: [{ ...entry, size }] } });
    await check('TREE_LIMIT_EXCEEDED', { body: { ...tree(), tree: Array.from({ length: 5 }, (_, i) => ({ ...entry, path: `${i}.ts`, size: PROVENANCE_LIMITS.fileBytes })) } });
  });
  await test('local file and ancestor symlinks rejected; nested normal tree succeeds', async () => {
    const dir = await fixture(); await fs.unlink(path.join(dir, 'source.ts')); await fs.symlink(path.join(root, 'package.json'), path.join(dir, 'source.ts'));
    await check('FILE_UNSAFE', { dir });
    const nested = { ...tree(), tree: [{ path: 'src', type: 'tree', mode: '040000', sha }, { ...entry, path: 'src/source.ts' }] };
    const good = await fs.mkdtemp(path.join(tmp, 'nested-')); await fs.mkdir(path.join(good, 'src')); await fs.writeFile(path.join(good, 'src/source.ts'), text);
    await check('VERIFIED_PUBLIC_TREE', { dir: good, body: nested });
    const bad = await fs.mkdtemp(path.join(tmp, 'symlink-')); await fs.symlink(path.join(good, 'src'), path.join(bad, 'src'));
    await check('FILE_UNSAFE', { dir: bad, body: nested });
  });
  await test('an existing broken .git never triggers remote fallback', async () => {
    const dir = await fixture(); await fs.mkdir(path.join(dir, '.git')); assert.equal((await check('GIT_UNAVAILABLE', { dir })).calls, 0);
  });
  await test('real isolated Git clean/dirty/wrong-SHA checks, generated ignored files and assume-unchanged mutation', async () => {
    const dir = path.join(tmp, 'local-clone');
    execFileSync('git', ['clone', '--shared', '--no-hardlinks', root, dir], { stdio: 'pipe' });
    const localSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const localEnv = { ...env, VERCEL_GIT_COMMIT_SHA: localSha };
    assert.equal((await check('VERIFIED_LOCAL_GIT', { dir, env: localEnv })).calls, 0);
    await fs.mkdir(path.join(dir, 'dist')); await fs.writeFile(path.join(dir, 'dist', 'index.html'), 'generated');
    await check('VERIFIED_LOCAL_GIT', { dir, env: localEnv });
    assert.equal((await check('GIT_HEAD_MISMATCH', { dir })).calls, 0);
    await fs.appendFile(path.join(dir, 'package-lock.json'), '\n');
    assert.equal((await check('GIT_DIRTY', { dir, env: localEnv })).calls, 0);
    execFileSync('git', ['update-index', '--assume-unchanged', 'package-lock.json'], { cwd: dir });
    assert.equal((await check('FILE_MISMATCH', { dir, env: localEnv })).calls, 0);
  });
  if (process.argv.includes('--public-baseline')) {
    await test('LIVE PUBLIC READ ONLY: exact baseline archive without .git independently verifies', async () => {
      const baseline = '10a6e8b745e7cb83054564f1904492f99b3c5ccd';
      const dir = path.join(tmp, 'public-baseline'); await fs.mkdir(dir);
      const archive = execFileSync('git', ['archive', baseline], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
      execFileSync('tar', ['-xf', '-', '-C', dir], { input: archive });
      const result = await verifySourceProvenance({ root: dir, env: { ...env, VERCEL_GIT_COMMIT_SHA: baseline } });
      console.log(`Public baseline result: ${JSON.stringify(result)}`);
      assert.equal(result.reason, 'VERIFIED_PUBLIC_TREE'); assert.equal(result.eligible, true);
    });
  }
  console.log(`Source provenance: ${checks} checks passed; no deployment, DB or credential access.`);
} finally { await fs.rm(tmp, { recursive: true, force: true }); }
