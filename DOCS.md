# Maintainer documentation

Architecture, configuration and operational boundaries for this repository. Start with [README](README.md) for setup and [DEPLOY-STEPS](DEPLOY-STEPS.md) for a release checklist. Review date: **16 November 2026**. Commands and behavior must be rechecked when their implementation changes.

## Architecture and source of truth

| Layer | Implementation | Important boundary |
| --- | --- | --- |
| UI | React 19, TypeScript, Vite; `index.tsx`, `App.tsx`, `pages/` | This web app is not the UnoOne desktop/Android runtime |
| Public content | `content/privateAI.ts`, `content/deepTech.ts`, `content/articles.meta.ts`, `content/articles/` | Product implementation/evidence labels are not release qualification |
| Claims | `content/claim-review.md`, `content/credentials.ts` | Keep historical research, memberships, completions and product validation distinct |
| HTML/SEO | `seo.config.ts`, `scripts/build-seo.ts`, `lib/rendering-contract.ts` | Static crawlable output plus React; a local build is not a production HTTP test |
| Web-console AI | `api/chat.ts`, `api/lib/serverLLM.ts`, `services/`, `lib/orchestration/` | Cloud-backed; OpenAI and optional Serper requests are server-side |
| Growth | `lib/growth/`, `api/growth/`, `pages/admin/growth/` | Gemini-only model router, separate from the chat backend |
| Identity/storage | Supabase; `lib/auth.tsx`, `lib/chatStorage.ts`, `api/lib/` | Browser anon access needs RLS; service-role access bypasses RLS |
| Host behavior | `vercel.json`, `middleware.ts`, `vite.config.ts` | Vercel, Vite preview and a generic static host are not interchangeable |

The product directory currently has 15 entries in six verticals; the article manifest and body directory each have 31 entries. Eleven locale resources provide partial UI translation, with English fallback. Language selection does not create translated article URLs or establish text-model/speech-language qualification. See `lib/i18n.ts` and `test:locale-boundaries`.

### Routing and rendering

Public route metadata comes from `ROUTES` in `seo.config.ts`. The SEO build writes route-specific HTML with readable content, canonical metadata, applicable JSON-LD, sitemap, social imagery and internal links. Admin routes are noindex and excluded from the sitemap. Noindex is a discovery directive, **not access control**.

`middleware.ts` actively handles the `silt.inbharat.ai` host, including its research/studio routes, redirects, internal storage paths and missing-route responses. It is not an unused middleware file. Main-site routing also depends on Vercel's static-file behavior and rewrites. The presence of `dist/404.html` alone cannot force HTTP 404 on another host: verify known routes, unknown pages, unknown articles and missing assets after deployment.

A static host can serve the public build only if its routing, status codes and headers are configured appropriately. It cannot supply the Vercel `/api/*` runtime merely by receiving `dist/`.

## Configuration reference

Copy [`.env.example`](.env.example), not real values from another environment. Keep development, preview and production credentials separate. Do not read or publish credential values when diagnosing configuration; inspect presence, intended scope and sanitized error codes.

### Browser/build values

- `VITE_PUBLIC_LOGIN_ENABLED`: public login UI is off unless explicitly `true`. It is not an API/admin authorization switch; guest limits and server checks remain.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: browser Auth/client configuration. The anon key is public by design; that does not make a database without correct RLS safe.
- `VITE_GA_MEASUREMENT_ID`: optional GA4 measurement ID, consumed by both `lib/analytics.ts` and the SEO build. The build validates the ID before shell injection. Leave it unset to disable this integration; rebuild after changing it. `VITE_GA_ID` is not the supported name.
- `GSC_SITE_VERIFICATION`: public HTML verification token injected by the SEO build. This is not a Search Console reporting credential or proof of indexing.
- `API_PROXY_TARGET` (or the supported alias `VITE_PROXY_API_TARGET`): local Vite API proxy target. `dev:local` supplies `http://localhost:3001`; do not accidentally proxy local tests to production.

Only approved public configuration belongs in `VITE_*`. There is no client admin-ID mirror to configure. `VITE_AUTH_REDIRECT_URL` optionally overrides the email confirmation/password-reset redirect in `components/AuthPanel.tsx`; otherwise it uses the current origin plus `/app`. Any override must match the approved Supabase redirect allowlist.

### Server values

| Variable(s) | Use and prerequisites |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Token verification and server database operations; required schema/grants must exist separately |
| `OPENAI_API_KEY` | Web-console chat and speech/image endpoints that use OpenAI; not Growth's model key |
| `SERPER_API_KEY` | Chat-side live web/news search; Growth search instead uses Gemini grounding |
| `GEMINI_API_KEY` | Growth model calls, grounding and image-generation calls |
| `GROWTH_ADMIN_USER_IDS` | Comma-separated Supabase user IDs; `app_metadata.role = "admin"` also grants admin access |
| `CRON_SECRET` | Shared secret for scheduled jobs; Vercel sends `Authorization: Bearer <secret>` when configured; supported external callers may use `x-cron-secret` |
| `GROWTH_MONTHLY_BUDGET_USD` | Fallback model-spend cap (default 20); runtime `growth_settings` value takes precedence |
| `GROWTH_<TASK>_MODEL` | Optional Gemini model-name override for `AUDIT`, `METADATA`, `SUMMARY`, `DRAFT`, `REVIEW`, `COVER`, `STRATEGY`, `CHAT`, `VISION`, `ARTICLE`; see `lib/growth/model-router.ts` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Server GitHub token (first name preferred); restrict repositories and privileges. Discovery needs read access; article/cover publishing needs Contents write permission |
| `RESEND_API_KEY`, `RESEND_FROM`, `CONTACT_NOTIFY_TO` | Contact mail delivery, sender and destination; configure an appropriate verified sender rather than relying on a provider's development sender |
| `GROWTH_LEAD_SALT` | Optional server-side salt for lead IP hashing; use a private environment-specific value |
| `IG_USER_ID`, `META_ACCESS_TOKEN` | Instagram Graph API publishing; account eligibility/scopes still required |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` | LinkedIn direct API publishing; author URN and token permissions must agree |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Shared Google service-account identity used for analytics and authorized search submission |
| `GA4_PROPERTY_ID`, `GSC_SITE_URL` | Numeric GA4 property ID and exact Search Console property identifier; measurement ID and property ID are different values |

Legacy Google credential aliases are supported: **email** lookup is `GA4_CLIENT_EMAIL` → `GSC_CLIENT_EMAIL` → `GOOGLE_CLIENT_EMAIL`; **private-key** lookup follows the same GA4 → GSC → GOOGLE order. These functions select a single shared pair, not independently isolated credentials per panel. Prefer the shared pair, or keep aliases consistent to avoid mismatched identity/key selection. `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PROJECT_ID` are not used by this reporting implementation. Private keys accept escaped `\n` newlines.

Grant only the permissions required for the intended action. GA4/GSC reporting grants do not automatically authorize Search Console sitemap submission: that operation requests the `webmasters` scope and requires a property role permitting submission. The configured `GSC_SITE_URL` must cover the canonical site. Submission acceptance is not indexing or ranking evidence.

`LOCAL_API_PORT` is a **local development signal only**. `VERCEL`, `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` are platform provenance inputs, not values to fabricate to make a local build eligible. `VERCEL_TOKEN` and optional `VERCEL_TEAM_ID` belong only to the optional operator verification CLI, not the automatic reconciliation path.

## Authentication, persistence and local development

- Enable intended Supabase Auth providers (Email and optionally Google). Configure the site URL and exact approved local/production redirect URLs; do not casually allow every preview host.
- Signed-in chat sessions/messages use `lib/chatStorage.ts` with the browser client and table RLS. Server features also perform database writes; “no server-side DB writes” is not an application-wide property.
- Endpoint policies differ. Chat, search, TTS and transcription use optional authentication; chat also has guest-usage controls. News requires verified user authentication; Growth admin endpoints use the admin gate. Optional-auth verification failures can fall back to guest. Do not describe all `/api/*` as uniformly sign-in-only or uniformly guest-accessible.
- `api/lib/requireAdmin.ts` is the server admin authority. The UI guard is not sufficient security. Local-development allowances are not production permissions.
- `server/local-api.ts` explicitly maps chat, search and selected Growth handlers. It is not a full serverless emulator; use `vercel dev` for missing handlers. Vite alone and Vite preview do not provide serverless APIs.
- `/api/health` reports configuration flags and revision, and calls OpenAI model listing when its key is present. It currently returns HTTP 200 even when the JSON body has `ok: false`; check the body, not only the status code. It does not establish schema readiness, publication activation or every integration's health.

For cron security, require a configured shared secret or verified admin authorization. A caller-controlled `vercel-cron` user-agent or `x-vercel-cron-schedule` is **not a signature**. The shared `authorizeCron` rejects those headers as credentials and compares configured secrets with a timing-safe comparison; verified admin access remains separate. Run `npm run test:publication-cron-auth` and the Growth suite before release. The publication-sync handler additionally rejects non-production runtimes and accepts only the secret/admin paths.

## Growth operations and approval boundaries

The Growth model path is Gemini-only; defaults and per-task overrides live in `lib/growth/model-router.ts`. The budget is application accounting/control, not a guarantee against provider charges or concurrent overspend. Crawling/repository access is governed by the Growth authorization registry; a token's technical access is not an authorization grant to the agent.

The system includes a founder-edited content calendar, a bounded function-calling loop, sitemap-driven audits, topic discovery, knowledge retrieval (PostgreSQL full-text search plus token-overlap ranking), analytics ingestion and social drafts. Optional integrations can report unconfigured/partial/failed outcomes. The UI existing does not prove any of those services is connected.

### Scheduled jobs

Schedules below are UTC, as configured in `vercel.json`; configuring a schedule is not evidence that it executed successfully.

| Endpoint | Schedule | Purpose |
| --- | --- | --- |
| `/api/growth/cron/publication-sync` | `19,49 * * * *` | Verify canonical publication and reconcile atomically |
| `/api/growth/cron/daily` | `17 6 * * *` | Authorized-site audit and associated Growth work |
| `/api/growth/auto?action=run` | `7,37 * * * *` | Optional draft/approval loop; disabled by default |
| `/api/growth/cron/morning` | `30 2 * * *` | Calendar-driven drafting (08:00 IST) |
| `/api/growth/cron/topic-discovery` | `23 3 * * 1` | Weekly topic discovery |
| `/api/growth/cron/analytics-sync` | `47 3 * * *` | GA4/GSC reporting into knowledge |
| `/api/growth/cron/search-submit` | `11 4 * * *` | Canonical sitemap/IndexNow submission with prerequisites |

### Approvals and external effects

- Article publishing requires admin authorization and an approved draft. It updates article body and metadata atomically in Git; branch conflicts fail rather than force-overwrite changes.
- Auto Mode defaults to off. Its optional `autoApprove` applies to this run's pending **LinkedIn and cover** drafts, not blanket approval of all old drafts. The loop itself does not publish.
- **Stale-cover exception:** an admin-initiated article publish may regenerate, auto-approve and ship a stale pending/rejected companion cover. A fresh pending cover can remain awaiting review. Cover publication and calendar/knowledge updates are separate best-effort operations, not part of the atomic article commit.
- Direct Instagram/LinkedIn publishing needs the configured external credentials and relevant approval checks. LinkedIn also has a manual share-link path; opening or generating that link is not evidence of an external post.
- DEV.to, Hashnode and Medium distribution were removed; the syndication ledger retains history. See [social publishing](docs/social-publishing.md) for channel-specific setup, then verify the current API implementation before sending.

Avoid “everything is always human-approved” or “nothing ever publishes automatically” as system-wide descriptions. State the particular action, trigger, approval rule and observed outcome.

## Publication state and database activation

The authoritative distinction is **draft generated → repository accepted → canonical content observed**. An article's legacy database draft status `published` does not itself prove a live deployment. `first_verified_at` is first successful observation, not exact first publication. `datePublished` may remain unknown; do not replace it with build time, commit time or observation time. `dateModified` represents a substantive source revision, not a deployment timestamp.

The SEO build creates `/article-publication.json` and the identical immutable `/article-publication/<snapshotId>.json`. The snapshot includes public metadata, source revision, body hashes, exact final HTML hashes and build provenance. `lib/growth/source-provenance.ts` verifies source files against local Git, or—only when `.git` is absent—against the fixed public repository's commit tree without credentials. Dirty/mismatched Git does not fall back; verification errors leave eligibility false with a bounded diagnostic reason. This read-only provenance check is not a database write or deployment attestation. Reconciliation verifies the canonical origin, eligibility, running source SHA, status/content type, byte counts/hashes, canonical/schema/robots constraints and an unchanged snapshot before calling **one** service-role-only transactional RPC. There is no per-row fallback.

Both `20261116000001_article_publication_lifecycle.sql` and `20261116000002_article_publication_read_models.sql` must be reviewed and applied against the correct existing schema. Read-model changes distinguish current live records from retained unverified/removed history. Do not assume an old bulk migration helper includes them. Builds never apply SQL or update the mirror.

Supabase is intentionally inactive at the owner’s request. Do not activate it or apply migrations during the landing work. At the 16 November review, these two migrations remained unapplied/unverified against hosted Supabase, and the observed `10a6e8b` production snapshot was ineligible. Source implementation and passing PGlite fixtures are **not activation evidence**. Follow the [activation checklist](DEPLOY-STEPS.md#activate-publication-reconciliation-separately); the [detailed lifecycle design](docs/article-publication-lifecycle.md) explains rollback, observation ordering, tombstones and the optional operator CLI. Apply both migrations even if older design notes mention only the first.

## Validation and evidence handling

See [README's command table](README.md#build-and-verification), `scripts/ci-checks.ts` and `.github/workflows/ci.yml` for the actual gate composition. Browser tests default to local built shells and mock API flows; `PLAYWRIGHT_BASE_URL` opts into a different target and should not be inherited accidentally. `PLAYWRIGHT_GA_ID` controls optional GA assertions; skipped cases do not validate live analytics.

Keep logs in ignored `reports/`, `playwright-report/` and `test-results/`. Review them for tokens, private URLs and user data before sharing. Secret scanning covers current tracked text, not all history or remote credential revocation. Production-only dependency auditing excludes development tooling; run an all-dependency audit as a separate release review. Never substitute passing local tests for hosted CI, migration application, authorized integration testing or deployed HTTP verification.
