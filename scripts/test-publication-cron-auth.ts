/** Executes the real cron handler/auth guard with fixture requests. No network/DB. */
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NODE_ENV = 'production'; delete process.env.LOCAL_API_PORT;
process.env.CRON_SECRET = 'fixture-publication-cron';
process.env.VERCEL = '1'; process.env.VERCEL_ENV = 'production';
process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
globalThis.fetch = async () => { throw new Error('Network forbidden in cron auth test'); };
const { default: handler } = await import('../api/growth/cron/publication-sync.js');
async function invoke(headers: Record<string, string>, method = 'GET') {
  let status = 0; let body: Record<string, unknown> = {};
  const response = { setHeader: () => response, status: (code: number) => { status = code; return response; }, json: (value: Record<string, unknown>) => { body = value; return response; } };
  await handler({ method, headers, query: {} } as VercelRequest, response as unknown as VercelResponse);
  return { status, body };
}
for (const headers of [{}, { 'user-agent': 'vercel-cron/1.0', 'x-vercel-cron-schedule': '* * * * *' }, { authorization: 'Bearer wrong-fixture' }]) {
  const result = await invoke(headers);
  assert.ok(result.status >= 400);
  assert.equal(result.body.code, 'AUTH_REQUIRED');
  assert.notEqual(result.body.status, 'reconciled');
}
const authenticated = await invoke({ authorization: 'Bearer fixture-publication-cron' });
assert.equal(authenticated.status, 503);
assert.equal(authenticated.body.status, 'unconfigured');
assert.equal((await invoke({}, 'DELETE')).status, 405);
process.env.VERCEL_ENV = 'preview';
assert.equal((await invoke({ authorization: 'Bearer fixture-publication-cron' })).status, 403);
console.log('publication-cron-auth: real handler rejects spoofed schedule/UA, wrong secret, preview and wrong method; authenticated missing DB is explicitly unconfigured');
