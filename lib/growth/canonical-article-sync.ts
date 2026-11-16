import { createHash } from 'node:crypto';
import { SITE } from '../../seo.config.js';
import { buildMirrorRows, type SyncArticle, type MirrorRow } from './production-article-sync.js';
import { validArticleDate } from '../../content/article-lifecycle.js';

export const CANONICAL_MANIFEST_PATH = '/article-publication.json';
export const SYNC_LIMITS = { articles: 1000, manifestBytes: 4 * 1024 * 1024, htmlBytes: 4 * 1024 * 1024, requestMs: 15000, runMs: 240000 } as const;
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export type CanonicalArticle = { row: MirrorRow; bodySha256: string; bodyBytes: number; htmlSha256: string; htmlBytes: number };
export type CanonicalSnapshot = {
  version: 1; origin: string; builtAt: string; sourceCommitSha: string | null;
  automatedSyncEligible: boolean; articles: CanonicalArticle[]; snapshotId: string;
};
export type CanonicalPayload = {
  verification_method: 'canonical_snapshot'; snapshot_id: string; snapshot_built_at: string;
  source_commit_sha: string; verified_at: string; rows: MirrorRow[];
  vercel_verification?: { deployment_id: string; deployment_created_at: string; verified_at: string };
};
const iso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function snapshotIdentity(snapshot: Omit<CanonicalSnapshot, 'snapshotId'>): string { return sha256(stable(snapshot)); }
/** Build output only: no network, database, credentials or guessed live dates. */
export function createCanonicalSnapshot(input: {
  articles: SyncArticle[]; bodies: Record<string, string>; html: Record<string, string>;
  builtAt: string; sourceCommitSha?: string; productionBuild: boolean; cleanSource: boolean;
}): CanonicalSnapshot {
  if (!iso(input.builtAt)) throw new Error('Invalid build timestamp');
  const rows = buildMirrorRows(input.articles, input.bodies, input.builtAt.slice(0, 10));
  if (rows.length > SYNC_LIMITS.articles) throw new Error('Too many articles');
  const articles = rows.map(row => {
    const html = input.html[row.slug]; const body = input.bodies[row.slug];
    if (!html || Buffer.byteLength(html) > SYNC_LIMITS.htmlBytes || !validArticleHtml(html, row.canonical_url)) throw new Error(`Invalid final article HTML: ${row.slug}`);
    return { row, bodySha256: sha256(body), bodyBytes: Buffer.byteLength(body), htmlSha256: sha256(html), htmlBytes: Buffer.byteLength(html) };
  });
  const sourceCommitSha = COMMIT.test(input.sourceCommitSha ?? '') ? input.sourceCommitSha! : null;
  const core = { version: 1 as const, origin: SITE.url, builtAt: input.builtAt, sourceCommitSha,
    automatedSyncEligible: input.productionBuild && input.cleanSource && !!sourceCommitSha, articles };
  const snapshot = { ...core, snapshotId: snapshotIdentity(core) };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > SYNC_LIMITS.manifestBytes) throw new Error('Canonical snapshot exceeds manifest size limit');
  return snapshot;
}
function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return result;
}
export function validArticleHtml(html: string, url: string): boolean {
  // Inspect actual tags, not canonical-looking snippets inside script bodies.
  const tagsOnly = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const canonical = [...tagsOnly.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0])).filter(a => a.rel?.toLowerCase().split(/\s+/).includes('canonical'));
  const robots = [...tagsOnly.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0])).filter(a => /^(robots|googlebot|bingbot)$/i.test(a.name ?? ''));
  return canonical.length === 1 && canonical[0].href === url && /"@type"\s*:\s*"TechArticle"/.test(html)
    && !robots.some(a => /\b(noindex|none)\b/i.test(a.content ?? ''));
}
export function validateCanonicalSnapshot(raw: unknown, runningSha: string, now: string): CanonicalSnapshot {
  if (!raw || typeof raw !== 'object' || !COMMIT.test(runningSha) || !iso(now)) throw new Error('Invalid runtime identity');
  const s = raw as CanonicalSnapshot;
  const { snapshotId, ...core } = s;
  if (s.version !== 1 || s.origin !== SITE.url || s.automatedSyncEligible !== true || s.sourceCommitSha !== runningSha
    || !iso(s.builtAt) || Date.parse(s.builtAt) > Date.parse(now) || !SHA.test(snapshotId ?? '') || snapshotIdentity(core) !== snapshotId
    || !Array.isArray(s.articles) || s.articles.length === 0 || s.articles.length > SYNC_LIMITS.articles) throw new Error('Ineligible, corrupt or wrong-deployment canonical snapshot');
  const seen = new Set<string>();
  for (const a of s.articles) {
    const r = a?.row;
    if (!r || typeof r.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug) || seen.has(r.slug)
      || r.canonical_url !== `${SITE.url}/learn-ai-with-reeturaj/${r.slug}` || r.platform !== 'inbharat' || r.syndication_type !== 'original'
      || typeof r.title !== 'string' || !r.title.trim() || typeof r.category !== 'string' || !Array.isArray(r.keywords) || r.keywords.some(k => typeof k !== 'string')
      || !SHA.test(r.source_meta_sha ?? '') || !SHA.test(a.bodySha256 ?? '') || !SHA.test(a.htmlSha256 ?? '')
      || !Number.isSafeInteger(a.bodyBytes) || a.bodyBytes <= 0 || !Number.isSafeInteger(a.htmlBytes) || a.htmlBytes <= 0 || a.htmlBytes > SYNC_LIMITS.htmlBytes
      || (r.publish_date !== null && !validArticleDate(r.publish_date, now.slice(0, 10)))
      || (r.modified_date !== null && !validArticleDate(r.modified_date, now.slice(0, 10)))
      || (r.publish_date && r.modified_date && r.modified_date < r.publish_date)) throw new Error('Invalid canonical article row');
    seen.add(r.slug);
  }
  return s;
}
/** Enforce byte/deadline limits during streaming, not after allocating an unbounded body. */
async function boundedGet(fetcher: typeof fetch, url: string, max: number, deadline: number, json: boolean): Promise<{ bytes: Uint8Array; response: Response }> {
  if (new URL(url).origin !== SITE.url || Date.now() >= deadline) throw new Error('Noncanonical URL or sync deadline exceeded');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(SYNC_LIMITS.requestMs, deadline - Date.now()));
  try {
    const response = await fetcher(url, { redirect: 'error', signal: controller.signal, cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'InBharatPublicationSync/1.0' } });
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url)
      || !(json ? /^application\/json\b/i : /^text\/html\b/i).test(response.headers.get('content-type') ?? '')
      || Number(response.headers.get('content-length') ?? 0) > max || !response.body) throw new Error('Canonical fetch status, type, redirect or size failed');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > max || controller.signal.aborted || Date.now() >= deadline) throw new Error('Canonical fetch exceeded size/deadline');
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    if (controller.signal.aborted || Date.now() >= deadline) throw new Error('Canonical fetch deadline exceeded');
    return { bytes: Buffer.concat(chunks), response };
  } finally { controller.abort(); clearTimeout(timer); }
}
export async function reconcileCanonicalProduction(deps: {
  fetch: typeof fetch; reconcile: (payload: CanonicalPayload) => Promise<void>;
  /** Optional operator-only Vercel proof; never required by automatic cron. */
  beforeWrite?: () => Promise<CanonicalPayload['vercel_verification']>;
}, runningSha: string): Promise<{ snapshotId: string; articles: number; verifiedAt: string }> {
  const deadline = Date.now() + SYNC_LIMITS.runMs;
  const manifest = async () => {
    const { bytes } = await boundedGet(deps.fetch, `${SITE.url}${CANONICAL_MANIFEST_PATH}`, SYNC_LIMITS.manifestBytes, deadline, true);
    return validateCanonicalSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), runningSha, new Date().toISOString());
  };
  const snapshot = await manifest();
  // Bounded parallelism accommodates a growing catalogue without unbounded requests.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, snapshot.articles.length) }, async () => {
    while (next < snapshot.articles.length) {
      const article = snapshot.articles[next++];
      const { bytes, response } = await boundedGet(deps.fetch, article.row.canonical_url, SYNC_LIMITS.htmlBytes, deadline, false);
      if (bytes.byteLength !== article.htmlBytes || sha256(bytes) !== article.htmlSha256
        || /\b(noindex|none)\b/i.test(response.headers.get('x-robots-tag') ?? '')
        || !validArticleHtml(new TextDecoder('utf-8', { fatal: true }).decode(bytes), article.row.canonical_url)) throw new Error(`Canonical article verification failed: ${article.row.slug}`);
    }
  }));
  const vercel = await deps.beforeWrite?.();
  if ((await manifest()).snapshotId !== snapshot.snapshotId) throw new Error('Canonical snapshot changed during verification');
  const verifiedAt = new Date().toISOString();
  if (Date.now() >= deadline) throw new Error('Sync verification deadline exceeded');
  // The only write; adapter MUST use the transactional RPC, never per-row fallback.
  await deps.reconcile({ verification_method: 'canonical_snapshot', snapshot_id: snapshot.snapshotId,
    snapshot_built_at: snapshot.builtAt, source_commit_sha: runningSha, verified_at: verifiedAt,
    rows: snapshot.articles.map(a => a.row), ...(vercel ? { vercel_verification: vercel } : {}) });
  return { snapshotId: snapshot.snapshotId, articles: snapshot.articles.length, verifiedAt };
}
