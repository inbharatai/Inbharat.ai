import { test, expect, type Page } from '@playwright/test';

import en from '../locales/en.json' with { type: 'json' };
import { selectCompanyProduct } from './scoped-helpers';
const hero = 'header#main-content';
const title = `${en.landHeroTitle1} ${en.landHeroTitle2}`;

async function assertRealLanding(page: Page) {
  await expect(page.locator('#root main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator(hero)).toHaveCount(1);
  await expect(page.locator(`${hero} h1`)).toHaveText(title, { useInnerText: true });
  expect(await page.locator('.landing-shell').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('nav').first()).toBeVisible();
  await expect(page.locator(`${hero} [lang="sa"]`)).toBeVisible();
  await expect(page.locator(`${hero} ul[aria-label="Recognitions and programmes"]`)).toBeVisible();
  await expect(page.locator(`${hero} a[href="/unoone"]`).filter({ hasText: en.landHeroCta2 })).toBeVisible();
  await expect(page.locator(`${hero} a[href="/app"]`)).toHaveText(en.landHeroCta1);
  await expect(page.locator('footer a[href="/app"]')).toBeVisible();
  await expect(page.locator('#pai video')).toBeVisible();
  await expect(page.locator('#pai video')).toHaveAttribute('poster', /unoone-demo-poster/);
  await expect(page.locator('[data-static-fallback], [data-seo-body]')).toHaveCount(0);
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Playwright's visibility alone accepts opacity:0. Check every ancestor of
  // actual text and CTA nodes, so hidden motion entrances cannot sneak through.
  // Native <video> fallback links are not rendered by a video-capable browser;
  // their empty computed style is not a hidden headline/CTA regression.
  expect(await page.locator(`${hero} h1 span, ${hero} p, ${hero} a`).evaluateAll(nodes => nodes.filter(node => !node.closest('video')).every(node => {
    for (let el: Element | null = node; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (Number(s.opacity) < 0.95 || s.visibility === 'hidden' || s.display === 'none') return false;
    }
    return true;
  }))).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`styled first frame survives delayed JS and stays visible across mount at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending: string[] = [];
    await page.route('**/assets/*.js', async route => {
      pending.push(route.request().url());
      await gate;
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    try {
      await assertRealLanding(page);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'false');
      expect(pending.length).toBeGreaterThan(0);
      // Deliberately keep the app unavailable beyond the reported one-second flash.
      await page.waitForTimeout(1200);
      await assertRealLanding(page);
      await page.screenshot({ path: testInfo.outputPath(`delayed-${width}.png`) });
      const before = await page.locator(`${hero} h1`).boundingBox();
      // Observe every animation frame during the actual replacement commit;
      // sample both H1 words and CTAs, not merely the final stable DOM.
      await page.evaluate(() => {
        const state = { frames: 0, blanks: 0, running: true };
        (window as any).__firstPaint = state;
        const sample = () => {
          if (!state.running) return;
          const heading = document.querySelector('header h1');
          const nodes = Array.from(document.querySelectorAll('header h1, header a[href="/app"], header a[href="/unoone"]'));
          const visible = !!heading?.getBoundingClientRect().height && nodes.length > 2 && nodes.every(node => {
            for (let el: Element | null = node; el; el = el.parentElement) {
              const s = getComputedStyle(el);
              if (Number(s.opacity) < 0.95 || s.visibility === 'hidden' || s.display === 'none') return false;
            }
            return true;
          });
          state.frames++;
          if (!visible) state.blanks++;
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      release();
      await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
      await assertRealLanding(page);
      await expect.poll(() => page.evaluate(() => (window as any).__firstPaint.frames)).toBeGreaterThan(30);
      const sampled = await page.evaluate(() => { const s = (window as any).__firstPaint; s.running = false; return s; });
      expect(sampled.blanks).toBe(0);
      const after = await page.locator(`${hero} h1`).boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after![key] - before![key])).toBeLessThan(2);
      await page.screenshot({ path: testInfo.outputPath(`mounted-${width}.png`) });
      // Prove actual controls were attached, not an inert screenshot/fallback.
      if (width < 640) await page.getByRole('button', { name: en.openMenu, exact: true }).click();
      const selector = page.getByRole('combobox').filter({ visible: true }).first();
      await expect(selector).toBeVisible();
      await selector.selectOption('hi');
      await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      await selector.selectOption('en');
      await expect(page.locator('[data-product-directory]')).toBeHidden();
      await selectCompanyProduct(page, 'SwasthyaScore AI');
    } finally { release(); }
  });

  test(`disabled JS retains the full readable landing and native directory at ${width}px`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width, height: 1000 } });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await assertRealLanding(page);
      await page.screenshot({ path: testInfo.outputPath(`nojs-${width}.png`) });
      for (const id of ['pai', 'deep-tech', 'products', 'mission', 'faq', 'contact']) await expect(page.locator(`#${id}`)).toBeVisible();
      await page.locator('[data-product-directory] summary').click();
      await expect(page.locator('[data-product-directory] article')).toHaveCount(15);
      for (const article of await page.locator('[data-product-directory] article').all()) {
        await expect(article.locator('p')).toBeVisible();
        await expect(article.locator('a')).toHaveAttribute('href', /.+/);
      }
      await expect(page.locator('#mission h2').first()).toBeVisible();
      await expect(page.locator('footer a[href="/about"]')).toBeVisible();
      await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
    } finally { await context.close(); }
  });

  test(`failed app bundle leaves the real landing, not a blank loader at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/assets/*.js', route => route.abort('failed'));
    // Existing recovery makes at most one cache-busting retry; then remains static.
    await page.goto('/?__r=1');
    await assertRealLanding(page);
    await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'false');
    await page.locator('[data-product-directory] summary').click();
    await expect(page.locator('[data-product-directory] article').last()).toBeVisible();
  });
}
