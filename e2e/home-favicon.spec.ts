import { test, expect } from "@playwright/test";

test("home loads and favicon is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/InBharat/i);

  const favicon = await page.goto("/favicon.ico");
  expect(favicon?.status()).toBe(200);
});

test("static test page loads favicon and CSS without 401", async ({ page }) => {
  const favicon = await page.goto("/favicon.png");
  expect(favicon?.status()).toBe(200);

  const css = await page.goto("/index.css");
  expect(css?.status()).toBe(200);
});
