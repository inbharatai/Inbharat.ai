import { companyDescription } from './scoped-helpers';
/** Run with: node_modules/.bin/tsx --test e2e/landing-ssr.contract.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import en from '../locales/en.json' with { type: 'json' };
import { PRODUCT_REGISTRY } from '../content/productRegistry';


test('real landing prerender is Node-safe, anonymous, deterministic and network-free', async () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => { requests.push(String(input)); throw new Error('Prerender must not fetch'); };
  try {
    const { renderStaticLanding } = await import('../components/landing/renderStaticLanding');
    const html = await renderStaticLanding();
    assert.equal(await renderStaticLanding(), html);
    assert.deepEqual(requests, []);
    const $ = load(html);
    assert.equal($('main').length, 1);
    assert.equal($('h1').length, 1);
    assert.equal($('main h1').clone().find('br').replaceWith(' ').end().text().replace(/\s+/g, ' ').trim(), `${en.landHeroTitle1} ${en.landHeroTitle2}`);
    assert.equal($('.landing-shell[data-landing-ready="false"]').length, 1);
    assert.equal($('header [lang="sa"]').length, 1);
    assert.equal($('header ul[aria-label="Recognitions and programmes"]').length, 1);
    assert.equal($('header a[href="/app"]').text().trim(), en.landHeroCta1);
    assert.equal($('header a[href="/unoone"]').text().trim(), en.landHeroCta2);
    assert.equal($('#pai a[href="/get-started"]').length, 1);
    assert.equal($('footer a[href="/app"]').length, 1);
    assert.equal($('header h1 br').length, 0);
    assert.deepEqual($('header .metric-num').map((_, el) => $(el).text()).get(), ['2', '11', '2']);
    assert.equal($('header [lang="sa"] br').length, 1);
    assert.ok(html.indexOf('कर्मण्येवाधिकारस्ते') < html.indexOf('<h1'));
    assert.deepEqual($('[data-product-directory] article h3').map((_, el) => $(el).text()).get(), PRODUCT_REGISTRY.map(product => product.name));
    for (const product of PRODUCT_REGISTRY) {
      const article = $('[data-product-directory] article').filter((_, el) => $(el).find('h3').text() === product.name);
      assert.equal(new URL(article.find('a').attr('href')!, 'https://www.inbharat.ai/').href, new URL(product.href, 'https://www.inbharat.ai/').href);
      assert.equal(article.find('p').first().text(), companyDescription(product.name));
    }
    assert.equal($('[data-product-directory] article').length, 15);
    assert.equal($('select').first().find('option').length, 11);
    assert.equal($('[data-static-fallback], [data-seo-body], script').length, 0);
    for (const node of $('h1,h2,h3,p,a,summary').toArray()) {
      // Closed native details are intentionally operable without JavaScript;
      // hidden SEO/motion content is not. Decorative aria-hidden nodes excluded.
      const element = $(node);
      if (element.parents('[aria-hidden="true"]').length) continue;
      for (const parent of element.add(element.parents()).toArray()) {
        assert.doesNotMatch($(parent).attr('style') || '', /(?:^|;)\s*(?:opacity:\s*0(?:;|$)|display:\s*none|visibility:\s*hidden)/);
      }
    }
    for (let n = 1; n <= 6; n++) {
      const key = `faqA${n}` as keyof typeof en;
      if (en[key]) assert.ok($('main').text().includes(en[key]), key);
    }
  } finally { globalThis.fetch = originalFetch; }
});
