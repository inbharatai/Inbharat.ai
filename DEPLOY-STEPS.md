# Deployment runbook

Deploy the public site and API runtime to **Vercel**, with **Supabase** for identity/database features. This is an operator checklist, not evidence that credentials, migrations, integrations or cron execution are already configured. See [README](README.md) for setup and [DOCS](DOCS.md) for architecture/configuration.

## 1. Choose the target and review the change

- Confirm the intended repository, Vercel project, Supabase project and production domain with the owner. Do not reuse a project identifier from an old document.
- Use the Node engine range in `package.json` and the committed lockfile. Install with `npm ci` in a clean checkout.
- Review source changes and generated/public content. Separate claims about code, tests, product readiness and deployed behavior.
- Use least-privilege credentials, environment-specific scopes and an approved maintenance/rollback plan. Do not inspect or paste secret values into tickets or chat.

Before committing, inspect the exact change set:

```sh
git status --short
git diff --check
git diff --stat
npm run audit:secrets
```

Stage only reviewed paths (`git add <reviewed-paths>`), inspect `git diff --cached`, and commit/push using the project's approved branch/review workflow. Do not default to `git add .`, forced branch updates or empty commits to trigger deployment. Never stage `.env*` values, local logs or reports; `.env.example` must remain placeholders only. A current-tree scan does not clear Git history or revoke leaked credentials.

## 2. Validate before release

Run in a checkout without real environment files or production write credentials:

```sh
npm run lint
npm run test:growth
npm run ci:build
npm audit
```

`ci:build` includes the moderate-and-above **production** dependency gate, build, built-output audits, Chromium installation and Playwright. The final `npm audit` also reviews development tooling; investigate its full output rather than assuming a production-only pass covers it. Do not run `npm audit fix --force` blindly. Native/browser dependencies may need explicit host setup; review failures rather than hiding them.

Do not claim a hosted CI pass unless the workflow actually started and completed for the release revision. A workflow that did not start, a local pass and a provider deployment are three different observations. Keep npm lifecycle scripts enabled when relying on the build hooks. Do not inject `GITHUB_ACTIONS`/`GITHUB_JOB` into Vercel to force local CI behavior.

## 3. Configure Supabase and schema deliberately

1. Confirm the intended project and its current migration history. Back up or otherwise establish the approved recovery path before schema changes.
2. Enable the desired Auth providers (Email, optionally Google). Set the production Site URL and explicit redirect allowlist for local development and approved hosted environments. The usual local Vite URL is `http://localhost:5173/app`; use the port actually printed by your server.
3. Configure browser public URL/anon key and the separate server URL/service-role key through secure environment settings. The service-role key bypasses RLS and must never enter a client bundle.
4. Review **all applicable pending migrations in order** from `supabase/migrations/`. Apply through the project's authorized migration workflow or SQL Editor only after checking prerequisites and existing schema. Do not assume every migration is safe to replay or that an old aggregate SQL helper is current.
5. Verify table RLS, function grants, ownership and expected schema on the target. A successful SQL command alone does not prove application permissions are correct.

The original chat schema is in `20250219000000_chat_sessions_messages.sql`; later migrations add other application and Growth functionality. Applying only that first file does not provision the complete app. Social inbox/order/schema work includes `20260810000001_drop_syndication_platforms.sql` and `20260810000002_social_publishing.sql`, with earlier prerequisites. Publication activation separately requires the two November migrations below.

There is no automatic migration application during build/deploy. Do not place database writes in a build hook. If an earlier draft schema was applied outside the migration history, stop and review an upgrade plan rather than blindly rerunning a replacement migration.

## 4. Configure Vercel

Import/link the intended repository and use the repo root, **Build Command `npm run build`**, **Output Directory `dist`**, and a compatible Node version. Keep `vercel.json` under review: it defines schedules, function duration limits, headers and routing. Account plan/platform constraints must support the configured schedules and durations; a checked-in schedule alone is not execution proof.

Use [`.env.example`](.env.example) and [the configuration reference](DOCS.md#configuration-reference). Configure only the integrations required for the environment:

| Capability | Minimum relevant configuration |
| --- | --- |
| Auth/persistence | Browser `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; server `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; schema and Auth settings |
| Web-console AI | `OPENAI_API_KEY`; `SERPER_API_KEY` for live search/news |
| Growth admin/drafting | `GEMINI_API_KEY`; approved `GROWTH_ADMIN_USER_IDS` or Supabase admin role; Growth schema |
| Scheduled jobs | `CRON_SECRET` and verified secret/admin authorization; never a spoofable user-agent shortcut |
| Repository article/cover publication | `GITHUB_TOKEN` with scoped repository Contents write permission; read-only discovery tokens cannot publish |
| GA browser tracking | `VITE_GA_MEASUREMENT_ID`, followed by rebuild and runtime verification |
| GA4/GSC reports | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, correct API/property grants |
| Contact | `RESEND_API_KEY`, verified `RESEND_FROM`, intended `CONTACT_NOTIFY_TO` |
| Social | Channel credentials/permissions from [social publishing](docs/social-publishing.md) |

Do not copy production write credentials into Preview by default. Leave `LOCAL_API_PORT` unset on hosted environments. Platform provenance variables (`VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`) must describe the actual build/runtime; do not invent them to bypass publication eligibility. Automatic reconciliation requires **no Vercel API token**.

### Cron authentication release check

Vercel uses `Authorization: Bearer <CRON_SECRET>` for scheduled calls when configured. External schedulers can use the supported shared-secret path; admin “Run now” actions use verified admin identity. Configure the secret securely and verify missing/wrong credentials fail. **User-agent and schedule headers are caller-controlled, not signatures.** Review `api/lib/requireAdmin.ts` and `npm run test:publication-cron-auth`; the shared guard now rejects header-only impersonation. Do not weaken that guard to make an unconfigured scheduled job appear successful.

### Preview protection

Keep deployment protection enabled for private previews unless the owner explicitly approves public access. A protected preview returning 401 does not prove an application routing bug. Use an authorized preview session or approved protection-bypass mechanism for testing; never publish the bypass value. Public production crawling must be tested on the canonical production host. Do not disable preview protection as a routine favicon fix.

## 5. Deploy and configure the domain

Deploy the reviewed commit through the approved Git integration or Vercel workflow. Confirm **Ready**, exact source revision and intended environment. A ready deployment is not automatically the canonical production alias or a working database integration.

For the production domain, use the DNS records shown by the current Vercel project, not fixed IP/CNAME examples copied from an old runbook. Apply them through the authorized DNS provider (GoDaddy or the actual registrar/DNS host). Preserve unrelated mail and verification records; do not delete historical records without confirming their purpose. Supabase can use its default project URL and does not need a custom domain for this setup.

The main site's canonical origin is configured in `seo.config.ts` as `https://www.inbharat.ai`. Confirm redirects, TLS and the apex/www relationship on the actual deployment. SILT's subdomain has dedicated middleware behavior; test it separately if included in the release. Forks/domain changes require coordinated source/routing updates, not DNS alone.

## 6. Verify the promoted site

Run the read-only production audit from the matching reviewed checkout:

```sh
npm run audit:deployment
```

It checks the configured canonical site, sitemap/public route set, HTML/schema/canonical/robots contracts, missing-page/article/asset HTTP 404s and noindex routes. It does not log in, submit search URLs, change the database or prove search-engine indexing.

Also verify, with appropriate authorization:

- Known pages and static assets return expected status/content type; unknown paths do not silently serve an indexable homepage.
- Admin pages remain noindex and out of the sitemap; admin APIs reject unauthorized callers. Noindex is not security.
- `/api/health` has the intended revision and expected presence flags. Inspect JSON `ok`; the handler can return HTTP 200 with `ok: false`. It may call OpenAI when configured, and it does not verify all integrations or schema.
- Sign-in, configured redirects, sign-out and scoped chat persistence work with a test account. Test guest behavior separately; do not assume every API has the same authentication policy.
- Browser analytics, if enabled, sends to the intended measurement ID. Skipped local GA tests are not live tracking verification.
- Contact/social/repository publication tests cause external effects: perform them only with explicit approval, controlled test content and the intended destination. Do not use a read-only smoke test as authority to send mail or publish posts.

A good HTTP audit supports crawlability and correctness of the tested responses. It does not prove rankings, indexing, citations, field Core Web Vitals, clinical outcomes or UnoOne release readiness.

## Activate publication reconciliation separately

**Currently deferred by the owner:** Supabase is inactive and will be reactivated later. Do not execute this section, remove the integration, or open protected routes until that reactivation is explicitly authorized. Public login UI stays off by default (`VITE_PUBLIC_LOGIN_ENABLED=false`).


**Review checkpoint, 16 November 2026:** the observed public snapshot identified source `10a6e8b745e7cb83054564f1904492f99b3c5ccd` but reported `automatedSyncEligible: false`. The precise build-side reason was not yet established. Hosted Supabase had not been verified and these migrations had not been applied in the review. This is **not a live activation claim**.

1. Review/apply the existing publication schema prerequisites and **both**:
   - [`20261116000001_article_publication_lifecycle.sql`](supabase/migrations/20261116000001_article_publication_lifecycle.sql)
   - [`20261116000002_article_publication_read_models.sql`](supabase/migrations/20261116000002_article_publication_read_models.sql)
2. Verify the service-role-only reconciliation RPC, grants/RLS and live/unverified/removed read-model behavior on the intended database. Local `npm run test:publication-sql` runs real SQL in isolated PGlite; it is not this hosted verification.
3. Promote a normal committed production build and inspect the **public** `/article-publication.json`. Require `automatedSyncEligible: true`, the expected full `sourceCommitSha` and valid snapshot identity. Do not hand-edit eligibility or infer its cause from the flag alone. Review build provenance and build logs when it is false.
4. Ensure production runtime provenance, server Supabase configuration and cron authentication are correct. The automatic endpoint runs at minutes 19 and 49 each hour. Do not call it in a read-only audit: a successful run writes the publication mirror.
5. After an authorized scheduled/admin execution, require a successful `status: "reconciled"` response/record with snapshot identity, count and observation time; inspect the corresponding database state. `unconfigured`, skipped work, rejected verification or an HTTP error are not success.
6. Verify consumers use the intended current-live read models and preserve historical/removed records. Check rollback/removal behavior through the approved test plan before relying on it operationally.

The cron validates exact canonical final HTML bytes and snapshot/source identity, rechecks the snapshot, then uses one atomic RPC; there is no build-time or per-row fallback. A source commit, successful build, deployment timestamp or first observation must not be substituted for an unknown original publication date. Cover operations can remain separate best-effort work after article acceptance.

See [publication lifecycle](docs/article-publication-lifecycle.md) for protocol details and the optional stronger operator CLI. That CLI needs separately authorized Vercel API credentials and is **not required** for automatic operation. Never wire it into build/postbuild.

## Rollback and troubleshooting

- Preserve the previous known deployment and migration history. App rollback does not automatically roll back SQL or external posts.
- For publication verification failure, check canonical identity/status/type/hash, running SHA, eligibility and schema/auth prerequisites. Do not weaken verification, manufacture timestamps or force the mirror to match a desired outcome.
- An intentional production rollback can be observed/reconciled as a newer observation of an older snapshot; it is not permission to hand-edit the checkpoint.
- For preview 401, check approved protection/access settings; for missing API routes locally, check the shim route map; for auth failures, check provider and redirect configuration; for schema errors, check migration history and permissions.
- Share sanitized errors and revision IDs, never raw environment dumps, private keys, browser credentials or privileged API responses. Keep troubleshooting reports out of Git.
