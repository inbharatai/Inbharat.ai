/**
 * Playwright E2E: add silt.inbharat.ai as a custom domain to the existing
 * InBharat.ai Vercel project, without creating a separate project.
 *
 * Prerequisites:
 *   1. You must be logged into Vercel in a local browser session.
 *   2. Generate an auth state file first:
 *      npx playwright open --save-storage=scripts/vercel-auth.json https://vercel.com/dashboard
 *   3. Then run this script:
 *      npx playwright test scripts/add-silt-domain.spec.ts
 *
 * The script opens the project's Domain settings, adds silt.inbharat.ai,
 * waits for Vercel to issue the challenge, and prints the required DNS record.
 */

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const AUTH_STATE = resolve(__dirname, "vercel-auth.json");

// Project slug from the Vercel dashboard (shown in the deployment URL).
const VERCEL_TEAM = "reeturaj-s-projects"; // your personal/team slug
const PROJECT_SLUG = "inbharat-4o846e2qm"; // shown before -reeturaj-s-projects.vercel.app
const DOMAIN = "silt.inbharat.ai";

test.use({
  storageState: existsSync(AUTH_STATE) ? AUTH_STATE : undefined,
  headless: false, // set true after you trust the flow
});

test("add silt.inbharat.ai to the InBharat.ai Vercel project", async ({ page }) => {
  // 1. Open project domains page
  const url = `https://vercel.com/${VERCEL_TEAM}/${PROJECT_SLUG}/settings/domains`;
  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });

  // 2. Wait for the domains input to appear
  const input = page.locator('input[placeholder*="domain" i], input[name="domain"], input[data-testid="domain-input"]').first();
  await expect(input).toBeVisible({ timeout: 15000 });

  // 3. Type the domain
  await input.fill(DOMAIN);

  // 4. Click the add-domain button (label varies: "Add", "Add Domain", "Continue")
  const addBtn = page
    .locator('button')
    .filter({ hasText: /^(Add|Add Domain|Continue)$/i })
    .first();
  await addBtn.click();

  // 5. Wait for the DNS / verification panel
  await page.waitForSelector('text=/CNAME|A Record|DNS|Nameservers|Verify/i', { timeout: 30000 });

  // 6. Extract the DNS record Vercel wants
  const dnsText = await page.locator('body').textContent();
  const cnameMatch = dnsText?.match(/cname\.vercel-dns\.com/i);
  const aRecordMatch = dnsText?.match(/76\.76\.21\.21/i);

  console.log("\n=== Vercel domain setup result ===");
  console.log(`Domain: ${DOMAIN}`);
  if (cnameMatch) {
    console.log("Add this CNAME record in GoDaddy:");
    console.log(`  Type: CNAME`);
    console.log(`  Host: silt`);
    console.log(`  Value: cname.vercel-dns.com.`);
    console.log(`  TTL: 600`);
  } else if (aRecordMatch) {
    console.log("Add this A record in GoDaddy:");
    console.log(`  Type: A`);
    console.log(`  Host: silt`);
    console.log(`  Value: 76.76.21.21`);
    console.log(`  TTL: 600`);
  } else {
    console.log("Could not auto-extract DNS record. Please copy it manually from the Vercel dashboard.");
  }

  // 7. Keep the browser open briefly so you can verify, then close
  await page.waitForTimeout(5000);
});
