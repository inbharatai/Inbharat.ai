import { test, expect, type Page } from '@playwright/test';

const cards = '#deep-tech article';

test('crawlable copy includes the same precise product boundaries', async ({ request }) => {
  for (const path of ['/', '/about']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('Default packet transfer leaves receiver weights unchanged');
    expect(html).toContain('The host computes; the drive remains the authoritative store');
  }
});
async function enter(page: Page) {
  await page.locator(cards).first().scrollIntoViewIfNeeded();
  await expect(page.locator('.product-concept-layer').first()).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}
async function geometry(page: Page) {
  return page.locator(cards).evaluateAll(nodes => nodes.map(card => {
    const c = card.getBoundingClientRect();
    return [c.width, c.height, ...Array.from(card.querySelectorAll('[data-concept-content] h3,[data-concept-content] p,[data-concept-content] a')).flatMap(e => {
      const r = e.getBoundingClientRect();
      // Ignore sub-micro-pixel arithmetic drift from the unchanged hover transform.
      return [r.x - c.x, r.y - c.y, r.width, r.height].map(value => Math.round(value * 1000) / 1000);
    })];
  }));
}

for (const width of [1440, 390, 320]) {
  test(`poster-first placement, masks, content and stable geometry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const videoRequests: string[] = [];
    page.on('request', r => { if (/product-concepts\/.*\.mp4/.test(r.url())) videoRequests.push(r.url()); });
    await page.goto('/');
    await expect(page.locator(cards)).toHaveCount(2);
    expect(videoRequests).toEqual([]);
    await expect(page.locator(`${cards} video[src]`)).toHaveCount(0);
    await enter(page);
    const first = page.locator(cards).first();
    await expect(first.locator('video')).toHaveAttribute('src', '/product-concepts/silt.mp4');
    await expect.poll(() => first.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
    const stage = first.locator('.product-concept-stage');
    await expect(stage).toHaveCSS('top', width < 768 ? '106px' : '84px');
    await expect(stage).toHaveCSS('right', width < 768 ? '9px' : '18px');
    await expect(stage).toHaveCSS('height', width < 768 ? '125px' : '170px');
    await expect(first.locator('.product-concept-layer')).toHaveCSS('opacity', width < 768 ? '0.3' : '0.46');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const before = await geometry(page);
    // Graphic visibility cannot influence any original content geometry.
    await page.locator('.product-concept-layer').evaluateAll(nodes => nodes.forEach(n => (n as HTMLElement).style.display = 'none'));
    expect(await geometry(page)).toEqual(before);
    await page.locator('.product-concept-layer').evaluateAll(nodes => nodes.forEach(n => (n as HTMLElement).style.removeProperty('display')));
    const uncovered = () => first.evaluate(async card => {
      const layer = card.querySelector<HTMLElement>('.product-concept-layer')!;
      if (layer.dataset.ready !== 'true') return ['mask updating'];
      const originalMask = layer.style.maskImage;
      const url = originalMask.slice(5, -2);
      let text: string;
      try { text = await (await fetch(url)).text(); } catch { return ['mask updating']; }
      if (layer.dataset.ready !== 'true' || layer.style.maskImage !== originalMask) return ['mask updating'];
      // Measure global positions only AFTER the asynchronous blob read. Original
      // scroll/hover motion may translate the entire card while fetch awaits.
      const base = layer.getBoundingClientRect();
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml');
      const boxes = Array.from(svg.querySelectorAll('rect[fill="black"]')).map(r => ['x', 'y', 'width', 'height'].map(k => Number(r.getAttribute(k))));
      const missing: string[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim() || layer.contains(node)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (!r.width || !r.height) continue;
          if (!boxes.some(([x, y, w, h]) => x <= r.left - base.left && y <= r.top - base.top && x + w >= r.right - base.left && y + h >= r.bottom - base.top)) missing.push(node.textContent);
        }
      }
      return missing;
    });
    await expect.poll(uncovered).toEqual([]);
    await expect(first.locator('h3')).toHaveText('SILT');
    await expect(page.locator(cards).nth(1).locator('h3')).toHaveText('Pocket AI');
    await expect(first.getByRole('link', { name: 'Explore SILT' })).toHaveAttribute('href', 'https://silt.inbharat.ai');
    await expect(first.getByText(/Patent Pending/)).toBeVisible();
    const note = await first.locator('.product-concept-note').boundingBox();
    for (const link of await first.getByRole('link').all()) {
      const box = (await link.boundingBox())!;
      expect(note!.y).toBeGreaterThanOrEqual(box.y + box.height);
    }
  });
}

test('native local clips decode/play; user pause survives scrolling; offscreen and hidden pause', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const id of ['silt', 'pai']) {
    const media = await request.get(`/product-concepts/${id}.mp4`);
    expect(media.ok(), `real ${id} media must exist; never mock native playback`).toBeTruthy();
    expect(media.headers()['content-type']).toContain('video/mp4');
    const poster = await request.get(`/product-concepts/${id}.webp`);
    expect(poster.headers()['content-type']).toContain('image/webp');
  }
  await page.goto('/'); await enter(page);
  for (const video of await page.locator(`${cards} video`).all()) {
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
    expect(await video.evaluate(v => ({ muted: (v as HTMLVideoElement).muted, inline: (v as HTMLVideoElement).playsInline, loop: (v as HTMLVideoElement).loop }))).toEqual({ muted: true, inline: true, loop: true });
  }
  const before = await geometry(page);
  await page.getByRole('button', { name: 'Pause SILT concept animation' }).click();
  await page.locator('header#main-content').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(`${cards} video`).evaluateAll(vs => vs.every(v => (v as HTMLVideoElement).paused))).toBeTruthy();
  await enter(page);
  expect(await page.locator(`${cards} video`).first().evaluate(v => (v as HTMLVideoElement).paused)).toBeTruthy();
  await page.getByRole('button', { name: 'Play SILT concept animation' }).click();
  await expect(page.getByRole('button', { name: 'Pause SILT concept animation' })).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  expect(await page.locator(cards).evaluateAll(nodes => nodes.map(card => {
    card.scrollLeft = 64;
    return card.scrollLeft;
  }))).toEqual([0, 0]);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.locator(`${cards} video`).evaluateAll(vs => vs.every(v => (v as HTMLVideoElement).paused))).toBeTruthy();
});

test('mobile clips autoplay muted in-view, repeat, and preserve explicit user pause', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/');
  await expect(page.locator(`${cards} video[src]`)).toHaveCount(0);
  for (const index of [0, 1]) {
    const card = page.locator(cards).nth(index);
    await card.scrollIntoViewIfNeeded();
    const video = card.locator('video');
    // No Play click: native time advancement proves muted autoplay.
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
    expect(await video.evaluate(v => ({ muted: (v as HTMLVideoElement).muted, inline: (v as HTMLVideoElement).playsInline, loop: (v as HTMLVideoElement).loop }))).toEqual({ muted: true, inline: true, loop: true });
    await video.evaluate(v => { const media = v as HTMLVideoElement; media.currentTime = media.duration - 0.2; });
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeLessThan(2);
    await expect(card.getByRole('button', { name: /^Pause / })).toBeVisible();
    await card.getByRole('button', { name: /^Pause / }).click();
    await page.locator('header#main-content').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator(`${cards} video`).evaluateAll(vs => vs.every(v => (v as HTMLVideoElement).paused))).toBeTruthy();
    await card.scrollIntoViewIfNeeded();
    expect(await video.evaluate(v => (v as HTMLVideoElement).paused)).toBeTruthy();
    await card.getByRole('button', { name: /^Play / }).click();
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).paused)).toBeFalsy();
  }
});

for (const mode of ['reduce', 'saveData'] as const) {
  for (const width of [390, 1440]) {
  test(`${mode} stays static without video requests at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    if (mode === 'reduce') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: true }) }));
    const requests: string[] = [];
    page.on('request', r => { if (r.url().endsWith('.mp4')) requests.push(r.url()); });
    await page.goto('/'); await enter(page);
    await expect(page.locator(`${cards} video[src]`)).toHaveCount(0);
    expect(requests).toEqual([]);
    if (mode === 'reduce') await expect(page.locator('.product-concept-note button')).toHaveCount(0);
    else await expect(page.getByRole('button', { name: 'Play SILT concept animation (loads video)' })).toBeVisible();
  });
  }
}

test('failed video remains a labelled poster with no misleading playback control', async ({ page }) => {
  await page.route('**/product-concepts/*.mp4', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/'); await enter(page);
  const first = page.locator(cards).first();
  await expect.poll(() => first.locator('video').evaluate(v => !!(v as HTMLVideoElement).error)).toBeTruthy();
  await expect(first.locator('video')).not.toHaveClass('is-ready');
  await expect(first.locator('.product-concept-note button')).toHaveCount(0);
  await expect(first.getByText('Concept animation · not actual hardware or a demonstration.')).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`autoplay rejection exposes deliberate Play at ${width}px (policy stub, not playback evidence)`, async ({ page }) => {
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('NotAllowed', 'NotAllowedError')); });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/'); await enter(page);
    await expect(page.getByRole('button', { name: 'Play SILT concept animation' })).toBeVisible();
  });
}

test('original entry and section anchors remain present; route unmount removes media', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header#main-content [lang="sa"]')).toBeVisible();
  await expect(page.locator('#why h2')).toBeAttached();
  await expect(page.locator('#deep-tech')).toBeAttached();
  const launch = page.locator('header#main-content').getByRole('link', { name: /Launch InBharat AI/i });
  await expect(launch).toHaveAttribute('href', '/app');
  await launch.click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.locator('.product-concept-layer')).toHaveCount(0);
});
