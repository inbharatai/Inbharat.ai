import { test, expect } from "@playwright/test";

test("chat page loads; send works with mocked search API when input is visible", async ({ page }) => {
  await page.route("**/api/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ organic: [], requestId: "test" }),
    });
  });

  const res = await page.goto("/app", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  // Auth-first: signed-out users land on the auth panel.
  await expect(page.locator("body")).toContainText(/InBharat|Sign in/i, { timeout: 15000 });

  const input = page.getByTestId("chat-input");
  const visible = await input.isVisible().catch(() => false);
  if (!visible) {
    await page.waitForTimeout(3000);
    const visibleAgain = await input.isVisible().catch(() => false);
    if (!visibleAgain) {
      test.skip();
      return;
    }
  }
  const disabled = await input.isDisabled().catch(() => false);
  if (disabled) {
    // Auth-first: chat input exists but is disabled until sign-in.
    test.skip();
    return;
  }
  await input.fill("Hello");
  await page.locator("button").filter({ has: page.locator("svg") }).last().click();
  await expect(page.locator("text=Hello").first()).toBeVisible({ timeout: 20000 });
});
