import { test, expect } from '@playwright/test';

// Public, local UI checks only. No external authentication or live service claims.
const verticals = [
  { key: 'core', label: 'InBharat Core AI', products: ['InBharat AI'] },
  { key: 'agentOps', label: 'Business & Ops', products: ['JAK Swarm', 'JAK Shield', 'Agent Arcade', 'Phoring'] },
  { key: 'consumer', label: 'Consumer & Culture', products: ['Sahayaak AI', 'KathaKitaab', 'UnoOne', 'OpenClawFix'] },
  { key: 'eduCareer', label: 'Education & Careers', products: ['UniBot', 'UniAssist.ai', 'TestsPrep.in'] },
  { key: 'health', label: 'Health & Public Service', products: ['Sahayaak Seva', 'SwasthyaScore AI'] },
  { key: 'growth', label: 'Growth & Publishing', products: ['SocialFlow'] },
];
const headline = 'Building the Infrastructure for Private AI Beyond the Cloud.';

for (const width of [360, 390, 768, 1440]) {
  test.describe(`${width}px Field Lab`, () => {
    test.use({ viewport: { width, height: width < 768 ? 780 : 1000 } });
    test('hero, truthful diagrams, single readable selector and all 15 products', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.field-lab')).toBeVisible();
      await expect(page.locator('.field-lab h1')).toHaveText(headline);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Open InBharat AI chat' })).toBeVisible();
      const launch = page.getByTestId('hero-launch');
      await expect(launch).toHaveAttribute('href', '/app');
      if (width < 768) {
        const box = await launch.boundingBox();
        expect(box!.y + box!.height).toBeLessThan(667);
        await expect(page.locator('.field-media video')).toHaveCount(0);
      }
      await expect(page.locator('.field-verse [lang="sa"]')).toContainText('कर्मण्येवाधिकारस्ते');
      await expect(page.locator('#why h2')).toHaveText('Practical AI over hype');
      await expect(page.locator('#field-silt')).toContainText('Accept');
      await expect(page.locator('#field-silt')).toContainText('Reject');
      await expect(page.locator('#field-pai')).toContainText('State stays on the removable device');
      await expect(page.locator('.field-jak-diagram')).toContainText('not live telemetry');
      await expect(page.locator('.field-lab')).not.toContainText('100%');
      await expect(page.locator('.field-lab')).not.toContainText('All systems operational');
      const selector = page.getByRole('group', { name: 'Six product verticals' });
      await expect(selector).toHaveCount(1);
      await expect(selector.getByRole('button')).toHaveCount(6);
      const visited: string[] = [];
      for (const vertical of verticals) {
        const button = selector.locator(`[data-vertical="${vertical.key}"]`);
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(button).toContainText(vertical.label);
        expect(await button.evaluate((el) => {
          const label = el.querySelector('span')!;
          return getComputedStyle(label).textOverflow !== 'ellipsis' && label.scrollWidth <= label.clientWidth + 1;
        })).toBeTruthy();
        for (const product of vertical.products) {
          if (vertical.key !== 'core') await page.locator('.field-product-options').getByRole('button', { name: product, exact: false }).click();
          await expect(page.locator('#field-product-detail h3')).toHaveText(product);
          visited.push(product);
        }
      }
      expect(new Set(visited).size).toBe(15);
      // Detect actual document and element overflow, not a hidden overflow mask.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const overflow = await page.locator('.field-lab').evaluate((root) => [...root.querySelectorAll('a,button,h1,h2,h3,p,figure')].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1) && getComputedStyle(el).position !== 'absolute';
      }).map((el) => el.textContent?.slice(0, 60)));
      expect(overflow).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.field-atmosphere')).toHaveCSS('pointer-events', 'none');
      await expect(page.locator('.field-media')).toHaveCSS('pointer-events', 'none');
      await expect(page.locator('.field-map-lines')).toHaveCSS('pointer-events', 'none');
    });
  });
}

test('mobile menu, persistent public chat entry, contact and chat targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const menu = nav.locator('button[aria-controls="field-mobile-menu"]');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#field-mobile-menu')).toBeVisible();
  await expect(page.locator('#field-mobile-menu').getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('href', '/contact');
  await expect(page.locator('#field-mobile-menu').getByRole('link', { name: 'Build with Reeturaj' })).toHaveAttribute('href', '/learn-ai-with-reeturaj');
  await menu.click();
  await expect(page.locator('#field-mobile-menu')).toHaveCount(0);
  await expect(page.locator('#chatbot a[href="/app"]')).toHaveCount(1);
  await expect(page.locator('#chatbot a[target="_blank"]')).toHaveAttribute('href', /wa\.me|whatsapp/);
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await expect(nav.getByRole('link', { name: 'Open InBharat AI chat' })).toBeInViewport();
  await nav.getByRole('link', { name: 'Open InBharat AI chat' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('reduced motion remains static before scroll and after resize', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.field-lab')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.field-media video')).toHaveCount(0);
  for (const width of [1440, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#jakswarm').scrollIntoViewIfNeeded();
    await expect(page.locator('.field-jak-diagram')).toContainText('Approved artifact');
    expect(await page.locator('.field-lab').evaluate((root) => [...root.querySelectorAll('*')].filter((el) => {
      const css = getComputedStyle(el);
      const identity = css.transform === 'none' || new DOMMatrixReadOnly(css.transform).isIdentity;
      return !identity || (css.translate !== 'none' && css.translate !== '') || css.animationName !== 'none';
    }).map((el) => el.className))).toEqual([]);
    await page.locator('.field-vertical-selector [data-vertical="growth"]').click();
    await expect(page.locator('#field-product-detail h3')).toHaveText('SocialFlow');
  }
});

test('missing media fails gracefully without blocking content', async ({ page }) => {
  await page.route('**/field-lab/*', (route) => route.fulfill({ status: 404, body: '' }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('hero-launch')).toBeVisible();
  await expect(page.locator('.field-media img')).toHaveAttribute('src', '/field-lab/hero-poster.webp');
  await expect(page.locator('.field-media-fallback')).toBeVisible();
  await expect(page.locator('.field-media figcaption')).toContainText('Not real hardware or a product demo.');
  await expect(page.locator('.field-media video')).toHaveCount(0);
  await page.getByTestId('hero-launch').click();
  await expect(page).toHaveURL(/\/app$/);
});

test('desktop media lifecycle contract (native playback stubbed)', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dataset.playback = 'playing';
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      this.dataset.playback = 'paused';
      this.dispatchEvent(new Event('pause'));
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const video = page.locator('.field-media video');
  await expect(video).toHaveAttribute('data-playback', 'playing');
  expect(await video.evaluate((node: HTMLVideoElement) => node.muted && node.playsInline)).toBeTruthy();
  await page.getByRole('button', { name: 'Pause conceptual animation' }).click();
  await expect(video).toHaveAttribute('data-playback', 'paused');
  await page.getByRole('button', { name: 'Resume conceptual animation' }).click();
  await expect(video).toHaveAttribute('data-playback', 'playing');
  await page.locator('#products').scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute('data-playback', 'paused');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(video).toHaveAttribute('data-playback', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(video).toHaveAttribute('data-playback', 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(video).toHaveAttribute('data-playback', 'playing');
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(video).toHaveCount(0);
});

test('320px translated header retains all navigation controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.addInitScript(() => localStorage.setItem('appLanguage', 'ta'));
  await page.goto('/');
  const menu = page.locator('.field-nav button[aria-controls="field-mobile-menu"]');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await menu.click();
  await expect(page.locator('#field-mobile-menu')).toBeVisible();
});

test('genuine shipped video plays and respects user pause without stubs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const video = page.locator('.field-media video');
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.4);
  expect(await video.evaluate((el: HTMLVideoElement) => !el.paused && el.muted && el.videoWidth === 1280 && el.error === null)).toBeTruthy();
  await page.getByRole('button', { name: 'Pause conceptual animation' }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBeTruthy();
  const before = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await page.locator('#products').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBeTruthy();
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(before, 1);
  await page.getByRole('button', { name: 'Resume conceptual animation' }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBeFalsy();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).toHaveCount(0);
  await expect(page.locator('.field-media img')).toBeVisible();
});

test('save-data never activates the desktop video', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: true }) }));
  await page.goto('/');
  await expect(page.locator('.field-media img')).toBeAttached();
  await expect(page.locator('.field-media video')).toHaveCount(0);
});
