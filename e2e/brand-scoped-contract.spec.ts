import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { UNOONE_CAPABILITIES } from '../content/unooneCapabilities';
import { PRODUCT_REGISTRY } from '../content/productRegistry';
import { companyDescription, selectCompanyProduct } from './scoped-helpers';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

// Fixed baseline 10a6e8b: not read from current HEAD at runtime (a later commit
// must not silently redefine the protected values).
const protectedUpperHash = '204ff6f123b662d561b95ca602a29856189b6d95d20f3660afdf3c9a8385ec99';
const companyLogoHash = 'acdae9ae33bd14eb466a29066610397a75966f82b0ca9d241e5eac6352a59df7';
test('all eleven protected upper locale resources and original company mark stay byte/content exact', () => {
  const protectedValues: Record<string, Record<string, string>> = {};
  for (const code of ['en','hi','bn','te','mr','ta','gu','kn','ml','or','as']) {
    const messages = JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'));
    expect(messages.landHeroCta2).toBe('Meet UnoOne');
    expect(messages.landHeroDesc).toContain('Meet UnoOne');
    // Owner explicitly authorized this name correction on 17 November. Normalize
    // only that phrase back to the frozen baseline; all other upper values stay exact.
    protectedValues[code] = Object.fromEntries(Object.entries(messages).filter(([key]) => /^(landHero|landNav|landBrand|landMetric|gita)/.test(key))) as Record<string, string>;
    for (const key of ['landHeroCta2', 'landHeroDesc']) protectedValues[code][key] = protectedValues[code][key].replace('Meet UnoOne', 'Meet PAI');
  }
  expect(hash(JSON.stringify(protectedValues))).toBe(protectedUpperHash);
  expect(hash(readFileSync(new URL('../public/inbharat-logo.svg', import.meta.url)))).toBe(companyLogoHash);
  expect(hash(readFileSync(new URL('../public/unoone/unoone-logo-dark.png', import.meta.url)))).toBe('191b20660f82bcbfdb24430383ca589a56675ab0b8a14e025fe502f28e85bb22');
  expect(hash(readFileSync(new URL('../public/unoone/unoone-logo.png', import.meta.url)))).toBe('8b800572d78ee689238196c5f9372d83d607dafbd728efd4e613dbaa564fbdfc');
});

for (const width of [320, 390, 768, 1440]) {
  test(`scoped company brand, 12 real capability controls and all 15 original picker entries at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, hasTouch: width < 640, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const errors: string[] = [], movies: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().includes('unoone-demo.mp4')) movies.push(request.url()); });
      await page.goto('/');
      await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('nav').first().locator('img').first()).toHaveAttribute('src', '/inbharat-logo.svg');
      await expect(page.locator('header .unoone-logo, nav .unoone-logo')).toHaveCount(0);
      await expect(page.locator('.unoone-logo')).toHaveCount(1);
      await expect(page.locator('#pai .unoone-logo')).toHaveAttribute('src', '/unoone/unoone-logo-dark.png');
      await expect(page.locator('.unoone-orbit-core img')).toHaveAttribute('src', '/inbharat-logo.svg');
      await expect(page.locator('header h1')).toHaveText('Your AI. Your devices. Your control.', { useInnerText: true });
      await expect(page.locator('header .metric-num')).toHaveText(['2', '11', '2']);
      await expect(page.locator('header a[href="/app"]')).toHaveText('Launch InBharat AI');
      await expect(page.locator('header a[href="/unoone"]')).toHaveText('Meet UnoOne');
      const map = page.locator('.unoone-capability-map');
      await expect(map.locator('svg circle')).toHaveCount(3);
      const controls = map.locator('button[aria-controls="unoone-capability-detail"]').filter({ visible: true });
      await expect(controls).toHaveCount(12);
      expect(await controls.allTextContents()).toEqual(UNOONE_CAPABILITIES.map(cap => cap.label));
      for (const cap of UNOONE_CAPABILITIES) {
        const control = controls.filter({ hasText: new RegExp(`^${cap.label}$`) });
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        if (width < 640) await control.tap();
        else { await control.focus(); await control.press('Enter'); await expect(control).toBeFocused(); }
        await expect(control).toHaveAttribute('aria-pressed', 'true');
        const panel = page.locator('#unoone-capability-detail');
        await expect(panel).toHaveAttribute('aria-live', 'polite');
        await expect(panel.locator('h3')).toHaveText(cap.label);
        await expect(panel).toContainText(cap.platform);
        await expect(panel).toContainText(cap.description);
        await expect(panel).toContainText(cap.boundary);
        await expect(panel.locator('a')).toHaveAttribute('href', cap.href);
        await expect(page).toHaveURL(/\/$/);
      }
      await expect(page.locator('[data-product-directory]')).toBeHidden();
      for (const product of PRODUCT_REGISTRY) await selectCompanyProduct(page, product.name);
      expect(await page.locator('.unoone-orbit-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(movies).toEqual([]); expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`no JS exposes complete native capability and independent company catalogs at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width, height: 1000 } });
    try {
      const page = await context.newPage(); await page.goto('/');
      await expect(page.locator('[data-product-directory]')).toBeVisible();
      await page.locator('.unoone-capability-list summary').click();
      const entries = page.locator('.unoone-capability-list li');
      await expect(entries).toHaveCount(12);
      for (const cap of UNOONE_CAPABILITIES) {
        const item = entries.filter({ has: page.getByRole('heading', { name: cap.label, exact: true }) });
        for (const text of [cap.platform, `${cap.description} ${cap.boundary}`]) await expect(item.getByText(text, { exact: true })).toBeVisible();
        await expect(item.locator('a')).toHaveAttribute('href', cap.href);
      }
      await page.locator('[data-product-directory] summary').click();
      const articles = page.locator('[data-product-directory] article');
      await expect(articles.locator('h3')).toHaveText(PRODUCT_REGISTRY.map(product => product.name));
      for (const product of PRODUCT_REGISTRY) {
        const article = articles.filter({ has: page.getByRole('heading', { name: product.name, exact: true }) });
        await expect(article.locator('p')).toBeVisible();
        await expect(article.locator('p')).toHaveText(companyDescription(product.name));
        expect(new URL((await article.locator('a').getAttribute('href'))!, 'https://www.inbharat.ai/').href).toBe(new URL(product.href, 'https://www.inbharat.ai/').href);
      }
    } finally { await context.close(); }
  });
}
