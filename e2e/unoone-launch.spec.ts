import { test, expect, type Page } from '@playwright/test';
import { load } from 'cheerio';
import { PRODUCT_CATEGORIES, PRODUCT_REGISTRY } from '../content/productRegistry';
import { LAUNCH_PAGES, UNOONE_RELEASES, approvedArtifact, releaseAvailability } from '../content/unooneRelease';
import { UNOONE_LANDING, UNOONE_DEMO } from '../content/unooneLanding';
import { ROUTES, GLOBAL_SCHEMA } from '../seo.config';
import en from '../locales/en.json' with { type: 'json' };
import { companyDescription, selectCompanyProduct } from './scoped-helpers';

const origin = 'https://www.inbharat.ai';
const names = ['InBharat AI', 'JAK Swarm', 'JAK Shield', 'Agent Arcade', 'SocialFlow', 'Sahayaak AI', 'KathaKitaab', 'UniBot', 'Phoring', 'UniAssist.ai', 'TestsPrep.in', 'UnoOne', 'OpenClawFix', 'Sahayaak Seva', 'SwasthyaScore AI'];
const paths = Object.keys(LAUNCH_PAGES) as (keyof typeof LAUNCH_PAGES)[];

function schemaObjects(value: unknown): Record<string, any>[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(schemaObjects);
  return [value as Record<string, any>, ...Object.values(value).flatMap(schemaObjects)];
}

async function assertRoute(page: Page, path: keyof typeof LAUNCH_PAGES) {
  const route = ROUTES.find(item => item.path === path);
  expect(route, `SEO route ${path} must exist`).toBeTruthy();
  await expect(page.locator('#root main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(LAUNCH_PAGES[path].title, { useInnerText: true });
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main')).toContainText(LAUNCH_PAGES[path].description);
  await expect(page).toHaveTitle(route!.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', route!.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', origin + path);
  await expect(page.locator('[data-static-fallback], [data-seo-body]')).toHaveCount(0);
  await expect(page.locator('header#main-content')).toHaveCount(0);
  // The historical film legitimately says the same brand line. Check for a
  // stale homepage tree/heading, not for words inside its preserved transcript.
  await expect(page.locator('.unoone-launch, .launch-hero-copy')).toHaveCount(0);
  await expect(page.locator('h1')).not.toHaveText(UNOONE_LANDING.headline.join(' '));
  await expect.poll(() => page.locator('script[data-seo-jsonld]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent || 'null')))).toEqual([...GLOBAL_SCHEMA, ...(route!.extraSchema ?? [])]);
  expect(await page.locator('h1').evaluate(el => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (Number(style.opacity) < .95 || style.visibility === 'hidden' || style.display === 'none') return false;
    }
    return parseFloat(getComputedStyle(el).fontSize) >= 24;
  })).toBe(true);
}

test('canonical registry preserves all fifteen names, six buckets and independent relationships', () => {
  expect(PRODUCT_REGISTRY.map(product => product.name).sort()).toEqual([...names].sort());
  expect(new Set(PRODUCT_REGISTRY.map(product => product.id)).size).toBe(15);
  expect(PRODUCT_CATEGORIES).toHaveLength(6);
  expect(new Set(PRODUCT_CATEGORIES.map(category => category.key)).size).toBe(6);
  expect(new Set(PRODUCT_REGISTRY.map(product => product.bucket))).toEqual(new Set(PRODUCT_CATEGORIES.map(category => category.key)));
  for (const product of PRODUCT_REGISTRY) {
    expect(product.description.trim().length).toBeGreaterThan(25);
    expect(product.href).toMatch(/^(?:\/(?!\/)|https:\/\/)/);
    expect(product.relation).toBe(product.name === 'UnoOne' ? 'flagship' : 'independent');
  }
  expect(PRODUCT_REGISTRY.find(product => product.name === 'InBharat AI')?.href).toBe('/app');
  expect(PRODUCT_REGISTRY.find(product => product.name === 'UnoOne')?.href).toBe('/unoone');
});

for (const path of paths) {
  test(`${path}: HTTP HTML is actual visible React content, not a home/SEO substitute`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const $ = load(await response.text());
    expect($('#root main').length).toBe(1);
    expect($('h1').length).toBe(1);
    expect($('h1').clone().find('br').replaceWith(' ').end().text().replace(/\s+/g, ' ').trim()).toBe(LAUNCH_PAGES[path].title);
    expect($('[data-static-fallback], [data-seo-body]').length).toBe(0);
    expect($('link[rel="canonical"]').attr('href')).toBe(origin + path);
    expect($('link[rel="stylesheet"]').length).toBeGreaterThan(0);
    expect($('title').text()).toBe(ROUTES.find(route => route.path === path)?.title);
    expect($('header#main-content').length).toBe(0);
    if (path === '/unoone/demo') {
      expect($('video source').attr('src')).toBe(UNOONE_DEMO.video);
      expect($('video').attr('preload')).toBe('none');
      expect($('video').attr('poster')).toBe(UNOONE_DEMO.poster);
      expect($('track[kind="captions"]').attr('src')).toBe(UNOONE_DEMO.captions);
    }
  });

  for (const width of [320, 390, 1440]) {
    test(`${path}: disabled JS retains styled content at ${width}px`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        await page.goto(path);
        await assertRoute(page, path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (path === '/ecosystem') {
          await page.locator('[data-product-directory] summary').click();
          await expect(page.locator('[data-product-directory] article h3')).toHaveText(PRODUCT_REGISTRY.map(product => product.name));
          for (const article of await page.locator('[data-product-directory] article').all()) {
            await expect(article.locator('p')).toBeVisible();
            await expect(article.locator('a')).toHaveAttribute('href', /.+/);
          }
        }
        if (path === '/unoone/demo') {
          if (!(await page.locator('#unoone-demo details').evaluate(el => (el as HTMLDetailsElement).open))) await page.locator('#unoone-demo summary').click();
          await expect(page.locator('.unoone-transcript')).toBeVisible();
          await expect(page.locator('.unoone-chapters a')).toHaveCount(UNOONE_DEMO.chapters.length);
        }
      } finally { await context.close(); }
    });
  }

  test(`${path}: SPA navigation replaces home body and schema, direct hydration agrees`, async ({ page }) => {
    await page.goto(path);
    await assertRoute(page, path);
    const directSchema = await page.locator('script[data-seo-jsonld]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent || 'null')));
    await page.goto('/');
    await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
    await page.evaluate(() => {
      (window as any).__launchNavigationSentinel = 'same-document';
      const node = document.createElement('script');
      node.id = 'independent-launch-schema'; node.type = 'application/ld+json';
      node.textContent = JSON.stringify({ '@type': 'Thing', name: 'independent integration fixture' });
      document.head.append(node);
    });
    // Restored homepage exposes product actions in #pai, not a redesigned footer.
    // The complete company route is linked by the existing product guide.
    if (path === '/ecosystem') {
      await page.locator('header a[href="/unoone"]').click();
      await page.locator('a[href="/ecosystem"]').filter({ visible: true }).first().click();
    } else await page.locator(`#pai a[href="${path}"]`).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await assertRoute(page, path);
    expect(await page.evaluate(() => (window as any).__launchNavigationSentinel)).toBe('same-document');
    await expect(page.locator('#independent-launch-schema')).toHaveCount(1);
    expect(await page.locator('script[data-seo-jsonld]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent || 'null')))).toEqual(directSchema);
  });
}

for (const path of ['/', '/ecosystem']) {
  test(`${path}: company directory and ItemList agree independently of capability orbit`, async ({ page }) => {
    await page.goto(path);
    const orbit = page.locator(path === '/' ? '#products' : '.product-orbit');
    if (path === '/') {
      await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
      await expect(page.locator('.unoone-capability-map button[aria-controls="unoone-capability-detail"]:visible')).toHaveCount(12);
      await expect(orbit.locator('[data-product-directory]')).toBeHidden();
      for (const product of PRODUCT_REGISTRY) await selectCompanyProduct(page, product.name);
    } else {
      await expect(orbit.locator('.product-orbit-node')).toHaveCount(15);
      await expect(orbit.getByRole('list', { name: 'Select a portfolio product' }).getByRole('button')).toHaveText(PRODUCT_REGISTRY.map(product => product.name));
      await orbit.locator('[data-product-directory] summary').click();
    }
    for (const product of PRODUCT_REGISTRY) {
      const article = orbit.locator('[data-product-directory] article').filter({ has: page.getByRole('heading', { name: product.name, exact: true, includeHidden: path === '/' }) });
      await expect(article).toHaveCount(1);
      if (path === '/ecosystem') await expect(article.locator('p').first()).toHaveText(product.description);
      else await expect(article.locator('p').first()).toHaveText(companyDescription(product.name));
      expect(new URL((await article.locator('a').getAttribute('href'))!, origin).href).toBe(new URL(product.href, origin).href);
      if (product.href.startsWith('https://')) await expect(article.locator('a')).toHaveAttribute('rel', /noopener/);
    }
    const schemas = schemaObjects(await page.locator('script[data-seo-jsonld]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent || 'null'))));
    const lists = schemas.filter(node => node['@type'] === 'ItemList' && Array.isArray(node.itemListElement));
    const portfolio = lists.find(list => list.itemListElement.length === 15);
    expect(portfolio, 'A complete registry-derived ItemList must be present').toBeTruthy();
    const items = portfolio!.itemListElement.map((entry: any) => entry.item ?? entry);
    expect(items.map((item: any) => item.name).sort()).toEqual([...names].sort());
    for (const product of PRODUCT_REGISTRY) expect(new URL(items.find((item: any) => item.name === product.name)?.url).href).toBe(new URL(product.href, origin).href);
  });
}

test('keyboard selection never navigates or moves focus; all six filters have real contents', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/ecosystem');
  const orbit = page.locator('.product-orbit');
  const url = page.url();
  for (const product of PRODUCT_REGISTRY) {
    const node = orbit.getByRole('button', { name: `Select ${product.name}`, exact: true });
    await node.focus();
    await node.press('Enter');
    await expect(node).toBeFocused();
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toBe(url);
    const panelId = await node.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = page.locator(`[id=${JSON.stringify(panelId)}]`);
    await expect(panel).toHaveAttribute('aria-live', 'polite');
    await expect(panel.getByRole('heading')).toHaveText(product.name);
    await expect(panel.getByRole('link')).toHaveAttribute('href', product.href);
    await expect(panel).toContainText(product.description);
  }
  const filters = orbit.getByRole('group', { name: 'Filter portfolio categories' });
  await expect(filters.getByRole('button')).toHaveCount(7);
  for (const category of PRODUCT_CATEGORIES) {
    const button = filters.getByRole('button', { name: category.label, exact: true });
    await button.focus(); await button.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(orbit.getByRole('list', { name: 'Select a portfolio product' }).getByRole('button')).toHaveText(PRODUCT_REGISTRY.filter(product => product.bucket === category.key).map(product => product.name));
  }
  await filters.getByRole('button', { name: 'All 15 products', exact: true }).click();
  await expect(orbit.getByRole('list', { name: 'Select a portfolio product' }).getByRole('button')).toHaveCount(15);
});

for (const width of [320, 390]) {
  test(`touch list is a 44px alternative to circle targets at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width, height: 1000 } });
    try {
      const page = await context.newPage();
      await page.goto('/ecosystem');
      const list = page.getByRole('list', { name: 'Select a portfolio product' });
      for (const product of PRODUCT_REGISTRY) {
        const button = list.getByRole('button', { name: product.name, exact: true });
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        await button.tap();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.product-orbit-detail h3')).toHaveText(product.name);
        await expect(page).toHaveURL(/\/ecosystem$/);
      }
      await expect(page.locator('.product-orbit-map')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally { await context.close(); }
  });
}

test('circle motion is optional, pausable and stops on focus or hover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/ecosystem');
  const orbit = page.locator('.product-orbit');
  await orbit.scrollIntoViewIfNeeded();
  const running = () => orbit.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
  await expect.poll(running).toBe(0);
  await orbit.getByRole('button', { name: 'Replay circle', exact: true }).click();
  await expect.poll(running).toBeGreaterThan(0);
  await orbit.getByRole('button', { name: 'Pause circle', exact: true }).click();
  await expect.poll(running).toBe(0);
  await orbit.getByRole('button', { name: 'Replay circle', exact: true }).click();
  await orbit.getByRole('button', { name: 'Select UnoOne', exact: true }).focus();
  await expect.poll(running).toBe(0);
  await orbit.getByRole('button', { name: 'Replay circle', exact: true }).click();
  await page.locator('h1').hover();
  await orbit.getByRole('button', { name: 'Select UnoOne', exact: true }).hover();
  await expect.poll(running).toBe(0);
});

test('Get UnoOne exposes requirements and model setup, not unapproved binaries', async ({ page }) => {
  await page.goto('/get-started');
  await assertRoute(page, '/get-started');
  for (const release of UNOONE_RELEASES) {
    await expect(page.locator('main')).toContainText(release.name);
    await expect(page.locator('main')).toContainText(releaseAvailability(release));
    for (const text of [...(approvedArtifact(release)?.requirements ?? release.requirements), ...release.setup]) await expect(page.locator('main')).toContainText(text);
    await expect(page.locator(`main a[href="${release.href}"]`).first()).toBeVisible();
    const artifact = approvedArtifact(release);
    if (artifact) {
      await expect(page.locator(`main a[href=${JSON.stringify(artifact.url)}]`)).toBeVisible();
      await expect(page.locator('main')).toContainText(artifact.version);
      await expect(page.locator('main')).toContainText(artifact.sha256);
    }
  }
  if (UNOONE_RELEASES.every(release => !approvedArtifact(release))) {
    await expect(page.locator('main a[download], main a[href^="blob:"], main a[href^="data:"]')).toHaveCount(0);
    const links = await page.locator('main a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.textContent })));
    expect(links.filter(link => /\.(?:apk|aab|exe|msi|msix|zip)(?:[?#]|$)/i.test(link.href || ''))).toEqual([]);
    expect(links.filter(link => /download (?:now|for|unoone|power|mobile)|install now/i.test(link.text || ''))).toEqual([]);
  }
  const contact = page.locator('main a[href="/contact"]').first();
  await expect(contact).toBeVisible();
  await contact.click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.locator('h1')).toBeVisible();
  // Website content/config assertions only: no execution or qualification of
  // installers, model assets, provider accounts or inactive Supabase is implied.
});

for (const width of [320, 390]) {
  test(`mobile menu works with the keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
    const toggle = page.getByRole('button', { name: en.openMenu, exact: true });
    await toggle.focus(); await toggle.press('Enter');
    const target = page.locator('nav').getByRole('link', { name: en.landNavUnoOne, exact: true }).filter({ visible: true });
    await expect(target).toBeVisible();
    // The restored native button closes/reopens the original menu with Space.
    await toggle.focus(); await toggle.press('Space');
    await expect(target).toBeHidden();
    await toggle.press('Enter');
    await target.focus(); await target.press('Enter');
    await expect(page).toHaveURL(/\/unoone$/);
    await expect(page.locator('h1')).toBeVisible();
  });
}

test('watch page defers film bytes and keyboard chapters seek the actual captioned film', async ({ page }) => {
  const films: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === UNOONE_DEMO.video) films.push(request.url()); });
  await page.goto('/unoone/demo');
  await assertRoute(page, '/unoone/demo');
  const video = page.locator('#unoone-demo video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('poster', UNOONE_DEMO.poster);
  await expect(video).not.toHaveAttribute('autoplay');
  await expect(video.locator('track')).toHaveAttribute('kind', 'captions');
  await expect(video.locator('track')).toHaveAttribute('src', UNOONE_DEMO.captions);
  expect(films).toEqual([]);
  const disclosure = page.locator('#unoone-demo details');
  if (!(await disclosure.evaluate(el => (el as HTMLDetailsElement).open))) await disclosure.locator('summary').click();
  await expect(page.locator('.unoone-transcript')).toContainText("The world doesn't just need smarter AI.");
  expect(films).toEqual([]);
  const chapter = page.getByRole('navigation', { name: 'Demo chapters' }).getByRole('link').nth(2);
  const expectedSeconds = UNOONE_DEMO.chapters[2].seconds;
  await chapter.focus(); await chapter.press('Enter');
  await expect(video).toBeFocused();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(expectedSeconds, 0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  expect(films.length).toBeGreaterThan(0);
  expect(await video.evaluate((el: HTMLVideoElement) => el.duration)).toBeCloseTo(142, 0);
  expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.textTracks[0]?.cues?.length || 0)).toBeGreaterThan(0);
});
