import { test, expect, type Page } from '@playwright/test';
import { selectCompanyProduct } from './scoped-helpers';
import { PRODUCT_REGISTRY } from '../content/productRegistry';
import en from '../locales/en.json' with { type: 'json' };

async function ready(page: Page) {
  await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}

async function clippedText(page: Page) {
  return page.locator('header h1, header p, #pai p, #devices p, .unoone-capability-detail p, #products p.max-w-xl, footer p').evaluateAll(nodes => nodes.filter(el => {
    // Closed native disclosures intentionally defer their contents; dedicated
    // interaction/no-JS tests open them and check the complete text separately.
    for (let disclosure = el.closest('details:not([open])'); disclosure; disclosure = disclosure.parentElement?.closest('details:not([open])') ?? null) {
      if (!disclosure.querySelector(':scope > summary')?.contains(el)) return false;
    }
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    const range = document.createRange(); range.selectNodeContents(el);
    const rectangles = [...range.getClientRects()];
    if (rectangles.some(r => r.left < -1 || r.right > innerWidth + 1)) return true;
    // Font ascender/descender boxes may extend beyond a line box while remaining
    // completely visible. Test actual clipping ancestors, not scrollHeight alone.
    // Document/explicit scroll containers remain user-operable. Hidden/clip
    // ancestors must not crop readable text; global horizontal bounds still apply.
    for (let parent: Element | null = el; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      const left = bounds.left + parent.clientLeft, top = bounds.top + parent.clientTop;
      if (/(hidden|clip)/.test(style.overflowX) && rectangles.some(r => r.left < left - 1 || r.right > left + parent.clientWidth + 1)) return true;
      if (/(hidden|clip)/.test(style.overflowY) && rectangles.some(r => r.top < top - 1 || r.bottom > top + parent.clientHeight + 1)) return true;
    }
    return false;
  }).map(el => el.textContent));
}
async function assertReadableBounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await clippedText(page)).toEqual([]);
}

test('readability probe detects genuine vertical and horizontal clipping', async ({ page }) => {
  await page.setContent('<header><div style="height:8px;overflow:hidden"><h1>Vertical clipping control</h1></div><p style="width:40px;white-space:nowrap;overflow:hidden">Horizontal clipping control</p></header>');
  expect(await clippedText(page)).toEqual(['Vertical clipping control', 'Horizontal clipping control']);
});

for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
  test(`launch typography and controls remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('h1')).toHaveText(`${en.landHeroTitle1} ${en.landHeroTitle2}`, { useInnerText: true });
    await expect(page.locator('h1 br')).toHaveCount(0);
    await expect(page.locator('header [lang="sa"]')).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: en.landHeroCta1, exact: true })).toBeVisible();
    await assertReadableBounds(page);
    // Decorative geometry is optional in the new storyboard. If retained, it
    // must still be presentation-only and never cover or alter actual text.
    const layer = page.locator('.hero-edge-depth');
    if (await layer.count()) {
      await expect(layer).toHaveAttribute('aria-hidden', 'true');
      await expect(layer).toHaveCSS('pointer-events', 'none');
      for (const target of await page.locator('header h1, header p, header a, header ul').filter({ visible: true }).all()) {
        // A locator screenshot scrolls its target; compare geometry after that scroll.
        const visible = await target.screenshot({ animations: 'disabled' });
        const before = await target.boundingBox();
        await layer.evaluate(el => { el.style.display = 'none'; });
        expect(await target.boundingBox()).toEqual(before);
        expect((await target.screenshot({ animations: 'disabled' })).equals(visible)).toBe(true);
        await layer.evaluate(el => el.style.removeProperty('display'));
      }
    }
  });
}

for (const width of [320, 390, 1440]) {
  test(`200 percent text is not clipped at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    // Enlarge every computed font once, including px/clamp-sized text. Merely
    // changing the root size misses fixed-size headings and safety notes.
    await page.evaluate(() => {
      const text = [...document.querySelectorAll<HTMLElement>('main *')]
        .filter(el => !el.closest('svg'))
        .map(el => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
      for (const { el, size } of text) el.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    await assertReadableBounds(page);
    await expect(page.locator('[data-product-directory]')).toBeHidden();
    for (const product of PRODUCT_REGISTRY) {
      await selectCompanyProduct(page, product.name);
      await assertReadableBounds(page);
    }
    await page.locator('footer a[href="/app"]').click();
    await expect(page).toHaveURL(/\/app$/);
  });
}

test('reduced motion is static, including SVG and hover effects', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await ready(page);
  await page.locator('.unoone-orbit-stage').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(page.locator('.unoone-orbit-stage')).toHaveAttribute('data-orbit-state', 'running');
  // A live preference change must stop active motion too. Hiding/disablement
  // of replay under reduced motion is valid; don't try to activate a hidden UI.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  const node = page.locator('.unoone-capability-map button[aria-controls="unoone-capability-detail"]:visible').last();
  const before = await node.boundingBox();
  await node.hover();
  expect(await node.boundingBox()).toEqual(before);
  // CSS animations alone do not expose native SMIL or rAF transforms. Sample
  // actual matrices and geometry across frames after the hover/replay intent.
  const moving = await page.locator('.unoone-capability-map').evaluate(async root => {
    const nodes = [...root.querySelectorAll('button, svg, svg * , .unoone-orbit-rings, .unoone-orbit-rings circle')];
    const sample = () => nodes.map(el => {
      const box = el.getBoundingClientRect();
      const matrix = el instanceof SVGGraphicsElement ? el.getCTM() : null;
      return [box.x, box.y, box.width, box.height, getComputedStyle(el).transform, getComputedStyle(el).opacity,
        matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]];
    });
    const first = JSON.stringify(sample());
    for (let n = 0; n < 40; n++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (JSON.stringify(sample()) !== first) return true;
    }
    return false;
  });
  expect(moving).toBe(false);
});

test('citation has at least 4.5:1 contrast rather than a fixed decorative color', async ({ page }) => {
  await page.goto('/');
  const citation = page.locator('header p').filter({ hasText: en.gitaCitation });
  await expect(citation).toBeVisible();
  const colors = await citation.evaluate(el => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const foreground = rgb(getComputedStyle(el).color);
    let background = [255, 255, 255];
    const ancestors: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) ancestors.unshift(node);
    for (const node of ancestors) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      const alpha = c[3] ?? 1;
      background = background.map((value, i) => c[i] * alpha + value * (1 - alpha));
    }
    const alpha = foreground[3] ?? 1;
    return { foreground: background.map((value, i) => foreground[i] * alpha + value * (1 - alpha)), background };
  });
  const luminance = (rgb: number[]) => rgb.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const values = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a);
  expect((values[0] + .05) / (values[1] + .05)).toBeGreaterThanOrEqual(4.5);
});
