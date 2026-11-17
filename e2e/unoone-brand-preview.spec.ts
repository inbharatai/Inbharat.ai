import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import en from '../locales/en.json' with { type: 'json' };
import { UNOONE_DEMO, UNOONE_LANDING } from '../content/unooneLanding';

test('owner-supplied eye-O logo bytes remain exact', () => {
  const bytes = readFileSync(new URL('../public/unoone/unoone-logo.png', import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('8b800572d78ee689238196c5f9372d83d607dafbd728efd4e613dbaa564fbdfc');
});

for (const width of [390, 1440]) {
  test(`real UnoOne assets, zero eager film bytes and honest entrypoints at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 600 ? 1200 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const films: string[] = [];
    page.on('request', request => { if (request.url().includes('unoone-demo.mp4')) films.push(request.url()); });
    await page.goto('/');
    await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator('#pai .unoone-logo');
    await expect(logo).toHaveAttribute('src', '/unoone/unoone-logo-dark.png');
    await expect(logo).toHaveAttribute('alt', 'UnoOne');
    expect(await logo.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ width: 227, height: 82 });
    const bounds = (await logo.boundingBox())!;
    expect(bounds.width / bounds.height).toBeCloseTo(227 / 82, 2);
    expect(await logo.evaluate(el => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (/invert|hue-rotate/.test(getComputedStyle(node).filter)) return false;
      }
      return true;
    })).toBe(true);
    await expect(page.locator('h1')).toHaveText(`${en.landHeroTitle1} ${en.landHeroTitle2}`, { useInnerText: true });
    await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toHaveCount(0);
    await expect(page.locator('#pai').getByRole('link', { name: 'Get UnoOne', exact: true })).toHaveAttribute('href', '/get-started');
    await expect(page.locator('footer a[href="/app"]')).toHaveAttribute('href', '/app');
    const video = page.locator('#unoone-demo video');
    await expect(video).toHaveAttribute('preload', 'none');
    await expect(video).toHaveAttribute('poster', UNOONE_DEMO.poster);
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('playsinline', '');
    await expect(video).not.toHaveAttribute('autoplay');
    await expect(video.locator('source')).toHaveAttribute('src', UNOONE_DEMO.video);
    await expect(video.locator('track')).toHaveAttribute('src', UNOONE_DEMO.captions);
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    expect(films).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`unoone-desktop-mobile-${width}.png`) });
    await page.locator('.unoone-product-features').screenshot({ path: testInfo.outputPath(`unoone-workflows-${width}.png`) });
    await page.locator('#unoone-demo summary').click();
    expect(films).toEqual([]);
    await expect(page.locator('.unoone-transcript')).toContainText("The world doesn't just need smarter AI.");
    const chapters = page.getByRole('navigation', { name: 'Demo chapters' }).getByRole('link');
    await expect(chapters).toHaveCount(UNOONE_DEMO.chapters.length);
    for (const chapter of await chapters.all()) expect((await chapter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const modelChapter = UNOONE_DEMO.chapters.findIndex(chapter => chapter.seconds === 38);
    expect(modelChapter).toBeGreaterThanOrEqual(0);
    await chapters.nth(modelChapter).click();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(38, 0);
    expect(films.length).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
    expect(await video.evaluate((el: HTMLVideoElement) => el.duration)).toBeCloseTo(142, 0);
    await expect(video.locator('track')).toHaveAttribute('kind', 'captions');
    expect(await video.evaluate((el: HTMLVideoElement) => el.textTracks.length)).toBeGreaterThan(0);
    await video.evaluate((el: HTMLVideoElement) => el.play());
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(38);
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await page.locator('#unoone-demo').screenshot({ path: testInfo.outputPath(`unoone-real-film-seek-${width}.png`) });
  });
}

test('no-JS native video and readable transcript remain usable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('#unoone-demo video')).toBeVisible();
    await page.locator('#unoone-demo summary').click();
    await expect(page.locator('.unoone-transcript')).toBeVisible();
    await expect(page.locator('.unoone-chapters a').first()).toHaveAttribute('href', `${UNOONE_DEMO.video}#t=15`);
    await expect(page.locator('#pai')).toContainText(UNOONE_LANDING.networkBoundary);
    await expect(page.locator('#devices')).toContainText(en.landDevicesSyncStatus);
  } finally { await context.close(); }
});
