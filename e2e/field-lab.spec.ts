import { test, expect } from '@playwright/test';

// Restoration regression: Field Lab was explicitly rejected by the owner.
// Preserve the original design instead of asserting the retired replacement.
for (const width of [390, 1440]) {
  test(`original visual identity restored at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const hero = page.locator('header#main-content');
    const title = hero.locator('h1');
    const verse = hero.locator('[lang="sa"]');
    const dpiit = hero.getByText('DPIIT Recognised', { exact: true });
    const stanford = hero.getByText(/Stanford Seed Spark/);
    await expect(verse).toBeVisible();
    await expect(dpiit).toBeVisible();
    await expect(stanford).toBeVisible();
    const headingBox = await title.boundingBox();
    expect((await verse.boundingBox())!.y).toBeLessThan(headingBox!.y);
    expect((await dpiit.boundingBox())!.y).toBeLessThan(headingBox!.y);
    expect((await stanford.boundingBox())!.y).toBeLessThan(headingBox!.y);
    await expect(page.locator('.hero-mesh')).toBeAttached();
    await expect(page.locator('.field-lab')).toHaveCount(0);
    await expect(page.locator('.field-media')).toHaveCount(0);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(hero.getByRole('link', { name: /Launch InBharat AI/i })).toHaveAttribute('href', '/app');
    await page.locator('#ecosystem').scrollIntoViewIfNeeded();
    for (const label of ['SocialFlow', 'JAK Swarm', 'KathaKitaab', 'Agent Arcade']) {
      await expect(page.locator('#ecosystem').getByText(label === 'KathaKitaab' ? /^KathaKitaab\s*\*?$/ : label, { exact: true })).toBeVisible();
    }
    await expect(page.locator('.marquee-ltr')).toBeAttached();
    await expect(page.locator('.marquee-rtl')).toBeAttached();
  });
}
