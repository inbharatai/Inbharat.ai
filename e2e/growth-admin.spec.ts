import { test, expect } from "@playwright/test";

/**
 * InBharat Growth Agent — admin gate + chat regression.
 *
 * Proves the growth admin surface is reachable without crashing and that the
 * existing chat flow (the backend the growth agent must never break) still loads.
 * These are smoke checks — they do not exercise the gated audit endpoints
 * (which require admin auth + configured Supabase).
 */

test("growth admin route renders without crashing", async ({ page }) => {
  const res = await page.goto("/admin/growth", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  // The admin layout chrome should be present regardless of auth state
  // (RequireAdmin either renders children in local dev, or a "Not authorized"
  // notice). Either way the page must not error.
  await expect(page.locator("body")).toContainText(/INBHARAT GROWTH|Not authorized/i, { timeout: 15000 });
  // Admin pages must never be indexed.
  const robots = await page.getAttribute('meta[name="robots"]', "content");
  expect(robots).toContain("noindex");
});

test("chat backend is untouched — /app still loads", async ({ page }) => {
  await page.route("**/api/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ organic: [], requestId: "test" }),
    });
  });
  const res = await page.goto("/app", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/InBharat|Sign in/i, { timeout: 15000 });
});