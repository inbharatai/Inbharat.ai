/** EXPLICIT POST-PROMOTION ONLY. Never add this to build/prebuild/postbuild. */
import { execFileSync } from 'node:child_process';
import { PRODUCTION_ORIGIN, assertSyncInvocation, assertProductionPromotion, type Promotion } from '../lib/growth/production-article-sync.js';
import { reconcileCanonicalProduction } from '../lib/growth/canonical-article-sync.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assertSyncInvocation(args, process.env);
  const deploymentId = args.find(a => a.startsWith('--deployment-id='))?.slice('--deployment-id='.length);
  if (!deploymentId || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error('Supply --deployment-id=dpl_... for the promoted deployment');
  // A modified checkout cannot claim to be the code deployed at HEAD. Includes
  // untracked files, not ignored build outputs; no credentials are inspected.
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim();
  if (dirty) throw new Error('Use a clean checkout of the promoted commit');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const token = process.env.VERCEL_TOKEN;
  const dbUrl = process.env.SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !dbUrl || !dbKey) throw new Error('VERCEL_TOKEN and server-only Supabase configuration are required');
  const parsedDbUrl = new URL(dbUrl);
  if (parsedDbUrl.protocol !== 'https:' || parsedDbUrl.username || parsedDbUrl.password || parsedDbUrl.search || parsedDbUrl.hash || parsedDbUrl.pathname !== '/') throw new Error('Supabase URL must be a plain HTTPS origin');
  const team = process.env.VERCEL_TEAM_ID;
  const vercel = async (path: string) => {
    const response = await fetch(`https://api.vercel.com${path}${team ? `?teamId=${encodeURIComponent(team)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Vercel verification HTTP ${response.status}`);
    return response.json();
  };
  const verifyVercel = async () => {
    const promotion = await vercel(`/v13/deployments/${encodeURIComponent(deploymentId)}`) as Promotion;
    const alias = await vercel(`/v4/aliases/${encodeURIComponent(new URL(PRODUCTION_ORIGIN).hostname)}`) as { deploymentId?: string; deployment?: { id?: string } };
    assertProductionPromotion(promotion, alias.deploymentId ?? alias.deployment?.id ?? '', deploymentId, sha);
    const verifiedAt = new Date().toISOString();
    if (promotion.createdAt > Date.parse(verifiedAt)) throw new Error('Deployment creation date is in the future');
    return { deployment_id: deploymentId, deployment_created_at: new Date(promotion.createdAt).toISOString(), verified_at: verifiedAt };
  };
  await verifyVercel();
  // Same canonical content hashes/checkpoint as the automatic path; optional
  // Vercel proof is additional evidence, never substituted for snapshot identity.
  const result = await reconcileCanonicalProduction({
    fetch,
    beforeWrite: verifyVercel,
    reconcile: async payload => {
      const response = await fetch(`${parsedDbUrl.origin}/rest/v1/rpc/reconcile_production_articles`, {
        method: 'POST', headers: { apikey: dbKey, Authorization: `Bearer ${dbKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: payload }), redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Production reconciliation failed (HTTP ${response.status}); no per-row fallback. Check lifecycle SQL migration.`);
    },
  }, sha);
  console.log(`[sync-production-articles] Verified ${result.articles} live articles at ${sha}; removals tombstoned, no records deleted. First verification is not an exact first-publication timestamp.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Production sync failed'); process.exitCode = 1; });
