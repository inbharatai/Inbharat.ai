import { createHash } from 'node:crypto';
import { validArticleDate } from '../../content/article-lifecycle.js';
import { SITE } from '../../seo.config.js';

export const PRODUCTION_ORIGIN = SITE.url;
export type SyncArticle = {
  slug: string; title: string; description: string; abstract: string; category: string;
  faq: { q: string; a: string }[]; readMinutes: number; hashtags?: string[];
  datePublished?: string; dateModified?: string; visual?: string; videoUrl?: string;
};
export type Promotion = { id: string; readyState: string; target: string; createdAt: number; meta: { githubCommitSha?: string; githubCommitOrg?: string; githubCommitRepo?: string } };
export type MirrorRow = {
  slug: string; title: string; canonical_url: string; publish_date: string | null;
  modified_date: string | null; category: string; keywords: string[];
  platform: string; syndication_type: string; source_meta_sha: string;
};

export function assertSyncInvocation(args: string[], env: Record<string, string | undefined>): void {
  if (!args.includes('--confirm-production-sync')) throw new Error('Explicit production reconciliation confirmation required');
  if (env.npm_lifecycle_event || (env.VERCEL_ENV && env.VERCEL_ENV !== 'production')) throw new Error('Production reconciliation cannot run in npm lifecycle or preview/development environments');
}
export function assertProductionPromotion(promotion: Promotion, aliasDeploymentId: string, expectedId: string, sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha) || !expectedId || promotion.id !== expectedId || aliasDeploymentId !== expectedId
    || promotion.readyState !== 'READY' || promotion.target !== 'production'
    || promotion.meta?.githubCommitSha !== sha || promotion.meta.githubCommitOrg !== 'inbharatai'
    || promotion.meta.githubCommitRepo !== 'Inbharat.ai' || !Number.isFinite(promotion.createdAt) || promotion.createdAt <= 0) {
    throw new Error('Production alias, deployment readiness, repository or commit verification failed');
  }
}
export function buildMirrorRows(articles: SyncArticle[], bodies: Record<string, string>, today: string): MirrorRow[] {
  if (!validArticleDate(today) || !articles.length) throw new Error('Refusing invalid/empty production snapshot');
  const seen = new Set<string>();
  return articles.map(a => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug) || seen.has(a.slug) || !bodies[a.slug]?.trim()) throw new Error('Duplicate/invalid slug or missing article body');
    seen.add(a.slug);
    for (const d of [a.datePublished, a.dateModified]) if (d !== undefined && !validArticleDate(d, today)) throw new Error(`Invalid/future lifecycle date for ${a.slug}`);
    if (a.datePublished && a.dateModified && a.dateModified < a.datePublished) throw new Error('Modification predates publication');
    // Covers all source metadata and body, not just the original five fields.
    const source_meta_sha = createHash('sha256').update(JSON.stringify(a)).update('\0').update(bodies[a.slug]).digest('hex');
    return { slug: a.slug, title: a.title, canonical_url: `${PRODUCTION_ORIGIN}/learn-ai-with-reeturaj/${a.slug}`,
      publish_date: a.datePublished ?? null, modified_date: a.dateModified ?? null, category: a.category,
      keywords: a.hashtags ?? [], platform: 'inbharat', syndication_type: 'original', source_meta_sha };
  });
}

export type SyncDependencies = {
  promotion: () => Promise<Promotion>;
  aliasDeploymentId: () => Promise<string>;
  verifyPage: (url: string) => Promise<boolean>;
  reconcile: (payload: { rows: MirrorRow[]; deployment_id: string; source_commit_sha: string; deployment_created_at: string; verified_at: string }) => Promise<void>;
};
/** Every verification completes before the ONLY write. Adapter must call the
 * transactional reconcile RPC; no partial upsert/delete fallback is permitted. */
export async function reconcileVerifiedProduction(deps: SyncDependencies, expectedId: string, sha: string, rows: MirrorRow[], now: string): Promise<void> {
  if (!rows.length || new Date(now).toISOString() !== now) throw new Error('Invalid production reconciliation snapshot');
  const promotion = await deps.promotion();
  assertProductionPromotion(promotion, await deps.aliasDeploymentId(), expectedId, sha);
  if (promotion.createdAt > Date.parse(now)) throw new Error('Deployment date is in the future');
  for (const row of rows) {
    if (row.canonical_url !== `${PRODUCTION_ORIGIN}/learn-ai-with-reeturaj/${row.slug}` || !await deps.verifyPage(row.canonical_url)) throw new Error(`Production article verification failed: ${row.slug}`);
  }
  // Close the long page-verification window. A concurrent promotion after this
  // check remains an unavoidable external-system race; the next sync reconciles it.
  assertProductionPromotion(await deps.promotion(), await deps.aliasDeploymentId(), expectedId, sha);
  await deps.reconcile({ rows, deployment_id: expectedId, source_commit_sha: sha, deployment_created_at: new Date(promotion.createdAt).toISOString(), verified_at: now });
}
