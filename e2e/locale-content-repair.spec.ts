import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const locale = (code: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'));
const hi = locale('hi');
const ml = locale('ml');
const en = locale('en');

for (const [language, messages] of [['hi', hi], ['ml', ml]] as const) {
  for (const width of [360, 1280]) {
    test(`${language}: resource-language semantics and unclipped caveats at ${width}px`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));
      await page.goto('/');
      await expect(page.locator('.landing-shell')).toBeVisible();
      if (width < 640) await page.locator('nav button[aria-label]').last().click();
      const selector = page.locator('select:visible');
      await expect(selector).toHaveCount(1);
      await expect(selector.locator('option')).toHaveCount(11);
      await expect(selector).toHaveAttribute('aria-label', /.+/);
      await selector.selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(selector).toHaveValue(language);
      expect(await page.evaluate(() => localStorage.getItem('appLanguage'))).toBe(language);
      const notice = page.locator('[data-locale-coverage]');
      await expect(notice).toHaveText(messages.landLanguageCoverageNotice);
      await expect(notice.locator('span')).toHaveAttribute('lang', language);
      await expect(page.locator('[lang="sa"]')).toContainText('कर्मण्येवाधिकारस्ते');
      await expect(page.locator('[data-english-only]').first()).toContainText(en.landDevicesSub);
      await expect(page.locator('[data-english-only]').first()).toHaveAttribute('lang', 'en');
      await expect(page.locator('#jakswarm').getByText(messages.landSafetyNotice, { exact: true })).toHaveAttribute('lang', language);
      await expect(page.locator('#jakswarm').getByText(en.landJakDesc, { exact: true })).toHaveAttribute('lang', 'en');
      await page.locator('#products').getByRole('button').filter({ hasText: 'SocialFlow' }).click();
      const socialPrivacy = page.locator('#products').getByText(messages.landProdSocialFlowDesc, { exact: true });
      await expect(socialPrivacy).toBeVisible();
      await expect(socialPrivacy).toHaveAttribute('lang', language);
      // Exercise actual disclosure controls; verify the privacy/access caveats,
      // not merely a source JSON string or a document-wide English default.
      for (const n of [2, 3, 4, 6]) {
        const disclosure = page.locator('#faq details').nth(n - 1);
        await disclosure.locator('summary').click();
        const answer = disclosure.locator('p > span');
        await expect(answer).toHaveAttribute('lang', language);
        await expect(answer).toHaveText(messages[`faqA${n}`]);
        await expect(answer).toBeVisible();
        const fits = await disclosure.locator('p').evaluate(el => {
          const box = el.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(el);
          return [...range.getClientRects()].every(r => r.left >= box.left - 1 && r.right <= box.right + 1)
            && el.scrollHeight <= el.clientHeight + 1;
        });
        expect(fits).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.landing-shell')).not.toContainText('[EN]');
      await expect(page.locator('a[href="/app"]').first()).toBeAttached();
      // A SPA transition must restore the English article/document boundary.
      await page.locator('footer a[href="/about"]').click();
      await expect(page).toHaveURL(/\/about$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect(pageErrors).toEqual([]);
    });
  }
}
