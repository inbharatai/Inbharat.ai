/**
 * scripts/syndicate-populate.ts — LOCAL-ONLY Playwright auto-fill for DEV.to,
 * Hashnode, and Medium article cross-posting. The "just like LinkedIn" path the
 * founder asked for: opens the platform's editor in a real browser, pre-fills the
 * title + body + tags + canonical URL from the PUBLISHED article manifest, then
 * STOPS — the founder reviews and clicks Publish themselves. No API keys.
 *
 * ⚠️  RISK WARNING — read before running. ⚠️
 * Each platform's ToS may restrict driving its UI with automation. Like
 * scripts/linkedin-populate.ts, this is the higher-friction, higher-risk
 * alternative the founder asked for, run on the founder's OWN accounts, on the
 * founder's OWN machine, at the founder's OWN risk. The deployed Growth Agent
 * deliberately does NOT do this (Vercel serverless has no browser runtime
 * anyway). Never imported by the app or any API route. Run by hand.
 *
 * THREE HARD SAFETY RAILS (not optional, identical to linkedin-populate.ts):
 *   1. LOCAL ONLY — never imported by the Vercel-deployed agent. Never wired
 *      into an API route. Run by hand from the repo root.
 *   2. CREDENTIALS LOCAL — optional <PLATFORM>_EMAIL / <PLATFORM>_PASSWORD read
 *      from .env.local (gitignored). They are NEVER committed, NEVER sent to any
 *      server, NEVER logged. A persistent browser profile (~/.inbharat-syndicate-<platform>)
 *      keeps the session cookie after the first login, so the password is used
 *      ONCE — and only if you opt in. If the env vars are absent, the script
 *      pauses on the login page so you can sign in by any method (Google/GitHub/
 *      magic link) the FIRST time; the profile then remembers the session.
 *   3. HUMAN GATE — NEVER clicks "Publish"/"Post". It fills the editor and stops,
 *      leaving the browser open for the founder to review + publish.
 *
 * Usage (run from repo root, after `npm i`):
 *   npx tsx scripts/syndicate-populate.ts --platform devto --slug <article-slug>
 *   npx tsx scripts/syndicate-populate.ts --platform hashnode --slug <article-slug>
 *   npx tsx scripts/syndicate-populate.ts --platform medium --slug <article-slug>            (import mode — default)
 *   npx tsx scripts/syndicate-populate.ts --platform medium --slug <article-slug> --mode story (story composer — paste body)
 *
 *   Optional:
 *     --mode story|import  Medium only: `story` pastes the body into /new-story + sets
 *                          the canonical via the ⋯ menu; `import` (default) pastes the
 *                          canonical URL into /p/import and clicks Import (Medium
 *                          scrapes the live inbharat.ai article). Ignored for devto/hashnode.
 *     --file <path>     override the body markdown source (default: content/articles/<slug>.md)
 *     --title "..."     override the title (default: the manifest title for the slug)
 *     --canonical <url> override the canonical URL (default: https://www.inbharat.ai/learn-ai-with-reeturaj/<slug>)
 *
 * What it fills:
 *   - DEV.to   → /new: title, body markdown (pasted), up to 4 tags, canonical URL (More menu).
 *   - Hashnode → /new: title, body markdown (pasted), tags, canonical URL (More options).
 *   - Medium   → /p/import: pastes the canonical URL and clicks Import (Medium scrapes the
 *                LIVE inbharat.ai article + auto-sets the canonical to the source URL). The
 *                article MUST already be live on inbharat.ai for Medium's importer to fetch it.
 *
 * The article body is ALSO copied to the clipboard so you can Ctrl+V if a paste misses.
 * Press Enter in this terminal to close the browser when you are done reviewing.
 *
 * Selectors are ARIA/role-based where possible (platforms rotate CSS classes); every step
 * falls back to page.pause() on failure so you can finish it by hand — nothing throws you
 * out of the loop. This script NEVER publishes; it only pre-fills.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ARTICLES } from "../content/articles.meta.js";
import { articlePath } from "../content/articles.meta.js";
import { SITE } from "../seo.config.js";

// ─── arg parsing ─────────────────────────────────────────────────────────────
type Platform = "devto" | "hashnode" | "medium";
type MediumMode = "story" | "import";

function parseArgs(): { platform: Platform; slug: string; file: string | null; title: string | null; canonical: string | null; mode: MediumMode } {
  const a = process.argv.slice(2);
  const get = (k: string): string | null => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : null;
  };
  const platform = get("platform") as Platform | null;
  const slug = get("slug");
  if (!platform || !["devto", "hashnode", "medium"].includes(platform)) {
    console.error('Usage: npx tsx scripts/syndicate-populate.ts --platform <devto|hashnode|medium> --slug <article-slug>');
    process.exit(2);
  }
  if (!slug) {
    console.error("ABORT: --slug is required (the published article slug, e.g. evals-for-ai-features-measuring-what-actually-ships).");
    process.exit(2);
  }
  const modeRaw = get("mode");
  const mode: MediumMode = modeRaw === "story" || modeRaw === "import" ? modeRaw : "import";
  if (modeRaw && modeRaw !== "story" && modeRaw !== "import") {
    console.error(`ABORT: --mode must be "story" or "import" (got "${modeRaw}"); only meaningful for medium.`);
    process.exit(2);
  }
  return { platform, slug, file: get("file"), title: get("title"), canonical: get("canonical"), mode };
}

// ─── load .env.local (gitignored) — never log passwords ─────────────────────
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

// ─── article resolution: title + hashtags from manifest, body from the .md ───
interface ArticleContent {
  title: string;
  bodyMarkdown: string;
  hashtags: string[];
  canonicalUrl: string;
}

function resolveArticle(args: { slug: string; file: string | null; title: string | null; canonical: string | null }): ArticleContent {
  const meta = ARTICLES.find((x) => x.slug === args.slug);
  const title = (args.title ?? meta?.title ?? "Untitled article").trim();
  const hashtags = meta?.hashtags ?? [];
  const canonicalUrl = (args.canonical ?? `${SITE.url}${articlePath(args.slug)}`).trim();

  const file = args.file ?? join(process.cwd(), "content", "articles", `${args.slug}.md`);
  if (!existsSync(file)) {
    console.error(`ABORT: article body not found at ${file}.\n` +
      `Pass --file <path> to point at a markdown file, or publish the article on inbharat first.`);
    process.exit(2);
  }
  const bodyMarkdown = readFileSync(file, "utf8").trim();
  if (!bodyMarkdown) {
    console.error(`ABORT: article body is empty (${file}).`);
    process.exit(2);
  }
  return { title, bodyMarkdown, hashtags, canonicalUrl };
}

// Copy text to the OS clipboard as a manual-paste fallback. Cross-platform:
// pbcopy on macOS, xclip/wl-copy on Linux, PowerShell Set-Clipboard on Windows.
// Best-effort — the clipboard is a convenience, not a requirement (the script
// also types/pastes directly). Without these branches the fallback silently
// no-op'd on Mac/Linux, leaving the founder with nothing to Ctrl+V.
async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    const { execFileSync } = await import("node:child_process");
    if (process.platform === "darwin") {
      execFileSync("pbcopy", { input: text, stdio: ["pipe", "ignore", "ignore"] });
    } else if (process.platform === "win32") {
      execFileSync("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Value ${JSON.stringify(text)}`], { stdio: "ignore" });
    } else {
      // Linux: try xclip first, then wl-copy (Wayland). The clip helper is a
      // fallback — if neither is installed, typeText/pasteClipboard still work.
      try {
        execFileSync("xclip", ["-selection", "clipboard"], { input: text, stdio: ["pipe", "ignore", "ignore"] });
      } catch {
        execFileSync("wl-copy", { input: text, stdio: ["pipe", "ignore", "ignore"] });
      }
    }
    console.log(`[${label}] copied to clipboard (fallback: paste into the editor).`);
  } catch {
    /* clipboard is a convenience, not a requirement */
  }
}

// Type text into the focused element char-by-char (contenteditable editors that
// strip bulk fill()). Used as a fallback after paste.
async function typeText(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text, { delay: 4 });
}

// Paste from the clipboard into the currently-focused element (most reliable way
// to drop a large markdown body into a rich-text editor — it survives the
// platform's input sanitization better than fill() / setInputFiles). On macOS
// the paste shortcut is Cmd+V (Playwright Meta+V) — Control+Shift+V is
// "paste and match style" and silently fails in most editors, so the body never
// landed on Mac. Fixed to Meta+V.
async function pasteClipboard(page: Page): Promise<void> {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+V" : "Control+V");
}

// ─── login: best-effort email/password, else pause for manual one-time sign-in ─
async function ensureLoggedIn(
  page: Page,
  ctx: { platform: Platform; editorUrl: string; emailEnv: string; passwordEnv: string; loginHints: string[] },
  env: Record<string, string | undefined>,
  mode: MediumMode = "import",
): Promise<void> {
  await page.goto(ctx.editorUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  // If the editor's title field is present, we are already signed in (session
  // from the persistent profile is still valid) → nothing to do.
  if (await editorReady(page, ctx.platform, mode)) {
    console.log(`[${ctx.platform}] session still valid — skipping login.`);
    return;
  }

  const email = env[ctx.emailEnv];
  const password = env[ctx.passwordEnv];
  if (email && password) {
    console.log(`[${ctx.platform}] attempting email/password login (one-time; session will persist)…`);
    // Look for a standard email + password form. If the platform uses a social/
    // magic-link-only flow, this selector misses → fall through to the manual pause.
    const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
    const pwInput = page.locator('input[type="password"]').first();
    if ((await emailInput.isVisible().catch(() => false)) && (await pwInput.isVisible().catch(() => false))) {
      await emailInput.fill(email).catch(() => undefined);
      await pwInput.fill(password).catch(() => undefined);
      await pwInput.press("Enter").catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
      if (await editorReady(page, ctx.platform, mode)) {
        console.log(`[${ctx.platform}] login succeeded.`);
        return;
      }
      console.log(`[${ctx.platform}] a login challenge (2FA / CAPTCHA / verify-it's-you) appeared.`);
    } else {
      console.log(`[${ctx.platform}] no email/password form on this surface (social/magic-link login).`);
    }
  }

  console.log(
    `\n[${ctx.platform}] NOT logged in. Sign in by hand in the browser window (use whichever method you\n` +
    `            normally use${ctx.loginHints.length ? ` — ${ctx.loginHints.join(" / ")}` : ""}).\n` +
    `            Then click ▶ Resume in the Playwright Inspector. The persistent profile\n` +
    `            (~/.inbharat-syndicate-${ctx.platform}) will remember the session, so this is ONCE.`,
  );
  await page.pause();
  // After the human signs in, navigate back to the editor if needed.
  if (!(await editorReady(page, ctx.platform, mode))) {
    await page.goto(ctx.editorUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
}

// Heuristic: is the platform's editor title field visible? (Used as "logged in" signal.)
async function editorReady(page: Page, platform: Platform, mode: MediumMode = "import"): Promise<boolean> {
  try {
    if (platform === "devto") return await page.locator('input[name="title"], textarea[name="title"]').first().isVisible({ timeout: 4000 });
    if (platform === "hashnode") return await page.locator('textarea[placeholder*="title" i], input[placeholder*="title" i], h1[contenteditable="true"]').first().isVisible({ timeout: 4000 });
    if (platform === "medium") {
      // story mode → /new-story editor with an editable title h1; import mode → /p/import URL input.
      if (mode === "story") return await page.locator('h1[contenteditable="true"]').first().isVisible({ timeout: 4000 });
      return await page.locator('input[type="url"], input[placeholder*="url" i], h1[contenteditable="true"]').first().isVisible({ timeout: 4000 });
    }
  } catch {
    /* fall through */
  }
  return false;
}

// ─── DEV.to fill ──────────────────────────────────────────────────────────────
async function fillDevto(page: Page, art: ArticleContent): Promise<void> {
  // Title.
  const title = page.locator('input[name="title"], textarea[name="title"]').first();
  if (await title.isVisible({ timeout: 10000 }).catch(() => false)) {
    await title.fill(art.title);
    console.log("[devto] title filled.");
  } else {
    console.log("[devto] title field not found — pausing so you can title it by hand.");
    await page.pause();
  }

  // Body: DEV.to's body editor is a markdown editor. Focus it, then paste the body
  // (already on the clipboard). Fall back to typing if paste yields nothing.
  const body = page.locator('textarea[name="body_markdown"], div[contenteditable="true"][role="textbox"], .cm-content').first();
  if (await body.isVisible({ timeout: 10000 }).catch(() => false)) {
    await body.click();
    await pasteClipboard(page);
    console.log("[devto] body pasted.");
  } else {
    console.log("[devto] body editor not found — pausing so you can paste the body by hand (it is on the clipboard).");
    await page.pause();
  }

  // Tags: up to 4 (DEV.to cap). Type each + Enter.
  if (art.hashtags.length > 0) {
    const tagInput = page.locator('input[placeholder*="tag" i], input[name="tags"], input[aria-label*="tag" i]').first();
    if (await tagInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (const tag of art.hashtags.slice(0, 4)) {
        await tagInput.fill(tag.replace(/^#/, ""));
        await tagInput.press("Enter");
      }
      console.log(`[devto] ${Math.min(art.hashtags.length, 4)} tags added.`);
    } else {
      console.log("[devto] tag input not found — add tags by hand (see manifest hashtags).");
    }
  }

  // Canonical URL: under the "More" menu. Best-effort — print a reminder on miss.
  await setDevtoCanonical(page, art.canonicalUrl);
}

async function setDevtoCanonical(page: Page, canonicalUrl: string): Promise<void> {
  // Open the "More" / options menu.
  const more = page.getByRole("button", { name: /More|Options|Settings/i }).first();
  if (await more.isVisible({ timeout: 4000 }).catch(() => false)) {
    await more.click({ timeout: 5000 }).catch(() => undefined);
  }
  const canonical = page.locator('input[name="canonical_url"], input[placeholder*="canonical" i], input[aria-label*="canonical" i]').first();
  if (await canonical.isVisible({ timeout: 5000 }).catch(() => false)) {
    await canonical.fill(canonicalUrl);
    console.log("[devto] canonical URL set.");
  } else {
    console.log(`[devto] canonical input not found — set it by hand in the More menu: ${canonicalUrl}`);
  }
}

// ─── Hashnode fill ─────────────────────────────────────────────────────────────
async function fillHashnode(page: Page, art: ArticleContent): Promise<void> {
  // Title.
  const title = page.locator('textarea[placeholder*="title" i], input[placeholder*="title" i], h1[contenteditable="true"]').first();
  if (await title.isVisible({ timeout: 10000 }).catch(() => false)) {
    await title.click().catch(() => undefined);
    await typeText(page, art.title);
    console.log("[hashnode] title filled.");
  } else {
    console.log("[hashnode] title field not found — pausing so you can title it by hand.");
    await page.pause();
  }

  // Body: Hashnode's editor accepts markdown paste (it converts on paste). Focus
  // the body region and paste.
  const body = page.locator('div[contenteditable="true"][role="textbox"], .editor-content[contenteditable="true"], div.ProseMirror').first();
  if (await body.isVisible({ timeout: 10000 }).catch(() => false)) {
    await body.click();
    await pasteClipboard(page);
    console.log("[hashnode] body pasted.");
  } else {
    console.log("[hashnode] body editor not found — pausing so you can paste the body by hand (it is on the clipboard).");
    await page.pause();
  }

  // Tags.
  if (art.hashtags.length > 0) {
    const tagInput = page.locator('input[placeholder*="tag" i], input[placeholder*="add a tag" i]').first();
    if (await tagInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (const tag of art.hashtags.slice(0, 5)) {
        await tagInput.fill(tag.replace(/^#/, ""));
        await tagInput.press("Enter");
      }
      console.log(`[hashnode] ${Math.min(art.hashtags.length, 5)} tags added.`);
    } else {
      console.log("[hashnode] tag input not found — add tags by hand.");
    }
  }

  // Canonical URL: under "More options". Best-effort.
  const more = page.getByRole("button", { name: /More options|More|Options/i }).first();
  if (await more.isVisible({ timeout: 4000 }).catch(() => false)) {
    await more.click({ timeout: 5000 }).catch(() => undefined);
  }
  const canonical = page.locator('input[placeholder*="canonical" i], input[name="canonicalUrl"], input[aria-label*="canonical" i]').first();
  if (await canonical.isVisible({ timeout: 5000 }).catch(() => false)) {
    await canonical.fill(canonicalUrl);
    console.log("[hashnode] canonical URL set.");
  } else {
    console.log(`[hashnode] canonical input not found — set it by hand in More options: ${canonicalUrl}`);
  }
}

// ─── Medium fill (import the LIVE inbharat article) ────────────────────────────
async function fillMedium(page: Page, art: ArticleContent): Promise<void> {
  // Medium's API is deprecated; the import tool scrapes the LIVE article from the
  // canonical URL and auto-sets the canonical to the source. So we paste the URL
  // and click Import. Requires the article to be live on inbharat.ai.
  const urlInput = page.locator('input[type="url"], input[placeholder*="url" i], input[name="url"]').first();
  if (await urlInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await urlInput.fill(art.canonicalUrl);
    console.log(`[medium] canonical URL pasted into importer: ${art.canonicalUrl}`);
    const importBtn = page.getByRole("button", { name: /Import/i }).first();
    if (await importBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importBtn.click({ timeout: 5000 });
      console.log("[medium] Import clicked — Medium is fetching + rendering the live inbharat article.");
    } else {
      console.log("[medium] Import button not found — click Import by hand (the URL is filled in).");
    }
  } else {
    console.log("[medium] import URL field not found — pausing so you can paste the canonical by hand (it is on the clipboard).");
    await page.pause();
  }
  console.log(
    `[medium] NOTE: Medium's importer auto-sets the canonical link to ${art.canonicalUrl}\n` +
    `           (Edit story → ⋯ menu → Customize canonical link to verify). Review + publish by hand.`,
  );
}

// ─── Medium fill (story composer — paste the body markdown) ──────────────────
// The alternative to the importer: open /new-story, type the title, paste the body
// (Medium converts markdown on paste), and set the canonical via the ⋯ menu so
// Google attributes the original to www.inbharat.ai. Use when the article is NOT
// yet live on inbharat.ai (the importer needs a live URL) or when you want full
// control of the rendered body. Stops before Publish (RAIL 3).
async function fillMediumStory(page: Page, art: ArticleContent): Promise<void> {
  // Title — Medium's new-story title is a contenteditable h1.
  const title = page.locator('h1[contenteditable="true"]').first();
  if (await title.isVisible({ timeout: 15000 }).catch(() => false)) {
    await title.click();
    await typeText(page, art.title);
    console.log("[medium:story] title filled.");
  } else {
    console.log("[medium:story] title h1 not found — pausing so you can title it by hand.");
    await page.pause();
  }

  // Body — Medium's story body is a contenteditable section. Focus it and paste
  // (the body is already on the clipboard). Medium converts markdown on paste.
  const body = page.locator('section[contenteditable="true"], div[contenteditable="true"]').first();
  if (await body.isVisible({ timeout: 10000 }).catch(() => false)) {
    await body.click();
    await pasteClipboard(page);
    console.log("[medium:story] body pasted.");
  } else {
    console.log("[medium:story] body editor not found — pausing so you can paste by hand (it is on the clipboard).");
    await page.pause();
  }

  // Canonical — three-dot (⋯) story settings menu → "Customize canonical link"
  // → paste. Best-effort; print a reminder on miss.
  await setMediumStoryCanonical(page, art.canonicalUrl);
  console.log(
    `[medium:story] NOTE: canonical should be ${art.canonicalUrl}\n` +
    `           (⋯ menu → Customize canonical link to verify). Review + publish by hand.`,
  );
}

async function setMediumStoryCanonical(page: Page, canonicalUrl: string): Promise<void> {
  // Open the three-dot (⋯) story settings menu. Medium rotates the aria label, so
  // try a few names; every step falls back to a reminder so the founder can do it
  // by hand.
  const dots = page.getByRole("button", { name: /⋯|More|Settings|Edit story/i }).first();
  if (await dots.isVisible({ timeout: 4000 }).catch(() => false)) {
    await dots.click({ timeout: 5000 }).catch(() => undefined);
  }
  const customCanonical = page.getByText(/Customize canonical link/i).first();
  if (await customCanonical.isVisible({ timeout: 4000 }).catch(() => false)) {
    await customCanonical.click({ timeout: 5000 }).catch(() => undefined);
  }
  const canonical = page.locator('input[placeholder*="canonical" i], input[name*="canonical" i], input[type="url"]').first();
  if (await canonical.isVisible({ timeout: 5000 }).catch(() => false)) {
    await canonical.fill(canonicalUrl);
    console.log(`[medium:story] canonical URL set: ${canonicalUrl}`);
  } else {
    console.log(`[medium:story] canonical input not found — set it by hand via ⋯ → Customize canonical link: ${canonicalUrl}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  const env = loadEnvLocal();
  const art = resolveArticle(args);

  // Put the body on the clipboard FIRST so any paste fallback works on every platform.
  await copyToClipboard(art.bodyMarkdown, args.platform);

  const profileDir = join(homedir(), `.inbharat-syndicate-${args.platform}`);
  const browser: BrowserContext = await chromium.launchPersistentContext(profileDir, {
    headless: false, // RAIL 3 helper: the founder always sees what happens.
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  // Best-effort anti-detection (same caveat as linkedin-populate: heuristic, no guarantee).
  await browser.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const editorUrls: Record<Platform, string> = {
    devto: "https://dev.to/new",
    hashnode: "https://hashnode.com/new",
    medium: args.mode === "story" ? "https://medium.com/new-story" : "https://medium.com/p/import",
  };
  const loginCtx = {
    platform: args.platform,
    editorUrl: editorUrls[args.platform],
    emailEnv: `${args.platform.toUpperCase()}_EMAIL`,
    passwordEnv: `${args.platform.toUpperCase()}_PASSWORD`,
    loginHints: args.platform === "devto" ? ["email/password", "GitHub", "Twitter"]
      : args.platform === "hashnode" ? ["email magic link", "GitHub", "Google"]
        : ["email", "Google", "Apple"],
  };

  const page = browser.pages()[0] ?? (await browser.newPage());

  try {
    await ensureLoggedIn(page, loginCtx, env, args.mode);
    if (args.platform === "devto") await fillDevto(page, art);
    else if (args.platform === "hashnode") await fillHashnode(page, art);
    else if (args.platform === "medium" && args.mode === "story") await fillMediumStory(page, art);
    else await fillMedium(page, art);

    console.log(
      `\n[${args.platform}] ✅ Done. Editor pre-filled with "${art.title}" (canonical ${art.canonicalUrl}).\n` +
      `            REVIEW IT IN THE BROWSER, then click Publish yourself (this script never publishes).\n` +
      `            Press Enter here to close the browser.`,
    );
    // Block until the founder is done reviewing — keeps the browser open.
    process.stdin.resume();
    await new Promise<void>((resolve) => process.stdin.once("data", resolve));
  } catch (e) {
    console.error(`[${args.platform}] unexpected error:`, (e as Error).message);
    console.error("            pausing so you can finish by hand in the open browser.");
    await page.pause().catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

await main();