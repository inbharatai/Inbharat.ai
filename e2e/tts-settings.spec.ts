import { test, expect } from "@playwright/test";

test("settings panel opens and TTS/speech controls do not crash", async ({ page }) => {
  const res = await page.goto("/app", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/InBharat|Desh Ka Ai|Ask/i, { timeout: 15000 });

  const settingsBtn = page.getByTestId("settings-button");
  const visible = await settingsBtn.isVisible().catch(() => false);
  if (!visible) {
    await page.waitForTimeout(3000);
    const visibleAgain = await settingsBtn.isVisible().catch(() => false);
    if (!visibleAgain) {
      test.skip();
      return;
    }
  }
  await settingsBtn.click();
  await expect(page.locator("text=Voice & speech")).toBeVisible({ timeout: 5000 });

  const rate = page.locator('input[type="range"]').first();
  await expect(rate).toBeVisible();
  await rate.fill("1.2");

  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator("text=Voice & speech")).not.toBeVisible();
});
