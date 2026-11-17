import { test, expect } from '@playwright/test';

test('public landing and console do not offer inactive account controls', async ({ page }) => {
  for (const path of ['/', '/app']) {
    await page.goto(path);
    await expect(page.locator('#root')).not.toBeEmpty();
    if (path === '/app') await expect(page.getByTestId('chat-input')).toBeVisible();
    else await expect(page.locator('header#main-content h1')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(sign in|sign up|create account)$/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^(sign in|sign up|create account)$/i })).toHaveCount(0);
  }
});

test('hiding public login does not bypass the existing guest limit', async ({ page }) => {
  let chatRequests = 0;
  await page.route('**/api/chat', async (route) => { chatRequests++; await route.abort(); });
  await page.addInitScript(() => localStorage.setItem('inbharat_guest_chats', '3'));
  await page.goto('/app');
  const input = page.getByTestId('chat-input');
  await expect(input).toBeVisible();
  await input.fill('A guest-limit regression probe');
  await input.press('Enter');
  await expect(page.getByText('Guest preview limit reached. Account access is temporarily paused.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(sign in|sign up)$/i })).toHaveCount(0);
  expect(chatRequests).toBe(0);
});
