/**
 * "Build AI with Reeturaj" article system — Playwright coverage.
 *
 * Covers the hub article explorer (≥12 cards, search + category filters) and a
 * full article read (hero image loads, ReactMarkdown body renders, FAQ visible,
 * related-article navigation works, no uncaught errors). Mirrors the GA-firing
 * guard: the gtag page_view assertion only runs when PLAYWRIGHT_GA_ID is set.
 *
 * Run against vercel dev (npm run dev → :3001):
 *   npx playwright test e2e/article-page.spec.ts
 * With GA verification:
 *   CI=1 PLAYWRIGHT_GA_ID=G-XXXX npx playwright test e2e/article-page.spec.ts
 */
import { test, expect } from "@playwright/test";

const GA_ID = process.env.PLAYWRIGHT_GA_ID;

test("hub shows ≥12 article cards and search filters them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/learn-ai-with-reeturaj");
  await expect(page.getByRole("heading", { name: /Practical AI articles, built for Bharat/i })).toBeVisible();

  // The ArticleExplorer renders one <article> card per flagship article (12 in Phase 1).
  const cards = page.locator("section article, div article").filter({ has: page.locator("a[href^='/learn-ai-with-reeturaj/']") });
  await expect(cards.first()).toBeVisible();
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThanOrEqual(12);

  // Search filters the grid down to a subset.
  const search = page.getByLabel("Search articles");
  await search.fill("RAG");
  await expect(page.getByText(/article.*matching/i)).toBeVisible();
  const ragCount = await cards.count();
  expect(ragCount).toBeGreaterThanOrEqual(1);
  expect(ragCount).toBeLessThan(initialCount);

  // Clearing the search restores the full grid.
  await search.fill("");
  await expect(cards.nth(11)).toBeVisible();
  expect(await cards.count()).toBe(initialCount);

  expect(errors).toEqual([]);
});

test("category chip filters to a single category", async ({ page }) => {
  await page.goto("/learn-ai-with-reeturaj");
  const cards = page.locator("article").filter({ has: page.locator("a[href^='/learn-ai-with-reeturaj/']") });
  await expect(cards.first()).toBeVisible();
  const all = await cards.count();

  // "Security" should be a category chip with its own articles (devsecops + supply-chain-security).
  await page.getByRole("button", { name: /^Security$/ }).click();
  await expect(page.getByText(/articles in Security/i)).toBeVisible();
  const securityCount = await cards.count();
  expect(securityCount).toBeGreaterThanOrEqual(1);
  expect(securityCount).toBeLessThan(all);
});

test("article page renders body, hero, FAQ, and related links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const response = await page.goto("/learn-ai-with-reeturaj/rag", { waitUntil: "load" });
  expect(response?.status()).toBe(200);

  // H1 = article title; the direct-answer "In short" callout renders the abstract.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/RAG/i);
  await expect(page.getByText(/In short/i)).toBeVisible();

  // Hero image actually loads (naturalWidth > 0), not a broken/zero-size img.
  const hero = page.locator("article img").first();
  await expect(hero).toBeVisible();
  const naturalWidth = await hero.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);

  // ReactMarkdown body ACTUALLY rendered (not just the baked shell): assert a
  // body-only H2 that exists only in the markdown body, not in meta/title/abstract.
  // The baked shell's copy is aria-hidden, so getByRole excludes it — this match
  // proves React mounted and rendered the markdown. Also confirm the loading /
  // unavailable fallbacks are gone.
  await expect(page.getByRole("heading", { name: "How RAG Works Under the Hood", exact: true })).toBeVisible();
  await expect(page.getByText(/Loading article|content is unavailable/i)).toHaveCount(0);

  // ReactMarkdown body rendered: the FAQ section is present with at least one <details>.
  await expect(page.getByRole("heading", { name: /Frequently asked questions/i })).toBeVisible();
  const faqItems = page.locator("details");
  await expect(faqItems.first()).toBeVisible();
  expect(await faqItems.count()).toBeGreaterThanOrEqual(3);

  // Related-articles grid ("Keep learning") links to other article routes.
  // The trailing-slash prefix excludes the hub nav link (/learn-ai-with-reeturaj)
  // and the "All articles" button, matching only per-slug article cards.
  const related = page.locator('a[href^="/learn-ai-with-reeturaj/"]').filter({ has: page.locator("img") });
  const relatedHrefs = await related.evaluateAll((els) =>
    els
      .map((el) => (el as HTMLAnchorElement).getAttribute("href"))
      .filter((h): h is string => !!h && /^\/learn-ai-with-reeturaj\/[a-z0-9-]+$/.test(h)),
  );
  expect(relatedHrefs.length).toBeGreaterThanOrEqual(1);

  // Clicking a related card navigates to another article route without errors.
  await related.first().click();
  await expect(page).toHaveURL(/\/learn-ai-with-reeturaj\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});

test("article hub card opens the correct article", async ({ page }) => {
  await page.goto("/learn-ai-with-reeturaj");
  // Click the exact RAG route; several other article titles also mention RAG.
  await page.locator('article a[href="/learn-ai-with-reeturaj/rag"]').first().click();
  await expect(page).toHaveURL(/\/learn-ai-with-reeturaj\/rag$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/RAG/i);
});

// GA4 page_view fires on article routes — only when GA is configured (skip otherwise).
test("gtag fires a page_view on the article route", async ({ page }) => {
  test.skip(!GA_ID, "PLAYWRIGHT_GA_ID not set — article GA verification skipped");
  await page.goto("/learn-ai-with-reeturaj/rag");
  await expect(
    page.locator(`script[src*="googletagmanager.com/gtag/js?id=${GA_ID}"]`),
  ).toBeAttached({ timeout: 10000 });
  const pageViews = await page.evaluate(() => {
    const dl = (window as any).dataLayer || [];
    return dl.filter(
      (e: any) => e && typeof e.length === "number" && e[0] === "event" && e[1] === "page_view",
    ).length;
  });
  expect(pageViews).toBeGreaterThanOrEqual(1);
});