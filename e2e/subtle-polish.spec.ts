import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const languages = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'or', 'as'];
const translations = Object.fromEntries(languages.map(code => [code, JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'))]));
const heroSelector = 'header#main-content';

async function ready(page: Page) {
  await expect(page.locator('.hero-edge-depth')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}

async function unprotectedText(page: Page) {
  return page.locator(heroSelector).evaluate(hero => {
    const area = hero.getBoundingClientRect();
    const masks = Array.from(hero.querySelectorAll<SVGRectElement>('[data-text-exclusions] rect')).map(r => ({
      x: r.x.baseVal.value, y: r.y.baseVal.value, w: r.width.baseVal.value, h: r.height.baseVal.value,
    }));
    return Array.from(hero.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,select,ul,span')).filter(element => {
      if (element.closest('.hero-edge-depth')) return false;
      if (element.tagName === 'SPAN' && !Array.from(element.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) return false;
      const b = element.getBoundingClientRect();
      if (!b.width || !b.height) return false;
      const x = (b.left - area.left) / area.width * 1440;
      const y = (b.top - area.top) / area.height * 1360;
      const w = b.width / area.width * 1440;
      const h = b.height / area.height * 1360;
      return !masks.some(m => m.x <= x + 1 && m.y <= y + 1 && m.x + m.w >= x + w - 1 && m.y + m.h >= y + h - 1);
    }).map(element => element.textContent?.trim());
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`approved polish preserves identity and geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    const hero = page.locator(heroSelector);
    await expect(hero.locator('h1')).toHaveCount(1);
    const heading = await hero.locator('h1').boundingBox();
    for (const signature of [hero.locator('[lang="sa"]'), hero.getByText('DPIIT Recognised', { exact: true }), hero.getByText(/Stanford Seed Spark/), hero.getByText('OpenAI Partner Network', { exact: true })]) {
      await expect(signature).toBeVisible();
      expect((await signature.boundingBox())!.y).toBeLessThan(heading!.y);
    }
    for (const credential of await hero.locator('ul li:visible').all()) expect((await credential.boundingBox())!.y).toBeLessThan(heading!.y);
    await expect(hero.locator('.hero-mesh')).toBeAttached();
    await expect(hero.locator('.hero-edge-depth > svg')).toHaveCount(1);
    await expect(hero.locator('.hero-edge-depth')).toHaveAttribute('aria-hidden', 'true');
    await expect(hero.locator('.hero-edge-depth')).toHaveCSS('pointer-events', 'none');
    await expect(hero.locator('.hero-edge-depth')).toHaveCSS('z-index', '3');
    await expect(page.locator('.field-lab, .field-media, video')).toHaveCount(0);
    await expect(hero.getByRole('link', { name: /Launch InBharat AI/i })).toHaveAttribute('href', '/app');
    await expect(page.locator('#why h2')).toHaveText(translations.en.landWhy1Title);
    await expect(hero.locator('h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
    const gradient = await hero.locator('h1 > span:nth-child(2)').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(gradient).toContain('245, 159, 79');
    expect(gradient).toContain('253, 232, 208');
    expect(gradient).toContain('111, 211, 163');
    // Hiding only the added component must have literally zero layout effect.
    const geometry = await hero.evaluate(el => {
      const nodes = Array.from(el.querySelectorAll('h1,p,a,button:not(.hero-edge-pause),select,ul'));
      const measure = () => nodes.map(n => n.getBoundingClientRect().toJSON());
      const before = measure();
      const layer = el.querySelector<HTMLElement>('.hero-edge-depth')!;
      const control = el.querySelector<HTMLElement>('.hero-edge-pause')!;
      const previousControlDisplay = control.style.display;
      layer.style.display = 'none'; control.style.display = 'none';
      const after = measure();
      layer.style.removeProperty('display'); control.style.display = previousControlDisplay;
      return { before, after };
    });
    expect(geometry.after).toEqual(geometry.before);
    await expect.poll(() => unprotectedText(page)).toEqual([]);
    await expect(hero.locator('.hero-edge-left')).toHaveCSS('animation-name', 'none');
    if (width < 768) await expect(hero.locator('.hero-edge-depth')).toHaveCSS('opacity', '0.55');
    if (width === 1440) {
      const words = await hero.locator('h1 > span:first-child > span').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent?.trim(), y: n.getBoundingClientRect().y })));
      const forWord = words.find(w => w.text === 'for')!;
      expect(words.some(w => w.text !== 'for' && Math.abs(w.y - forWord.y) < 2)).toBe(true);
    }
  });

  test(`all eleven languages retain header bounds at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    for (const language of languages) {
      await page.evaluate(code => localStorage.setItem('appLanguage', code), language);
      await page.reload();
      await ready(page);
      await expect(page.locator('#why h2')).toHaveText(translations[language].landWhy1Title);
      await expect(page.locator('h1 > span:first-child')).toHaveAttribute('aria-label', translations[language].landHeroTitle1);
      const bounds = await page.locator(heroSelector).evaluate(hero => {
        const heading = hero.querySelector('h1')!;
        const layer = hero.querySelector<HTMLElement>('.hero-edge-depth')!;
        const withLayer = hero.scrollWidth;
        layer.style.display = 'none';
        const withoutLayer = hero.scrollWidth;
        layer.style.removeProperty('display');
        return { width: hero.clientWidth, withLayer, withoutLayer, titleWidth: heading.clientWidth, titleScroll: heading.scrollWidth,
          escapedWords: Array.from(heading.querySelectorAll('span')).filter(s => { const b = s.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1; }).map(s => s.textContent) };
      });
      expect(bounds.withLayer, language).toBe(bounds.withoutLayer);
      expect(bounds.withLayer, language).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.titleScroll, language).toBeLessThanOrEqual(bounds.titleWidth + 1);
      expect(bounds.escapedWords, language).toEqual([]);
      await expect.poll(() => unprotectedText(page), { message: language }).toEqual([]);
    }
  });
}

test('mask tracks scroll, resize and live language changes; motion responds to pause and media changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await ready(page);
  const left = page.locator('.hero-edge-left');
  await expect(left).toHaveCSS('animation-duration', '32s');
  await expect(page.locator('.hero-edge-right')).toHaveCSS('animation-duration', '38s');
  await expect(page.locator('.hero-edge-right')).toHaveCSS('animation-delay', '-12s');
  await page.getByRole('button', { name: 'Pause edge motion' }).click();
  await expect(left).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Resume edge motion' }).click();
  await expect(left).toHaveCSS('animation-play-state', 'running');
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
  await expect.poll(() => unprotectedText(page)).toEqual([]);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect.poll(() => unprotectedText(page)).toEqual([]);
  await page.locator('nav select:visible').selectOption('hi');
  await expect(page.locator('h1 > span:first-child')).toHaveAttribute('aria-label', translations.hi.landHeroTitle1);
  await expect.poll(() => unprotectedText(page)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(left).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.hero-edge-pause')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(left).toHaveCSS('animation-name', 'hero-depth-drift');
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(left).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.hero-edge-depth')).toHaveCSS('opacity', '0.55');
  await expect.poll(() => unprotectedText(page)).toEqual([]);
});

test('unrelated font completion does not hide correct decoration', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  await expect.poll(() => unprotectedText(page)).toEqual([]);
  const state = await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event('loadingdone'));
    const layer = document.querySelector<HTMLElement>('.hero-edge-depth')!;
    return { ready: layer.dataset.ready, visibility: getComputedStyle(layer).visibility };
  });
  expect(state).toEqual({ ready: 'true', visibility: 'visible' });
});

test('pending mask alignment hides decoration synchronously', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await ready(page);
  const immediate = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const layer = document.querySelector<HTMLElement>('.hero-edge-depth')!;
    return { ready: layer.dataset.ready, visibility: getComputedStyle(layer).visibility };
  });
  expect(immediate).toEqual({ ready: 'false', visibility: 'hidden' });
  await ready(page);
  await expect.poll(() => unprotectedText(page)).toEqual([]);
});

test('citation slate meets 4.5:1 on the dark hero palette', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const citation = page.locator(`${heroSelector} p`).filter({ hasText: translations.en.gitaCitation });
  await expect(citation).toHaveCSS('color', 'rgb(150, 176, 200)');
  const luminance = (rgb: number[]) => rgb.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  // The brighter original surface token is a conservative dark-area reference.
  for (const foreground of [[150, 176, 200]]) expect((luminance(foreground) + .05) / (luminance([15, 21, 32]) + .05)).toBeGreaterThanOrEqual(4.5);
});

for (const width of [390, 1440]) {
  test(`original product vertical controls and app CTA still operate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('#products').scrollIntoViewIfNeeded();
    const controls = width < 1024
      ? page.locator('#products .lg\\:hidden button[aria-pressed]')
      : page.locator('#products h4').locator('..').locator('..').getByRole('button');
    await expect(controls).toHaveCount(6);
    const productCounts = await page.locator('#products h4').locator('..').locator('..').getByRole('button').evaluateAll(buttons => buttons.map(b => Number(b.querySelector('span:last-child')?.textContent)));
    expect(productCounts.reduce((sum, count) => sum + count, 0)).toBe(15);
    const first = controls.first();
    const second = controls.nth(1);
    const before = await page.locator('#products h3').first().textContent();
    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#products h3').first()).not.toHaveText(before!);
    for (let i = 2; i < 6; i++) {
      await controls.nth(i).click();
      await expect(controls.nth(i)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#products h3').first()).not.toBeEmpty();
    }
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#products h3').first()).toHaveText(before!);
    await page.locator(`${heroSelector} a[href="/app"]`).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.hero-edge-depth')).toHaveCount(0);
  });
}


test('added decoration contributes no pixels within original text and control rectangles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  await expect.poll(() => unprotectedText(page)).toEqual([]);
  const targets = page.locator(`${heroSelector} h1, ${heroSelector} p, ${heroSelector} ul, ${heroSelector} a`);
  const layer = page.locator('.hero-edge-depth');
  for (const target of await targets.all()) {
    const withLayer = await target.screenshot({ animations: 'disabled' });
    await layer.evaluate(el => { el.style.display = 'none'; });
    const withoutLayer = await target.screenshot({ animations: 'disabled' });
    await layer.evaluate(el => { el.style.removeProperty('display'); });
    expect(withLayer.equals(withoutLayer), (await target.textContent()) || '').toBe(true);
  }
});
