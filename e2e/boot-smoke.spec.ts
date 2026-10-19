import { test, expect } from '@playwright/test';

test('homepage mounts and keeps the Gita quote visible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('header#main-content h1')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('कर्मण्येवाधिकारस्ते', { exact: false })).toBeVisible();
  await expect(page.locator('#inbharat-boot-fallback')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('UnoOne product route mounts', async ({ page }) => {
  await page.goto('/unoone');
  await expect(page.locator('h1')).toContainText('private personal agent', { timeout: 20000 });
  await expect(page.locator('#inbharat-boot-fallback')).toHaveCount(0);
});
