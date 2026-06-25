import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * InBharat Growth Agent — admin dashboard e2e.
 *
 * The dashboard pages call /api/growth/* (whoami, usage, budget, insights,
 * cron/daily). Vite preview has no API server, so every endpoint is mocked via
 * page.route to simulate the Vercel backend. This proves:
 *   - /admin/growth + /admin/growth/usage return 200 (the 404 is fixed). The
 *     admin shell itself is noindex (verified in scripts/verify-shell-crawl.ts);
 *     here we also confirm AdminGrowthLayout forces noindex at runtime.
 *   - the server-verified gate shows "Sign in required" on 401 and renders the
 *     dashboard on 200.
 *   - the Usage page renders the spend/cap header, the provider split (Gemini /
 *     OpenAI), and the where-used table.
 *   - the budget editor PATCHes the cap and the UI reflects the new value.
 *   - the Overview "Run daily audit now" button triggers the cron and shows the
 *     per-domain result.
 */

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const WHOAMI_ADMIN = {
  ok: true,
  requestId: "t",
  admin: true,
  userId: "00000000-0000-0000-0000-000000000000",
  email: "reetu004@gmail.com",
};

const USAGE_BODY = {
  ok: true,
  requestId: "t",
  configured: true,
  windowDays: 30,
  totals: { calls: 42, promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.12, providers: 2, models: 2 },
  byProvider: [
    { key: "gemini", calls: 30, tokens: 1000, costUsd: 0.08, pctSpend: 66.7 },
    { key: "openai", calls: 12, tokens: 500, costUsd: 0.04, pctSpend: 33.3 },
  ],
  byModel: [
    { key: "gemini-flash-latest", calls: 30, tokens: 1000, costUsd: 0.08, provider: "gemini", pctSpend: 66.7 },
    { key: "gpt-4.1-mini", calls: 12, tokens: 500, costUsd: 0.04, provider: "openai", pctSpend: 33.3 },
  ],
  byTask: [{ key: "draft", calls: 42, tokens: 1500, costUsd: 0.12, pctSpend: 100 }],
  byArticle: [{ key: "https://inbharat.ai/learn-ai-with-reeturaj/rag", calls: 42, tokens: 1500, costUsd: 0.12, pctSpend: 100 }],
  byDay: [{ day: "2026-06-25", calls: 42, tokens: 1500, costUsd: 0.12 }],
  recent: [
    { model: "gemini-flash-latest", provider: "gemini", task: "draft", contextUrl: "https://inbharat.ai/learn-ai-with-reeturaj/rag", totalTokens: 1500, costUsd: 0.12, status: "ok", createdAt: "2026-06-25T06:17:00.000Z" },
  ],
  month: { spentUsd: 0.12, capUsd: 20, projectedUsd: 0.4, remainingUsd: 19.88, source: "db" },
};

const BUDGET_GET = { ok: true, requestId: "t", spentUsd: 0.12, capUsd: 20, projectedUsd: 0.4, remainingUsd: 19.88, source: "db" };

const INSIGHTS_BODY = {
  ok: true,
  requestId: "t",
  configured: true,
  lastCronRun: { domain: "inbharat.ai", status: "completed", pages: 25, startedAt: "2026-06-25T06:17:00.000Z", finishedAt: "2026-06-25T06:18:00.000Z", error: null },
  counts: { pages: 25, openTasks: 3, draftsByStatus: { pending: 2, approved: 1 }, approvalsThisMonth: 1 },
  spend: { spentUsd: 0.12, capUsd: 20, projectedUsd: 0.4, remainingUsd: 19.88, source: "db" },
  recentActivity: [{ type: "cron", detail: "inbharat.ai: completed (25 pages)", createdAt: "2026-06-25T06:18:00.000Z" }],
  integrations: { gemini: true, growthOpenai: false, supabase: true, cronSecret: false, ga4: false, gsc: false },
};

const CRON_RESULT = {
  ok: true,
  requestId: "t",
  trigger: "admin",
  results: [{ domain: "inbharat.ai", status: "completed", pages: 25, promoted: 2 }],
};

/** Wire the common admin mocks (whoami + usage + budget GET/PATCH). */
async function mockAdminApi(page: Page): Promise<void> {
  await page.route("**/api/growth/whoami", (r) => fulfill(r, WHOAMI_ADMIN));
  await page.route("**/api/growth/usage?**", (r) => fulfill(r, USAGE_BODY));
  await page.route("**/api/growth/budget", (r) => {
    // Branch on the request body, not r.request().method: a preflight/options
    // interception makes method-detection unreliable in this harness, so key off
    // whether the caller sent a monthlyBudgetUsd payload (PATCH) or nothing (GET).
    const post = r.request().postDataJSON() as { monthlyBudgetUsd?: number } | null;
    if (post && typeof post.monthlyBudgetUsd === "number") {
      const cap = post.monthlyBudgetUsd;
      return fulfill(r, { ...BUDGET_GET, capUsd: cap, remainingUsd: cap - 0.12 });
    }
    return fulfill(r, BUDGET_GET);
  });
}

test("admin routes return 200 and are noindex (404 fixed)", async ({ page }) => {
  const res = await page.goto("/admin/growth", { waitUntil: "load" });
  expect(res?.status()).toBe(200);
  // Wait for the admin chrome to mount (RequireAdmin authorizes via the
  // SPA-fallback whoami in preview), which also runs the layout's noindex effect.
  await expect(page.locator("body")).toContainText(/INBHARAT GROWTH/i, { timeout: 15000 });
  const robots = await page.getAttribute('meta[name="robots"]', "content");
  expect(robots).toContain("noindex");

  const resUsage = await page.goto("/admin/growth/usage", { waitUntil: "load" });
  expect(resUsage?.status()).toBe(200);
});

test("unauthenticated → gate shows 'Sign in required'", async ({ page }) => {
  await page.route("**/api/growth/whoami", (r) => fulfill(r, { ok: false, code: "UNAUTHORIZED" }, 401));
  await page.goto("/admin/growth/usage", { waitUntil: "load" });
  await expect(page.locator("body")).toContainText(/Sign in required/i, { timeout: 15000 });
});

test("authorized admin sees Usage dashboard (cap, provider split, where used)", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/growth/usage", { waitUntil: "load" });
  // The cap renders as "$20.00" (the budget GET). This also implies loading cleared.
  await expect(page.locator("body")).toContainText(/\$20\.00/, { timeout: 15000 });
  // Provider split cards (static labels, always present once loaded).
  await expect(page.locator("body")).toContainText(/Gemini/);
  await expect(page.locator("body")).toContainText(/OpenAI/);
  // Where-used section surfaces the article.
  await expect(page.locator("body")).toContainText(/Where used/i);
  await expect(page.locator("body")).toContainText(/rag/i);
});

test("budget editor PATCHes the cap and reflects the new value", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/growth/usage", { waitUntil: "load" });
  await expect(page.locator("body")).toContainText(/Monthly cap/i, { timeout: 15000 });

  const capInput = page.locator('input[type="number"]');
  await capInput.waitFor({ state: "visible", timeout: 10000 });
  await capInput.fill("35");

  // The PATCH must carry the new value.
  const patchSeen = page
    .waitForRequest(
      (req) => req.url().includes("/api/growth/budget") && req.method() === "PATCH" && req.postDataJSON()?.monthlyBudgetUsd === 35,
      { timeout: 10000 },
    )
    .catch(() => null);

  await page.getByRole("button", { name: /^Save$/ }).click();
  expect(await patchSeen).not.toBeNull();
  // The UI confirms the new cap (fmtUsd(35) = "$35.00").
  await expect(page.locator("body")).toContainText(/\$35\.00/);
});

test("Overview 'Run daily audit now' triggers the cron and shows per-domain result", async ({ page }) => {
  await page.route("**/api/growth/whoami", (r) => fulfill(r, WHOAMI_ADMIN));
  await page.route("**/api/growth/insights", (r) => fulfill(r, INSIGHTS_BODY));
  await page.route("**/api/growth/cron/daily", (r) => fulfill(r, CRON_RESULT));
  await page.goto("/admin/growth", { waitUntil: "load" });
  await expect(page.locator("body")).toContainText(/Pages audited/i, { timeout: 15000 });

  await page.getByRole("button", { name: /Run daily audit now/i }).click();
  await expect(page.locator("body")).toContainText(/Run complete/i, { timeout: 10000 });
  // Per-domain result line: "inbharat.ai · 25 pages · 2 drafted".
  await expect(page.locator("body")).toContainText(/inbharat\.ai.*25 pages.*2 drafted/s, { timeout: 5000 });
});