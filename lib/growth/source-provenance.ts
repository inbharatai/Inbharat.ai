import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Fixed public repository: neither environment variables nor API entries select a host/repo. */
export const SOURCE_REPOSITORY = 'inbharatai/Inbharat.ai';
const API = `https://api.github.com/repos/${SOURCE_REPOSITORY}/git/trees/`;
const SHA = /^[a-f0-9]{40}$/;
export const PROVENANCE_LIMITS = { responseBytes: 4 * 1024 * 1024, entries: 10000, fileBytes: 64 * 1024 * 1024,
  totalBytes: 256 * 1024 * 1024, requestMs: 15000, runMs: 60000, walkEntries: 20000 } as const;
export type ProvenanceReason = 'VERIFIED_LOCAL_GIT' | 'VERIFIED_PUBLIC_TREE' | 'NOT_VERCEL' | 'NOT_PRODUCTION'
  | 'INVALID_SOURCE_SHA' | 'GIT_UNAVAILABLE' | 'GIT_HEAD_MISMATCH' | 'GIT_DIRTY' | 'UNSAFE_ROOT'
  | 'TREE_FETCH_FAILED' | 'TREE_RESPONSE_INVALID' | 'TREE_TRUNCATED' | 'TREE_LIMIT_EXCEEDED'
  | 'TREE_INVALID' | 'UNSAFE_PATH' | 'UNSUPPORTED_GIT_OBJECT' | 'FILE_MISSING' | 'FILE_UNSAFE'
  | 'FILE_MISMATCH' | 'FILE_READ_FAILED' | 'UNTRACKED_SOURCE' | 'VERIFICATION_DEADLINE';
/** Safe to put in public snapshots and logs: only fixed codes, booleans and counts. */
export type SourceProvenance = { version: 1; eligible: boolean; method: 'none' | 'local_git' | 'public_commit_tree';
  reason: ProvenanceReason; trackedFiles: number; verifiedFiles: number; verifiedBytes: number };
type Entry = { path: string; mode: string; type: string; sha: string; size?: number };
class Failure extends Error { constructor(readonly reason: ProvenanceReason) { super(reason); } }
const fail = (reason: ProvenanceReason): never => { throw new Failure(reason); };
const safePath = (p: string): boolean => p.length <= 1024 && !/[\\:]/.test(p)
  && [...p].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
  && !path.posix.isAbsolute(p) && p.split('/').every(s => !!s && s !== '.' && s !== '..' && s.toLowerCase() !== '.git');
function validateEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw) || !raw.length) return fail('TREE_INVALID');
  if (raw.length > PROVENANCE_LIMITS.entries) return fail('TREE_LIMIT_EXCEEDED');
  const seen = new Map<string, Entry>(); let bytes = 0; let blobs = 0;
  for (const value of raw) {
    const e = value as Entry;
    if (!e || typeof e.path !== 'string' || !safePath(e.path)) return fail('UNSAFE_PATH');
    if (seen.has(e.path) || !SHA.test(e.sha ?? '')) return fail('TREE_INVALID');
    if (e.type === 'tree' && e.mode === '040000') { /* Directory, never fetched. */ }
    else if (e.type === 'blob' && (e.mode === '100644' || e.mode === '100755')) {
      if (!Number.isSafeInteger(e.size) || e.size! < 0 || e.size! > PROVENANCE_LIMITS.fileBytes) return fail('TREE_LIMIT_EXCEEDED');
      bytes += e.size!; blobs++;
    } else return fail('UNSUPPORTED_GIT_OBJECT');
    seen.set(e.path, e);
  }
  if (!blobs || bytes > PROVENANCE_LIMITS.totalBytes) return fail('TREE_LIMIT_EXCEEDED');
  for (const e of seen.values()) {
    let parent = path.posix.dirname(e.path);
    while (parent !== '.') {
      if (seen.get(parent)?.type !== 'tree') return fail('TREE_INVALID');
      parent = path.posix.dirname(parent);
    }
  }
  return [...seen.values()];
}

async function publicTree(sha: string, fetcher: typeof fetch): Promise<Entry[]> {
  const url = `${API}${sha}?recursive=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVENANCE_LIMITS.requestMs);
  try {
    const response = await fetcher(url, { redirect: 'error', signal: controller.signal, credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'InBharatSourceProvenance/1.0' } });
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url)
      || !/^application\/json\b/i.test(response.headers.get('content-type') ?? '') || !response.body) return fail('TREE_RESPONSE_INVALID');
    if (Number(response.headers.get('content-length') ?? 0) > PROVENANCE_LIMITS.responseBytes) return fail('TREE_LIMIT_EXCEEDED');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (controller.signal.aborted) return fail('TREE_FETCH_FAILED');
        if (next.done) break;
        size += next.value.byteLength;
        if (size > PROVENANCE_LIMITS.responseBytes) return fail('TREE_LIMIT_EXCEEDED');
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const tree = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    // GitHub's tree-by-commit endpoint echoes the requested commit in sha/url.
    // Require that binding; do not follow entry URLs or trust a supplied repository.
    if (tree.sha !== sha || tree.url !== `${API}${sha}`) return fail('TREE_RESPONSE_INVALID');
    if (tree.truncated !== false) return fail('TREE_TRUNCATED');
    return validateEntries(tree.tree);
  } catch (error) {
    if (error instanceof Failure) throw error;
    return fail('TREE_FETCH_FAILED');
  } finally { controller.abort(); clearTimeout(timer); }
}

// Only output/dependency/operator-local paths are ignored when finding extra files.
// Tracked files are ALWAYS verified first, even if they occur under one of these paths.
const outputDirectories = new Set(['node_modules', 'dist', 'dist-ssr', '.vercel', 'reports', 'playwright-report', 'test-results',
  'public/field-lab', 'public/product-concepts', 'agent-arcade', '.cursor', '.idea', '.agents']);
// public/unoone already contains two tracked legacy PNGs, so its directory
// must still be traversed. Exempt only the exact newly materialized outputs,
// never arbitrary JavaScript/HTML or a whole tracked public subtree.
const unooneOutputs = new Set(['public/unoone/unoone-logo.png', 'public/unoone/unoone-logo-dark.png', 'public/unoone/unoone-demo.mp4',
  'public/unoone/unoone-demo-poster.jpg', 'public/unoone/unoone-demo-en.vtt']);
function ignoredOutput(p: string): boolean {
  return outputDirectories.has(p) || unooneOutputs.has(p) || p === '.env' || /^\.env(?:\..+)?\.local$/.test(p)
    || p === '.mcp.json' || p === 'skills-lock.json' || p === '.DS_Store' || /^[^/]+\.log$/.test(p);
}
async function verifyFiles(root: string, entries: Entry[], result: SourceProvenance, deadline: number): Promise<void> {
  const checkTime = () => { if (Date.now() >= deadline) fail('VERIFICATION_DEADLINE'); };
  result.trackedFiles = entries.filter(e => e.type === 'blob').length;
  // Validate directories before opening any file; never traverse symlinks.
  for (const e of entries.filter(e => e.type === 'tree')) {
    checkTime();
    const stat = await fs.lstat(path.join(root, e.path)).catch(() => fail('FILE_MISSING'));
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('FILE_UNSAFE');
  }
  for (const e of entries.filter(e => e.type === 'blob')) {
    checkTime();
    const file = path.join(root, e.path);
    const stat = await fs.lstat(file).catch(() => fail('FILE_MISSING'));
    if (!stat.isFile() || stat.isSymbolicLink()) fail('FILE_UNSAFE');
    if (stat.size !== e.size) fail('FILE_MISMATCH');
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => fail('FILE_READ_FAILED'));
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== e.size) fail('FILE_MISMATCH');
      const hash = createHash('sha1').update(`blob ${e.size}\0`); const buffer = Buffer.alloc(64 * 1024); let bytes = 0;
      for (;;) {
        checkTime();
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        bytes += bytesRead;
        if (bytes > e.size!) fail('FILE_MISMATCH');
        hash.update(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat();
      if (bytes !== e.size || hash.digest('hex') !== e.sha || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('FILE_MISMATCH');
      result.verifiedFiles++; result.verifiedBytes += bytes;
    } finally { await handle.close(); }
  }
  // Extra source can affect glob imports/build tooling. Do not silently ignore it.
  const tracked = new Set(entries.map(e => e.path)); let visited = 0;
  async function walk(dir: string): Promise<void> {
    checkTime();
    const handle = await fs.opendir(path.join(root, dir));
    try {
      for await (const item of handle) {
        checkTime();
        if (++visited > PROVENANCE_LIMITS.walkEntries) fail('TREE_LIMIT_EXCEEDED');
        const p = dir ? `${dir}/${item.name}` : item.name;
        if (p === '.git' || (!tracked.has(p) && ignoredOutput(p))) continue;
        if (item.isSymbolicLink()) fail('FILE_UNSAFE');
        if (!tracked.has(p)) fail('UNTRACKED_SOURCE');
        if (item.isDirectory()) await walk(p);
      }
    } finally { await handle.close().catch(() => undefined); }
  }
  await walk('');
}

/** Build-time only. No credentials, DB writes, executable remote content, or arbitrary URLs. */
export async function verifySourceProvenance(input: {
  root: string; env: Partial<Pick<NodeJS.ProcessEnv, 'VERCEL' | 'VERCEL_ENV' | 'VERCEL_GIT_COMMIT_SHA'>>; fetch?: typeof fetch;
}): Promise<SourceProvenance> {
  const result: SourceProvenance = { version: 1, eligible: false, method: 'none', reason: 'INVALID_SOURCE_SHA', trackedFiles: 0, verifiedFiles: 0, verifiedBytes: 0 };
  const deadline = Date.now() + PROVENANCE_LIMITS.runMs;
  const git = (args: string[]) => execFileSync('git', args, { cwd: input.root, encoding: 'utf8', timeout: 10000,
    maxBuffer: PROVENANCE_LIMITS.responseBytes, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    if (input.env.VERCEL !== '1') fail('NOT_VERCEL');
    if (input.env.VERCEL_ENV !== 'production') fail('NOT_PRODUCTION');
    const sha = input.env.VERCEL_GIT_COMMIT_SHA;
    if (!SHA.test(sha ?? '')) fail('INVALID_SOURCE_SHA');
    const root = path.resolve(input.root);
    if (await fs.realpath(root) !== root) fail('UNSAFE_ROOT');
    const gitMarker = await fs.lstat(path.join(root, '.git')).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return fail('GIT_UNAVAILABLE');
    });
    let entries: Entry[];
    if (gitMarker) {
      if (gitMarker.isSymbolicLink()) fail('FILE_UNSAFE');
      result.method = 'local_git';
      try {
        if (git(['rev-parse', '--show-toplevel']).trim() !== root) fail('UNSAFE_ROOT');
        if (git(['rev-parse', 'HEAD']).trim() !== sha) fail('GIT_HEAD_MISMATCH');
        // Known dirty/unreadable Git never falls back to the public tree.
        if (git(['status', '--porcelain', '--untracked-files=normal']).trim()) fail('GIT_DIRTY');
        const raw = git(['ls-tree', '-r', '-t', '-z', '-l', '--full-tree', 'HEAD']);
        entries = validateEntries(raw.split('\0').filter(Boolean).map(line => {
          const tab = line.indexOf('\t'); const [mode, type, objectSha, size] = line.slice(0, tab).trim().split(/\s+/);
          return { path: line.slice(tab + 1), mode, type, sha: objectSha, ...(type === 'blob' ? { size: Number(size) } : {}) };
        }));
      } catch (error) { if (error instanceof Failure) throw error; return fail('GIT_UNAVAILABLE'); }
    } else {
      result.method = 'public_commit_tree';
      entries = await publicTree(sha!, input.fetch ?? fetch);
    }
    await verifyFiles(root, entries, result, deadline);
    result.eligible = true;
    result.reason = result.method === 'local_git' ? 'VERIFIED_LOCAL_GIT' : 'VERIFIED_PUBLIC_TREE';
  } catch (error) { result.reason = error instanceof Failure ? error.reason : 'FILE_READ_FAILED'; }
  return result;
}
