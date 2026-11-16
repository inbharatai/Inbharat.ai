import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeCron, getRequestId, isCronAuthErr } from '../../lib/requireAdmin.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { reconcileCanonicalProduction } from '../../../lib/growth/canonical-article-sync.js';

/** Production-only, authenticated post-promotion reconciliation. No Vercel API/token. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, status: 'failed', code: 'METHOD_NOT_ALLOWED', requestId });
  }
  if (process.env.VERCEL_ENV !== 'production' || process.env.VERCEL !== '1') {
    return res.status(403).json({ ok: false, status: 'failed', code: 'PRODUCTION_ONLY', requestId });
  }
  // Existing authorizeCron has a legacy spoofable UA/schedule shortcut. Do NOT
  // allow that shortcut for writes: retain its existing CRON_SECRET/admin paths.
  // Vercel cron sends Authorization: Bearer CRON_SECRET when configured.
  const headers = { ...req.headers };
  delete headers['user-agent']; delete headers['x-vercel-cron-schedule'];
  const auth = await authorizeCron({ ...req, headers } as VercelRequest);
  if (isCronAuthErr(auth)) return res.status(auth.status).json({ ...auth.body, status: 'failed', code: 'AUTH_REQUIRED' });
  if (auth.source !== 'cron-secret' && auth.source !== 'admin') return res.status(403).json({ ok: false, status: 'failed', code: 'AUTH_REQUIRED', requestId });
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!supabaseAdmin || !/^[a-f0-9]{40}$/.test(sha)) {
    return res.status(503).json({ ok: false, status: 'unconfigured', code: 'PUBLICATION_SYNC_UNCONFIGURED',
      detail: !supabaseAdmin ? 'Server Supabase configuration is required' : 'Running deployment source SHA is required', requestId });
  }
  try {
    const result = await reconcileCanonicalProduction({ fetch, reconcile: async snapshot => {
      const { error } = await supabaseAdmin.rpc('reconcile_production_articles', { snapshot }).abortSignal(AbortSignal.timeout(30000));
      if (error) {
        // No DB messages/credentials in public responses. Missing RPC is explicitly unconfigured.
        if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42703') throw new Error('MIGRATION_REQUIRED');
        throw new Error('RECONCILIATION_REJECTED');
      }
    } }, sha);
    return res.status(200).json({ ok: true, status: 'reconciled', requestId, ...result });
  } catch (error) {
    const migration = error instanceof Error && error.message === 'MIGRATION_REQUIRED';
    // Deliberately no success for skipped verification, missing migration or failed RPC.
    return res.status(migration ? 503 : 502).json({ ok: false, status: migration ? 'unconfigured' : 'failed',
      code: migration ? 'MIGRATION_REQUIRED' : 'PUBLICATION_SYNC_FAILED', requestId,
      detail: migration ? 'Review and apply article-publication-lifecycle.sql separately' : 'Canonical verification or atomic reconciliation failed; no per-row fallback' });
  }
}
