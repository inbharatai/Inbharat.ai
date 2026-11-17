import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { UNOONE_PAGES, PRIVATE_AI_EVIDENCE_SCOPE, READINESS_LABELS } from '../content/privateAI';
import { ARTICLES, articlePath } from '../content/articles.meta';
import { ROUTES, GLOBAL_SCHEMA } from '../seo.config';
import { serializeInlineJson } from '../lib/rendering-contract';

async function assertSchema(page: Page, path: string) {
  const route = ROUTES.find((item) => item.path === path);
  const expected = route ? [...GLOBAL_SCHEMA, ...(route.extraSchema ?? [])] : [];
  await expect.poll(() => page.locator('script[data-seo-jsonld]').evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')))).toEqual(expected);
}

for (const product of UNOONE_PAGES) {
  test(`no JavaScript: ${product.path} exposes all shared claims and FAQ answers`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto(product.path);
    const main = page.locator('#root main');
    await expect(main).toHaveCount(1);
    await expect(main).toBeVisible();
    await expect(page.locator('[data-static-fallback], [data-seo-body]')).toHaveCount(0);
    await expect(main.locator('h1')).toHaveText(product.h1);
    for (const text of [product.description, product.status, product.audience, PRIVATE_AI_EVIDENCE_SCOPE,
      ...product.capabilities.flatMap((cap) => [cap.name, cap.what, READINESS_LABELS[cap.readiness], ...(cap.evidence ? [cap.evidence] : [])]),
      ...product.sections.flatMap((section) => [section.title, section.body]),
      ...product.faqs.flatMap((faq) => [faq.q, faq.a])]) {
      await expect(main).toContainText(text);
    }
    // The actual React tree uses native disclosures, operable without JS.
    for (const disclosure of await main.locator('details').all()) {
      if (!(await disclosure.evaluate(el => (el as HTMLDetailsElement).open))) await disclosure.locator('summary').click();
      await expect(disclosure.locator('p')).toBeVisible();
    }
    expect(await main.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
    await expect(page.locator('h1')).toHaveCount(1);
    await assertSchema(page, product.path);
    await context.close();
  });
}

test('Power → Mobile → contact retires static body and replaces the entire owned schema set', async ({ page }) => {
  const power = UNOONE_PAGES.find((item) => item.path === '/unoone/power')!;
  const mobile = UNOONE_PAGES.find((item) => item.path === '/unoone/mobile')!;
  await page.goto(power.path);
  await expect(page.locator('[data-static-fallback]')).toHaveCount(0);
  await assertSchema(page, power.path);
  // Independent integration-owned schema must not be removed by our SEO hook.
  await page.evaluate(() => {
    const tag = document.createElement('script');
    tag.id = 'independent-schema-fixture'; tag.type = 'application/ld+json';
    tag.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Thing', name: 'independent' });
    document.head.appendChild(tag);
  });
  await page.locator('footer a[href="/unoone/mobile"]').click();
  await expect(page.locator('h1')).toHaveText(mobile.h1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-static-fallback]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(power.h1);
  await assertSchema(page, mobile.path);
  for (const faq of mobile.faqs) {
    const disclosure = page.locator('main details').filter({ has: page.locator('summary', { hasText: faq.q }) });
    await disclosure.locator('summary').click();
    await expect(disclosure.locator('p')).toHaveText(faq.a);
  }
  for (const cap of mobile.capabilities) await expect(page.locator('main')).toContainText(cap.what);
  await page.locator('footer a[href="/contact"]').click();
  await expect(page).toHaveURL(/\/contact$/);
  await assertSchema(page, '/contact');
  await expect(page.locator('#independent-schema-fixture')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(mobile.h1);
});

test('article A → article B → contact has only current body, heading and structured data', async ({ page }) => {
  const a = ARTICLES[0];
  await page.goto(articlePath(a.slug));
  await expect(page.locator('[data-static-fallback]')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText(a.title);
  await assertSchema(page, articlePath(a.slug));
  const next = page.getByRole('navigation', { name: 'More articles' }).getByRole('link').last();
  const href = await next.getAttribute('href');
  const b = ARTICLES.find((item) => articlePath(item.slug) === href)!;
  await next.click();
  await expect(page.locator('h1')).toHaveText(b.title);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByText('Loading article…', { exact: true })).toHaveCount(0);
  await assertSchema(page, href!);
  for (const faq of b.faq) {
    const disclosure = page.locator('details').filter({ has: page.locator('summary', { hasText: faq.q }) });
    await disclosure.locator('summary').click();
    await expect(disclosure.locator('p')).toHaveText(faq.a);
  }
  await page.locator('footer').getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await assertSchema(page, '/contact');
  await expect(page.locator('[data-static-fallback]')).toHaveCount(0);
});

const headingArticles = ARTICLES.filter((article) => /^#\s/m.test(readFileSync(new URL(`../content/articles/${article.slug}.md`, import.meta.url), 'utf8')));
for (const article of headingArticles) {
  test(`article H1 normalization with and without JS: ${article.slug}`, async ({ page, browser }) => {
    await page.goto(articlePath(article.slug));
    await expect(page.locator('[data-static-fallback]')).toHaveCount(0);
    await expect(page.locator('.prose h2').first()).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const staticPage = await context.newPage();
    await staticPage.goto(articlePath(article.slug));
    await expect(staticPage.locator('#root main')).toBeVisible();
    await expect(staticPage.locator('h1')).toHaveText(article.title);
    await expect(staticPage.locator('h1')).toHaveCount(1);
    await expect(staticPage.locator('main h2').first()).toBeVisible();
    for (const faq of article.faq) await expect(staticPage.locator('main')).toContainText(faq.a);
    await context.close();
  });
}

test('unknown route and unknown article use explicit noindex without homepage entities', async ({ page }) => {
  for (const path of ['/rendering-fixture-not-a-route', '/learn-ai-with-reeturaj/rendering-fixture-missing']) {
    // Client-navigation contract, not an assertion about Vite or production HTTP status.
    await page.goto('/contact');
    await page.evaluate((next) => { history.pushState({}, '', next); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await expect(page.locator('h1')).toContainText(/not found|couldn't find/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await assertSchema(page, path);
  }
});

test('literal script closing text survives the browser HTML parser without creating executable markup', async ({ page }) => {
  const input = { '@type': 'FAQPage', text: '</script><script>window.__renderingInjected=true</script><!-- भारत\n\u2028' };
  await page.setContent(`<html><head><script type="application/ld+json" data-seo-jsonld="true">${serializeInlineJson(input)}</script></head><body><main>Safe</main></body></html>`);
  await expect(page.locator('script')).toHaveCount(1);
  expect(await page.locator('script').evaluate((tag) => JSON.parse(tag.textContent!))).toEqual(input);
  expect(await page.evaluate(() => '__renderingInjected' in window)).toBe(false);
});

test('all article metadata FAQs appear exactly once in actual static and mounted pages', async ({ page, browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  const staticPage = await context.newPage();
  const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
  for (const article of ARTICLES) {
    for (const current of [staticPage, page]) {
      await current.goto(articlePath(article.slug));
      if (current === page) {
        await expect(current.locator('[data-static-fallback]')).toHaveCount(0);
        // Absence of one loader is not positive readiness: React's outer
        // Suspense placeholder can precede the article component entirely.
        await expect(current.locator('h1')).toHaveText(article.title);
        await expect(current.locator('.prose')).toBeVisible();
        await expect(current.getByText('Loading article…', { exact: true })).toHaveCount(0);
      } else {
        await expect(current.locator('#root main h1')).toHaveText(article.title);
      }
      const text = normalized(await current.locator('#root').textContent() || '');
      for (const faq of article.faq) {
        expect(text.split(normalized(faq.q)).length - 1, `${article.slug} question, JS=${current === page}`).toBe(1);
        expect(text.split(normalized(faq.a)).length - 1, `${article.slug} answer, JS=${current === page}`).toBe(1);
      }
    }
  }
  await context.close();
});
