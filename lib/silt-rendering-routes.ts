/** SILT has two pages, not a catch-all SPA. Keep this list aligned with public/silt. */
const SILT_ASSETS = new Set([
  '/favicon.svg', '/logo.svg', '/README.md', '/PATENT.md',
  '/sitemap.xml', '/robots.txt', '/web/studio-bridge.js',
]);
export type SiltRenderingRoute =
  | { kind: 'redirect'; path: string }
  | { kind: 'file'; path: string; html: boolean; noIndex: boolean }
  | { kind: 'internal' }
  | { kind: 'missing' };

export function resolveSiltRenderingRoute(path: string): SiltRenderingRoute {
  if (path === '/index.html') return { kind: 'redirect', path: '/' };
  if (path === '/studio/' || path === '/studio/index.html') return { kind: 'redirect', path: '/studio' };
  if (path === '/') return { kind: 'file', path: '/silt/__root', html: true, noIndex: false };
  if (path === '/studio') return { kind: 'file', path: '/silt/studio/__root', html: true, noIndex: true };
  if (SILT_ASSETS.has(path)) return { kind: 'file', path: `/silt${path}`, html: false, noIndex: false };
  // Internal fetch recursion guard is exact, never a wildcard allowlist.
  if (path === '/silt/__root' || path === '/silt/studio/__root' ||
      (path.startsWith('/silt/') && SILT_ASSETS.has(path.slice(5)))) return { kind: 'internal' };
  return { kind: 'missing' };
}

export function siltNotFoundResponse(): Response {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found | SILT</title></head><body><main><h1>Page not found</h1><p>This SILT page does not exist.</p><a href="/">SILT research</a></main></body></html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
