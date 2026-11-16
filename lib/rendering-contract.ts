/** Shared static/client rendering primitives. No browser or package dependencies. */
export const SEO_JSONLD_ATTRIBUTE = 'data-seo-jsonld';

/** JSON.stringify alone is unsafe inside an HTML script element. */
export function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function escapeRenderingText(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function normalizeRenderingPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** Managed root contents are replaced by createRoot on the first successful commit. */
export function replaceManagedRoot(html: string, content: string): string {
  const root = /<div\s+id=["']root["'][^>]*>/i.exec(html);
  if (!root) throw new Error('SEO shell requires a managed #root');
  const start = root.index + root[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let tag: RegExpExecArray | null;
  while ((tag = tags.exec(html))) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + '\n' + content + '\n' + html.slice(tag.index);
  }
  throw new Error('SEO shell has an unclosed managed #root');
}

export function renderStaticFaqs(faqs: readonly { q: string; a: string }[]): string {
  if (!faqs.length) return '';
  return '<section aria-label="Frequently asked questions"><h2>Common questions</h2>' + faqs.map(({ q, a }) =>
    `<details open><summary>${escapeRenderingText(q)}</summary><p>${escapeRenderingText(a)}</p></details>`,
  ).join('\n') + '</section>';
}

/** Explicit client fallback; not a substitute for the hosting platform's HTTP 404. */
export const NOT_FOUND_RENDERING_SEO = {
  path: '/404',
  title: 'Page not found | InBharat.ai',
  description: 'This page does not exist. Explore InBharat.ai or contact us for help.',
  noIndex: true,
  excludeFromSitemap: true,
  multilingual: false,
  priority: 0,
  changefreq: 'never' as const,
  extraSchema: [],
  seoBody: {
    h1: 'Page not found',
    paragraphs: ['This page does not exist. Use the links below to find a public page.'],
  },
};
