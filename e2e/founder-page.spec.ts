import { test, expect } from "@playwright/test";

test("founder page is reachable from landing top navigation", async ({ page }) => {
  await page.goto("/");

  const founderCta = page.getByRole("link", { name: "Build AI with Reeturaj" });
  await expect(founderCta).toBeVisible();

  await founderCta.click();

  await expect(page).toHaveURL(/\/learn-ai-with-reeturaj$/);
  await expect(
    page.getByRole("heading", { name: /Learn AI with Reeturaj Goswami/i }),
  ).toBeVisible();
});

test("founder page loads directly", async ({ page }) => {
  const response = await page.goto("/learn-ai-with-reeturaj", { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.getByText(/No hype\. No jargon\./i)).toBeVisible();
});
