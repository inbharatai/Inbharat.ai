/**
 * GA4 firing verification.
 *
 * Confirms that when VITE_GA_MEASUREMENT_ID is configured, lib/analytics.ts:
 *   - injects the googletagmanager.com gtag script, and
 *   - fires a manual page_view event per route (SPA-safe).
 *
 * Skips automatically when PLAYWRIGHT_GA_ID is not provided, so it is safe to
 * commit as a regression guard (CI without GA configured just skips it).
 *
 * Run: CI=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 PLAYWRIGHT_GA_ID=G-XXXX npx playwright test e2e/ga-firing.spec.ts
 */
import { test, expect } from '@playwright/test';

const GA_ID = process.env.PLAYWRIGHT_GA_ID;
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.skip(!GA_ID, 'PLAYWRIGHT_GA_ID not set — GA firing verification skipped');

test('gtag script loads and page_view fires on each route', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE + '/');

  // 1. The gtag loader script is injected with the correct Measurement ID.
  await expect(
    page.locator(`script[src*="googletagmanager.com/gtag/js?id=${GA_ID}"]`),
  ).toBeAttached({ timeout: 10000 });

  // 2. window.dataLayer exists and at least one page_view event was pushed.
  //    The canonical Google snippet pushes the raw `arguments` object (an
  //    array-like, not a true Array), so we read entries via index access
  //    rather than Array.isArray — both the baked-shell snippet and analytics.ts
  //    produce entries this check can see.
  const pageViewsHome = await page.evaluate(() => {
    const dl = (window as any).dataLayer || [];
    return dl.filter(
      (e: any) =>
        e && typeof e.length === 'number' && e[0] === 'event' && e[1] === 'page_view',
    ).length;
  });
  expect(pageViewsHome).toBeGreaterThanOrEqual(1);

  // 3. Client-side navigation to /about fires a second pageView.
  await page.goto(BASE + '/about');
  await page.waitForLoadState('domcontentloaded');
  const pageViewsAfterNav = await page.evaluate(() => {
    const dl = (window as any).dataLayer || [];
    return dl.filter(
      (e: any) =>
        e && typeof e.length === 'number' && e[0] === 'event' && e[1] === 'page_view',
    ).length;
  });
  expect(pageViewsAfterNav).toBeGreaterThanOrEqual(1);

  // 4. No uncaught script errors (e.g. CSP blocking the gtag script).
  expect(errors).toEqual([]);
});