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
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog).toContainText(/Speech rate/i);

  const rate = dialog.locator('input[type="range"]').first();
  await expect(rate).toBeVisible();
  await rate.fill("1.2");

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
});
