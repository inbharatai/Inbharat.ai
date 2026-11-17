import { test, expect, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { UNOONE_LANDING } from '../content/unooneLanding';
import { croppedText } from './scoped-helpers';
const languages = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'or', 'as'];
const locale = (code: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'));

const english = locale('en');

async function languageOf(node: Locator, language: string) {
  await expect(node).toBeVisible();
  expect(await node.evaluate(el => el.closest('[lang]')?.getAttribute('lang'))).toBe(language);
}

for (const language of languages) {
  const messages = { ...english, ...locale(language) };
  for (const width of [390, 1440]) {
    test(`${language}: preserved philosophy/company caveats and honest English islands at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));
      await page.goto('/');
      await expect(page.locator('.landing-shell')).toHaveAttribute('data-landing-ready', 'true');
      if (width < 640) await page.getByRole('button', { name: english.openMenu, exact: true }).click();
      const selector = page.getByRole('combobox').filter({ visible: true }).first();
      await expect(selector).toBeVisible();
      await expect(selector.locator('option')).toHaveCount(11);
      await selector.selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(selector).toHaveValue(language);
      expect(await page.evaluate(() => localStorage.getItem('appLanguage'))).toBe(language);
      const notice = page.locator('[data-locale-coverage]');
      await expect(notice).toHaveText(messages.landLanguageCoverageNotice);
      await languageOf(notice.getByText(messages.landLanguageCoverageNotice, { exact: true }), language);
      await expect(page.locator('[lang="sa"]')).toContainText('कर्मण्येवाधिकारस्ते');
      await expect(page.locator('[lang="sa"]')).toContainText('मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि');
      await languageOf(page.locator('header').getByText(messages.gitaTranslation, { exact: false }), language);
      await languageOf(page.locator('header').getByText(messages.gitaCitation, { exact: true }), language);
      await expect(page.locator('h1')).toHaveText(`${messages.landHeroTitle1} ${messages.landHeroTitle2}`, { useInnerText: true });
      for (const key of ['landHeroTitle1', 'landHeroTitle2']) await languageOf(page.locator(`h1 [aria-label=${JSON.stringify(messages[key])}]`), messages[key] === english[key] ? 'en' : language);
      await languageOf(page.getByText(UNOONE_LANDING.definition, { exact: true }), 'en');
      await expect(page.locator('[data-product-directory]')).toBeHidden();
      // Canonical portfolio descriptions may be English; the historical local
      // safety/privacy/medical caveats must remain visible as local UI content.
      // Assert the user-facing text, not obsolete category-card implementations.
      for (const [key, name] of [['landSafetyNotice', ''], ['landProdSocialFlowDesc', 'SocialFlow'], ['landProdSwasthyaDesc', 'SwasthyaScore AI'], ['landProdSahaayakSevaDesc', 'Sahayaak Seva']]) {
        if (name) {
          await page.locator('#products button').filter({ hasText: messages.landBucketCore }).filter({ visible: true }).first().click();
          await page.locator('#products button').filter({ hasText: name }).filter({ visible: true }).first().click();
        }
        const caveat = page.getByText(messages[key], { exact: true }).filter({ visible: true }).first();
        await languageOf(caveat, language);
        expect(await croppedText(caveat)).toEqual([]);
      }
      const company = page.locator('#faq');
      // Company questions can be grouped under a native outer disclosure.
      const outer = company.locator(':scope > details');
      if (await outer.count()) await outer.locator(':scope > summary').click();
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const summary = company.getByText(messages[`faqQ${n}`], { exact: true });
        await summary.click();
        const answer = company.getByText(messages[`faqA${n}`], { exact: true });
        // Some preserved resources contain English fallback text that differs
        // from today's English resource. Script-free English is still English.
        const value = messages[`faqA${n}`];
        await languageOf(answer, value === english[`faqA${n}`] || !/[\u0900-\u0dff]/.test(value) ? 'en' : language);
        expect(await croppedText(answer)).toEqual([]);
      }
      await expect(page.locator('#mission')).toContainText(messages.landMissionDesc);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(page.locator('.landing-shell')).not.toContainText('[EN]');
      await expect(page.locator('footer a[href="/app"]')).toBeVisible();
      await page.locator('footer a[href="/about"]').click();
      await expect(page).toHaveURL(/\/about$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect(errors).toEqual([]);
    });
  }
}
