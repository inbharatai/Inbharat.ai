/** Dependency-free smoke/contract tests. Run: node scripts/test-rendering-contract.ts */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { serializeInlineJson, replaceManagedRoot, renderStaticFaqs, normalizeRenderingPath, NOT_FOUND_RENDERING_SEO, escapeRenderingText } from '../lib/rendering-contract.ts';
import { prepareArticleMarkdown, normalizeArticleHeadings } from '../lib/article-rendering.ts';
import { renderPrivateAiStaticContent } from '../lib/private-ai-static-rendering.ts';
import { UNOONE_PAGES, PRIVATE_AI_EVIDENCE_SCOPE, READINESS_LABELS } from '../content/privateAI.ts';
import { resolveSiltRenderingRoute, siltNotFoundResponse } from '../lib/silt-rendering-routes.ts';

const source = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('inline JSON survives closing-script, HTML comments, Unicode, quotes and line breaks', () => {
  const input = { text: '</ScRiPt><script>throw new Error("injected")</script><!--\n\r"\\भारत\u2028\u2029' };
  const json = serializeInlineJson(input);
  assert(!json.includes('<'));
  assert(!json.includes('\u2028'));
  assert.deepEqual(JSON.parse(json), input);
  const shell = `<script type="application/ld+json">${json}</script>`;
  assert.equal((shell.match(/<\/script>/gi) ?? []).length, 1);
});

test('managed-root replacement is idempotent with nested divs and preserves scripts outside root', () => {
  const shell = '<html><head></head><body><div id="root"><div>old<div>nested</div></div></div><script src="/assets/main.js"></script></body></html>';
  const once = replaceManagedRoot(shell, '<main data-static-fallback="seo"><h1>New</h1></main>');
  assert(!once.includes('nested'));
  assert(once.includes('<script src="/assets/main.js">'));
  assert.equal(replaceManagedRoot(once, '<main data-static-fallback="seo"><h1>New</h1></main>'), once);
  assert.throws(() => replaceManagedRoot('<body></body>', ''), /requires/);
  assert.throws(() => replaceManagedRoot('<div id="root">', ''), /unclosed/);
});

test('all shared private-AI claims, readiness, limitations and FAQs are readable static markup', () => {
  for (const page of UNOONE_PAGES) {
    const html = renderPrivateAiStaticContent(page);
    for (const text of [page.h1, page.description, page.status, page.audience, PRIVATE_AI_EVIDENCE_SCOPE,
      ...page.capabilities.flatMap((cap) => [cap.name, cap.what, READINESS_LABELS[cap.readiness], cap.evidence ?? '']),
      ...page.sections.flatMap((section) => [section.title, section.body]),
      ...page.faqs.flatMap((faq) => [faq.q, faq.a])]) {
      assert(html.includes(escapeRenderingText(text)), `${page.path} lost shared content: ${text}`);
    }
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.equal((html.match(/<details open>/g) ?? []).length, page.faqs.length);
    assert(!/aria-hidden|display:none|clip:rect/.test(html));
  }
  assert(!renderStaticFaqs([{ q: '</summary><script>bad</script>', a: '<img onerror="bad">' }]).includes('<script>'));
});

test('shared article preparation removes duplicate abstract/FAQ without deleting code or following sections', () => {
  const markdown = '> Abstract\n\n# Title\n\n```md\n## Frequently Asked Questions\n# code heading\n```\n\n## Frequently Asked Questions\nQ: old\nA: old\n\n## Sources\nKeep this\n';
  const prepared = prepareArticleMarkdown(markdown, 'Abstract');
  assert(!prepared.includes('> Abstract'));
  assert(!prepared.includes('Q: old'));
  assert(prepared.includes('```md\n## Frequently Asked Questions\n# code heading\n```'));
  assert(prepared.includes('## Sources\nKeep this'));
  const tree = { type: 'root', children: [{ type: 'heading', depth: 1 }, { type: 'code', value: '# code' }, { type: 'heading', depth: 3 }] };
  normalizeArticleHeadings()(tree);
  assert.equal(tree.children[0].depth, 2);
  assert.equal(tree.children[1].value, '# code');
  assert.equal(tree.children[2].depth, 3);
});

test('every article uses the common markdown pipeline; all source bodies remain nonempty', () => {
  const files = readdirSync(new URL('../content/articles/', import.meta.url)).filter((file) => file.endsWith('.md'));
  assert(files.length > 0);
  for (const file of files) assert(prepareArticleMarkdown(source('content/articles/' + file)).trim(), file);
  const build = source('scripts/build-seo.ts');
  const react = source('pages/ArticlePage.tsx');
  for (const text of [build, react]) {
    assert(text.includes('prepareArticleMarkdown('));
    assert(text.includes('normalizeArticleHeadings'));
  }
  assert(build.includes('replaceManagedRoot(html, fallback)'));
  assert(!build.includes('return `  <section aria-hidden'));
  assert(build.includes('${SEO_JSONLD_ATTRIBUTE}="true"'));
  assert(source('lib/useDocumentHead.ts').includes('script[${SEO_JSONLD_ATTRIBUTE}]'));
});

test('unknown-route client contract is noindex, schema-free and path normalization is consistent', () => {
  assert.equal(normalizeRenderingPath('/unoone/'), '/unoone');
  assert.equal(normalizeRenderingPath('/'), '/');
  assert.equal(NOT_FOUND_RENDERING_SEO.noIndex, true);
  assert.deepEqual(NOT_FOUND_RENDERING_SEO.extraSchema, []);
  assert(source('lib/useDocumentHead.ts').includes('matched ?? NOT_FOUND_RENDERING_SEO'));
});

test('SILT uses exact known routes; unknown pages, nested routes and missing assets are real noindex 404s', async () => {
  assert.deepEqual(resolveSiltRenderingRoute('/'), { kind: 'file', path: '/silt/__root', html: true, noIndex: false });
  assert.deepEqual(resolveSiltRenderingRoute('/studio'), { kind: 'file', path: '/silt/studio/__root', html: true, noIndex: true });
  for (const path of ['/studio/', '/studio/index.html']) assert.deepEqual(resolveSiltRenderingRoute(path), { kind: 'redirect', path: '/studio' });
  assert.deepEqual(resolveSiltRenderingRoute('/index.html'), { kind: 'redirect', path: '/' });
  for (const path of ['/missing', '/missing.js', '/studio/missing', '/silt/missing', '/STUDIO', '/robots.txt/']) assert.equal(resolveSiltRenderingRoute(path).kind, 'missing', path);
  for (const path of ['/robots.txt', '/web/studio-bridge.js', '/README.md']) assert.equal(resolveSiltRenderingRoute(path).kind, 'file');
  assert.equal(resolveSiltRenderingRoute('/silt/__root').kind, 'internal');
  const response = siltNotFoundResponse();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert((await response.text()).includes('<h1>Page not found</h1>'));
  assert(!source('public/silt/sitemap.xml').includes('/studio'));
  assert(source('public/silt/studio/__root').includes('href="https://silt.inbharat.ai/studio"'));
  assert(source('public/silt/studio/__root').includes('content="noindex, nofollow"'));
});
