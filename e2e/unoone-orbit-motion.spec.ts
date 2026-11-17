import { test, expect, type Locator } from '@playwright/test';

const positions = (stage: Locator) => stage.locator('.unoone-orbit-pill:visible').evaluateAll(nodes => nodes.map(node => {
  const box = node.getBoundingClientRect(); const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
  return { x: box.x, y: box.y, width: box.width, height: box.height, b: matrix.b, c: matrix.c };
}));
const displacement = (a: Awaited<ReturnType<typeof positions>>, b: Awaited<ReturnType<typeof positions>>) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

for (const width of [320, 390, 1440]) {
  test(`orbit auto-rotates in view, stays upright and pauses/resumes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/'); await page.mouse.move(0, 0);
    const stage = page.locator('.unoone-orbit-stage'); await stage.scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute('data-orbit-state', 'running');
    const first = await positions(stage); expect(first).toHaveLength(12);
    await expect.poll(async () => displacement(first, await positions(stage))).toBeGreaterThan(3);
    for (const p of await positions(stage)) { expect(Math.abs(p.b)).toBeLessThan(.001); expect(Math.abs(p.c)).toBeLessThan(.001); expect(p.x).toBeGreaterThanOrEqual(-1); expect(p.x + p.width).toBeLessThanOrEqual(width + 1); }
    await page.getByRole('button', { name: 'Pause orbit animation', exact: true }).click();
    await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const paused = await positions(stage); await page.waitForTimeout(350);
    expect(displacement(paused, await positions(stage))).toBeLessThan(.1);
    await page.getByRole('button', { name: 'Resume orbit animation', exact: true }).click();
    await expect(stage).toHaveAttribute('data-orbit-state', 'running');
    await expect.poll(async () => displacement(paused, await positions(stage))).toBeGreaterThan(2);
    await expect(stage.locator('.inbharat-orbit-mark')).toHaveAttribute('src', '/inbharat-logo.svg');
  });
}

test('hover/focus, offscreen and hidden-page suspension retain real pause behavior', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/'); await page.mouse.move(0, 0); const stage = page.locator('.unoone-orbit-stage'); await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute('data-orbit-state', 'running');
  const control = stage.locator('.unoone-orbit-desktop-control').first(); const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
  await page.mouse.move(0, 0); await expect(stage).toHaveAttribute('data-orbit-state', 'running');
  await control.focus(); await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
  await page.getByRole('button', { name: 'Pause orbit animation', exact: true }).focus(); await expect(stage).toHaveAttribute('data-orbit-state', 'running');
  await page.evaluate(() => window.scrollTo(0, 0)); await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
  const offscreen = await positions(stage); await page.waitForTimeout(350); expect(displacement(offscreen, await positions(stage))).toBeLessThan(.1);
  await stage.scrollIntoViewIfNeeded(); await expect(stage).toHaveAttribute('data-orbit-state', 'running');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
  const hidden = await positions(stage); await page.waitForTimeout(350); expect(displacement(hidden, await positions(stage))).toBeLessThan(.1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(stage).toHaveAttribute('data-orbit-state', 'running');
});

test('requested hierarchy: intro/orbit together, demo below, JAK only in directory', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.locator('header a[href="/unoone"]')).toHaveText('Meet UnoOne');
  await expect(page.locator('#pai #ecosystem')).toHaveCount(1);
  await expect(page.locator('#pai .unoone-product-grid #unoone-demo')).toHaveCount(0);
  await expect(page.locator('#pai .unoone-product-demo #unoone-demo')).toHaveCount(1);
  await expect(page.locator('section#jakswarm')).toHaveCount(0);
  await expect(page.locator('#products #jakswarm')).toHaveCount(1);
  await page.locator('nav a[href="#jakswarm"]').filter({ visible: true }).first().click();
  await expect(page.locator('#products h3:visible').first()).toHaveText('JAK Swarm');
  await expect(page.locator('#ecosystem .unoone-orbit-stage')).toHaveAttribute('data-orbit-state', 'reduced');
});

test('immediate pause preserves positions across repeated effect transitions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/'); await page.mouse.move(0, 0); const stage = page.locator('.unoone-orbit-stage'); await stage.scrollIntoViewIfNeeded();
  for (let cycle = 0; cycle < 6; cycle++) {
    await expect(stage).toHaveAttribute('data-orbit-state', 'running');
    const moving = await positions(stage); await expect.poll(async () => displacement(moving, await positions(stage))).toBeGreaterThan(2);
    const jump = await stage.evaluate(async root => {
      const points = () => [...root.querySelectorAll<HTMLElement>('.unoone-orbit-desktop-control')].map(el => { const p = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: p.x - b.x, y: p.y - b.y }; });
      const before = points();
      (root.closest('.unoone-capability-map')!.querySelector('.unoone-orbit-replay') as HTMLButtonElement).click();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return Math.max(...points().map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y)));
    });
    expect(jump).toBeLessThan(1.6);
    await expect(stage).toHaveAttribute('data-orbit-state', 'paused');
    await page.getByRole('button', { name: 'Resume orbit animation', exact: true }).click();
  }
});

test('running orbit survives responsive reinitialization without overlap or freeze', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/'); await page.mouse.move(0, 0); const stage = page.locator('.unoone-orbit-stage'); await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute('data-orbit-state', 'running');
  const initial = await positions(stage); await expect.poll(async () => displacement(initial, await positions(stage))).toBeGreaterThan(3);
  for (const width of [370, 520, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await stage.scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute('data-orbit-state', 'running');
    const first = await positions(stage); await expect.poll(async () => displacement(first, await positions(stage))).toBeGreaterThan(2);
    const current = await positions(stage);
    for (let i = 0; i < current.length; i++) for (let j = i + 1; j < current.length; j++) {
      const a = current[i], b = current[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX > .5 && overlapY > .5, `labels ${i}/${j} overlap after resize to ${width}`).toBe(false);
    }
  }
});
