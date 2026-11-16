import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { toHtml } from 'hast-util-to-html';
import { load } from 'cheerio';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { ARTICLES } from '../content/articles.meta.js';
import { prepareArticleMarkdown, normalizeArticleHeadings, safeArticleUrl } from '../lib/article-rendering.js';
const processor = unified().use(remarkParse).use(remarkGfm).use(normalizeArticleHeadings).use(remarkRehype);
const render = async (md: string) => toHtml(await processor.run(processor.parse(md)));
const plain = (value: string) => load(value).text().replace(/\s+/g, ' ').trim();
let count = 0;
for (const article of ARTICLES) {
  const raw = readFileSync(new URL(`../content/articles/${article.slug}.md`, import.meta.url), 'utf8');
  const correction = raw.split(/\r?\n/)[0];
  assert.match(correction, /^> \*\*Content correction/);
  const correctionText = plain(await render(correction));
  const prepared = prepareArticleMarkdown(raw, article.abstract, article.faq.map((faq) => faq.q));
  const html = await render(prepared);
  const text = plain(html);
  assert.equal(text.split(correctionText).length - 1, 1, `${article.slug}: correction visible exactly once`);
  const react = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, normalizeArticleHeadings],
    urlTransform: (url, key) => safeArticleUrl(url, key === 'src'),
  }, prepared));
  assert.equal(plain(react).split(correctionText).length - 1, 1, `${article.slug}: React correction once`);
  for (const faq of article.faq) {
    const question = plain(await render(faq.q));
    const answer = plain(await render(faq.a));
    for (const rendered of [html, react]) {
      const bodyText = plain(rendered);
      assert.ok(!bodyText.includes(question), `${article.slug}: metadata question must not duplicate in body`);
      assert.ok(!bodyText.includes(answer), `${article.slug}: metadata answer must not duplicate in body`);
    }
  }
  count++;
}
const attack = '[bad](javascript:alert%281%29)\n\n[entity](javascript&#58;alert%281%29)\n\n[bad-data](data:text/html,boom)\n\n![bad-image](data:image/svg+xml,boom)\n\n[normal](https://example.com/page)\n\n[local](/about)\n\n[mail](mailto:hello@example.com)\n\n[ref][x]\n\n[x]: javascript:alert%281%29\n\n```txt\njavascript:example-in-code\n```';
for (const html of [await render(attack), renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, normalizeArticleHeadings], urlTransform: (url, key) => safeArticleUrl(url, key === 'src') }, attack))]) {
  const $ = load(html);
  $('a, img').each((_, el) => {
    for (const attr of ['href', 'src']) assert.ok(!/^(?:javascript|data|vbscript|file):/i.test($(el).attr(attr) || ''), `${attr} retained unsafe scheme`);
  });
  assert.equal($('a[href="https://example.com/page"]').length, 1);
  assert.equal($('a[href="/about"]').length, 1);
  assert.equal($('a[href="mailto:hello@example.com"]').length, 1);
  assert.match($('code').text(), /javascript:example-in-code/);
}
assert.match(prepareArticleMarkdown('> **Content correction:** Keep this\n\n> Abstract\n\nBody', 'Abstract'), /Content correction/);
assert.ok(!prepareArticleMarkdown('> **Content correction:** Keep this\n\n> Abstract\n\nBody', 'Abstract').includes('> Abstract'));
assert.equal(safeArticleUrl('JaVaScRiPt:alert(1)'), '');
assert.equal(safeArticleUrl('java\nscript:alert(1)'), '');
console.log(`article-render-safety: ${count} correction notices verified in independent HTML and React renderers; unsafe URL schemes blocked, normal links/code preserved`);
