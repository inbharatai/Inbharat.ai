/**
 * scripts/linkedin-populate.ts — LOCAL-ONLY LinkedIn composer auto-fill (Playwright).
 *
 * ⚠️  RISK WARNING — read before running. ⚠️
 * LinkedIn's User Agreement (§8.2) prohibits accessing the service with bots,
 * crawlers, scrapers, or "other automated means." Automating login + the compose
 * box is automation. LinkedIn CAN restrict or ban accounts that do this, and the
 * detection is heuristic — there is no guaranteed-safe way to drive the UI. The
 * deployed Growth Agent deliberately avoids this (api/growth/publish.ts returns
 * LinkedIn's OFFICIAL share deep-link, zero-ban-risk). This script is the
 * higher-friction, higher-risk alternative the founder asked for. Use it on the
 * founder's own account, on the founder's own machine, at the founder's own risk.
 *
 * THREE HARD SAFETY RAILS (not optional):
 *   1. LOCAL ONLY — never imported by the Vercel-deployed agent (serverless has no
 *      browser runtime anyway). Never wired into an API route. Run by hand.
 *   2. CREDENTIALS LOCAL — reads LINKEDIN_EMAIL / LINKEDIN_PASSWORD from .env.local
 *      (gitignored). They are NEVER written to the repo, NEVER sent to any server,
 *      NEVER logged. A persistent browser profile (~/.inbharat-linkedin) keeps the
 *      session cookie after the first login, so the PASSWORD is used ONCE.
 *   3. HUMAN GATE — NEVER clicks "Post". It fills the caption + attaches the image,
 *      then stops and leaves the browser open for the founder to review + post.
 *
 * Usage (run from repo root, after `npm i`):
 *   1) Put in .env.local (gitignored, NOT committed):
 *        LINKEDIN_EMAIL=you@example.com
 *        LINKEDIN_PASSWORD=yourpassword
 *   2) npx tsx scripts/linkedin-populate.ts \
 *        --caption "Your LinkedIn caption here. #InBharat #DeshKaAI" \
 *        --url https://inbharat.ai/learn-ai-with-reeturaj/harness-engineering \
 *        --image public/learn-ai-with-reeturaj/harness-engineering.png
 *      (--image and --url are optional. The caption is also copied to the clipboard
 *       as a fallback so you can Ctrl+V if auto-type misses.)
 *   3) First run: a visible Chromium opens, the script types your email/password and
 *      submits. If LinkedIn shows 2FA / "verify it's you" / a CAPTCHA, the Playwright
 *      Inspector pauses — complete the challenge in the browser window, then click
 *      Resume in the Inspector. The session is saved to the persistent profile, so
 *      later runs skip the login entirely.
 *   4) The composer opens with the caption (+ image if given). Review it in the
 *      browser, then click Post yourself. Press Enter in this terminal to close the
 *      browser when done.
 *
 * Selectors are intentionally ARIA/role-based (LinkedIn rotates CSS classes), and
 * every step falls back to page.pause() on failure so you can finish it by hand —
 * nothing throws you out of the loop.
 */
// chromium comes from @playwright/test (already a devDependency) rather than the
// bare "playwright" package, which was imported here but never declared — it only
// resolved as a transitive install, so a clean npm ci could break this script.
import { chromium, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── arg parsing ───────────────────────────────────────────────────────────
function parseArgs(): { caption: string; url: string | null; image: string | null } {
  const a = process.argv.slice(2);
  const get = (k: string): string | null => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : null;
  };
  const caption = get("caption");
  if (!caption) {
    console.error("Usage: npx tsx scripts/linkedin-populate.ts --caption \"...\" [--url URL] [--image PATH]");
    process.exit(2);
  }
  return { caption, url: get("url"), image: get("image") };
}

// ─── load .env.local (gitignored) — never log the password ─────────────────
function loadEnvLocal(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !m[1].startsWith("#")) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* no .env.local — fall back to process.env */
  }
  return env;
}

async function ensureLoggedIn(page: Page, email: string, password: string): Promise<void> {
  // If the session cookie from the persistent profile is still valid, /feed loads
  // without a sign-in wall. Detect that before touching the login form.
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const signInVisible = await page.locator('input[name="session_key"]').first().isVisible().catch(() => false);
  if (!signInVisible) {
    console.log("[linkedin] session still valid — skipping login.");
    return;
  }
  console.log("[linkedin] logging in (one-time; session will persist)...");
  await page.fill('input[name="session_key"]', email);
  await page.fill('input[name="session_password"]', password);
  await page.click('button[type="submit"]');

  // After submit, one of three things happens: the feed loads (success), a 2FA /
  // challenge appears, or a "verify it's you" wall shows. Wait for the feed OR for a
  // challenge, and pause for the human if it's the latter.
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
  const stillOnLogin = await page.locator('input[name="session_key"]').first().isVisible().catch(() => false);
  const feedLoaded = await page.locator('div[role="main"], div.feed-shared-update-v2').first().isVisible().catch(() => false);
  if (stillOnLogin && !feedLoaded) {
    console.log("\n[linkedin] a login challenge (2FA / CAPTCHA / verify-it's-you) appeared.\n"
      + "            Complete it in the browser window, then click ▶ Resume in the\n"
      + "            Playwright Inspector. The persistent profile will remember the session.");
    await page.pause();
  }
}

async function openComposer(page: Page): Promise<void> {
  // The ?share=true query opens the "Create a post" dialog on the feed directly.
  await page.goto("https://www.linkedin.com/feed/?share=true", { waitUntil: "domcontentloaded", timeout: 60000 });
  // If the dialog didn't auto-open (LinkedIn sometimes ignores ?share=true for
  // logged-in sessions), click the "Start a post" button explicitly.
  const composerEditor = page.locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]').first();
  if (!(await composerEditor.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Start a post|Create a post/i }).first().click({ timeout: 10000 }).catch(() => undefined);
  }
  await composerEditor.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
}

async function fillCaption(page: Page, caption: string, url: string | null): Promise<void> {
  const editor = page.locator('div[role="dialog"] div[role="textbox"][contenteditable="true"]').first();
  if (!(await editor.isVisible().catch(() => false))) {
    console.log("[linkedin] composer editor not found — pausing so you can open it by hand.");
    await page.pause();
    return;
  }
  await editor.click();
  const full = url ? `${caption}\n\n${url}` : caption;
  // Type char-by-char: LinkedIn's contenteditable ignores bulk fill() (it strips it).
  await page.keyboard.type(full, { delay: 8 });
  console.log("[linkedin] caption typed into composer.");
}

async function attachImage(page: Page, imagePath: string): Promise<void> {
  // LinkedIn's "Add photo" opens a hidden <input type=file>. Click the media button
  // first so the input mounts, then setInputFiles on it directly (most reliable).
  const addPhoto = page.getByRole("button", { name: /Add photo|Add media|Add image/i }).first();
  if (!(await addPhoto.isVisible().catch(() => false))) {
    // Fallback: some surfaces expose it as a clickable icon button inside the dialog.
    const iconBtn = page.locator('div[role="dialog"] button:has(svg)').filter({ hasText: /photo|media|image/i }).first();
    if (!(await iconBtn.isVisible().catch(() => false))) {
      console.log(`[linkedin] could not find the "Add photo" button — pausing so you can\n            attach ${imagePath} by hand (drag-drop the file into the dialog).`);
      await page.pause();
      return;
    }
    await iconBtn.click({ timeout: 10000 }).catch(() => undefined);
  } else {
    await addPhoto.click({ timeout: 10000 });
  }
  const fileInput = page.locator('input[type="file"][accept*="image" i]').first();
  try {
    await fileInput.waitFor({ state: "attached", timeout: 10000 });
    await fileInput.setInputFiles(imagePath);
    console.log(`[linkedin] attached image: ${imagePath}`);
  } catch {
    console.log(`[linkedin] file input not found after clicking Add photo — pausing so you\n            can attach ${imagePath} by hand.`);
    await page.pause();
  }
}

async function main() {
  const { caption, url, image } = parseArgs();
  const env = loadEnvLocal();
  const email = env.LINKEDIN_EMAIL;
  const password = env.LINKEDIN_PASSWORD;
  if (!email || !password) {
    console.error("ABORT: LINKEDIN_EMAIL / LINKEDIN_PASSWORD not set. Put them in .env.local (gitignored):\n"
      + "  LINKEDIN_EMAIL=...\n  LINKEDIN_PASSWORD=...");
    process.exit(2);
  }

  // Copy caption to clipboard as a manual-paste fallback (Windows).
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Value ${JSON.stringify(caption)}`], { stdio: "ignore" });
    console.log("[linkedin] caption copied to clipboard (fallback: Ctrl+V into the composer).");
  } catch {
    /* clipboard is a convenience, not a requirement */
  }

  const profileDir = join(homedir(), ".inbharat-linkedin");
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false, // RAIL 3 helper: the founder always sees what happens.
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  // Best-effort anti-detection: clear the webdriver flag. Not a guarantee — see the
  // risk warning at the top. LinkedIn's detection is heuristic and changes.
  await browser.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = browser.pages()[0] ?? (await browser.newPage());

  try {
    await ensureLoggedIn(page, email, password);
    await openComposer(page);
    await fillCaption(page, caption, url);
    if (image) await attachImage(page, image);

    console.log("\n[linkedin] ✅ Done. Caption" + (image ? " + image" : "") + " populated in the composer.\n"
      + "            REVIEW IT IN THE BROWSER, then click Post yourself (this script never posts).\n"
      + "            Press Enter here to close the browser.");
    // Block until the founder is done reviewing — keeps the browser open.
    process.stdin.resume();
    await new Promise<void>((resolve) => process.stdin.once("data", resolve));
  } catch (e) {
    console.error("[linkedin] unexpected error:", (e as Error).message);
    console.error("            pausing so you can finish by hand in the open browser.");
    await page.pause().catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

await main();