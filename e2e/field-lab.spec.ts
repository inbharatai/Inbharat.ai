import { test, expect } from '@playwright/test';
import en from '../locales/en.json' with { type: 'json' };
import { FEATURED_CREDENTIALS } from '../content/credentials';

// Owner-approved scope preserves the original upper company presentation.
for (const width of [390, 1440]) {
  test(`approved launch preserves site signatures at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const hero = page.locator('header#main-content');
    await expect(hero.locator('h1')).toHaveText(`${en.landHeroTitle1} ${en.landHeroTitle2}`, { useInnerText: true });
    const verse = hero.locator('[lang="sa"]');
    await expect(verse).toBeVisible();
    await expect(verse).toContainText('कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।');
    await expect(verse).toContainText('मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥');
    await expect(verse.locator('br')).toHaveCount(1);
    const heading = (await hero.locator('h1').boundingBox())!;
    const verseBox = (await verse.boundingBox())!;
    expect(verseBox.y + verseBox.height).toBeLessThanOrEqual(heading.y);
    const rail = hero.getByRole('list', { name: 'Recognitions and programmes' });
    await expect(rail).toBeVisible();
    await expect(rail.locator('li')).toHaveCount(FEATURED_CREDENTIALS.length);
    for (const label of FEATURED_CREDENTIALS.map(credential => credential.short)) {
      await expect(rail.getByText(label, { exact: true })).toBeAttached();
    }
    // Recognition is near the top, not necessarily above the revised headline.
    expect((await rail.boundingBox())!.y).toBeLessThan((await page.locator('#pai').boundingBox())!.y);
    await expect(page.locator('.field-lab, .field-media')).toHaveCount(0);
    await expect(hero.locator('video')).toHaveCount(0);
    await expect(page.locator('#pai video')).toHaveCount(1);
    await expect(page.locator('#pai video')).toHaveAttribute('controls', '');
    await expect(page.locator('#pai video')).toHaveAttribute('preload', 'none');
    await expect(page.locator('#pai video')).not.toHaveAttribute('autoplay');
    await expect(hero.getByRole('link', { name: en.landHeroCta2, exact: true })).toHaveAttribute('href', '/unoone');
    await expect(hero.locator('a[href="/app"]')).toHaveText(en.landHeroCta1);
    await expect(hero.locator('.metric-num')).toHaveText(['2', '11', '2']);
    await expect(page.locator('footer a[href="/app"]')).toHaveAttribute('href', '/app');
    await expect(page.locator('#ecosystem .unoone-orbit-stage')).toBeVisible();
    await expect(page.locator('#ecosystem button[aria-controls="unoone-capability-detail"]:visible')).toHaveCount(12);
    await expect(page.locator('#ecosystem')).toContainText('not live telemetry');
  });
}
