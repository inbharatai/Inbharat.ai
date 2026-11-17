# InBharat.ai

The InBharat.ai company website, including UnoOne product information, a separate cloud-backed AI console, learning hub and protected Growth administration. This repository is the website/web application—not the Windows or Android runtime source.

[MIT license](LICENSE) · [Maintainer documentation](DOCS.md) · [Deployment runbook](DEPLOY-STEPS.md) · [Contributing](CONTRIBUTING.md)

## What this repository contains

- **Public product and research pages.** **InBharat.ai is the master brand. UnoOne is a portfolio product**, with Power for Windows and Mobile for Android. The launch experience leads to `/get-started`; actual download availability is controlled by owner-approved artifact records, not by changing a development label. `/status` separates current evidence from public release approval. PAI remains in explanatory and historical research context. This repository is the website; its web console is a **separate cloud-API application**, not the private on-device runtime.
- **A separate 15-entry company directory across six verticals**, preserving its original category/selector design. The homepage's existing three-ring visualization now explains **12 UnoOne capabilities**, not company-product integrations. Its names come from `content/unooneCapabilities.ts`; the company catalog and portfolio schema remain separate. The complete company list is available without JavaScript, while the enhanced view retains the original selector. An entry does not certify availability or validation.
- **The “Learn AI with Reeturaj” hub.** The current source has **31 article metadata records and 31 Markdown bodies**, with crawlable HTML, article schema, FAQs and internal links generated at build time.
- **The web console at `/app`.** Chat modes, image context, microphone input and speech features depend on the relevant browser capabilities, APIs and configuration. OpenAI serves the chat/voice path; Serper supplies optional web/news search.
- **Partial interface localization.** Eleven locale resources (English plus ten Indian languages) do not establish complete translation, model quality or speech support in those languages. English fallback and explicit content-language boundaries are intentional; articles are not eleven translated editions.
- **Growth administration at `/admin/growth`.** A separate Gemini-backed drafting, audit, knowledge, analytics and social-publishing system. Configuration, authorization, migrations and external permissions are prerequisites, not implied by the presence of its UI.

### Product claims and readiness

Use [the claim/evidence register](content/claim-review.md), [private-AI page data](content/privateAI.ts) and [research data](content/deepTech.ts) when editing public claims. Source implementation, unit tests, historical device runs and release qualification are different evidence levels. In particular:

- SILT is research. The USB/removable-drive Pocket AI architecture is **historical patent-filing research**, not the current UnoOne consumer offer or proof that newer features are covered by a patent.
- Pairing protocol tests do not establish a qualified physical phone–desktop round trip. Local inference, encrypted storage and optional network actions have different privacy boundaries.
- No public UnoOne installer, free UnoOne offer, blanket clinical validation or portfolio-wide India-only processing guarantee is established here.
- [Credentials](content/credentials.ts) distinguish recognition, participation, membership, badges and course completions. DPIIT recognition belongs to **Uni Guru Technologies LLP**. Only completion credentials are emitted as educational credentials; the register does not turn participation into competitive awards or endorsement.

## Current operating scope

Supabase is intentionally inactive while the owner prepares reactivation. Its integration and data must remain intact: **do not apply migrations, activate services, remove authentication, or open admin routes as part of the landing-page work**. Public sign-in controls are hidden unless `VITE_PUBLIC_LOGIN_ENABLED=true`; the existing guest limit remains enforced and account-required actions report unavailability. Reactivation is a separate authorized operation.

The landing uses the exact owner-supplied UnoOne logo and a captioned recorded product walkthrough. The film shows October 2026 captures; founder-authored Windows engineering evidence is dated 14 November 2026. These are not independent certification, universal hardware results, or proof of a public installer. The full technical preprint and investor film are not automatically published. See [UnoOne landing data](content/unooneLanding.ts) and [release-media provenance](assets-source/unoone/README.md).

**Current visual boundary:** keep all original company presentation above the lower MEET PAI section, including logo/colors, hero, shloka, buttons, statistics and ticker. Only the lower UnoOne section and existing orbit are visually revised. Earlier whole-site UnoOne-first previews are superseded.

See [the launch maintenance guide](docs/unoone-launch.md) for the release-data contract and preservation requirements.

The homepage first paint is generated from the **same real React landing tree** used by the browser. Its styled content remains visible when JavaScript is delayed, disabled or fails. React replaces that tree atomically; this is not a separate plain-text splash page or hidden SEO body. The demo is poster-first, has native controls/captions/transcript and does not request its MP4 until a user action.

## Quick start

### Prerequisites

Use a Node version satisfying [`package.json`](package.json). The Supabase client is pinned to the previously used Node-20-compatible SDK line rather than silently upgrading to a Node-22-only release. Runtime support is verified, not inferred only from an engine declaration. Supported range: **Node 20.19+ on the 20.x line, or Node 22.12+**. Use npm and the checked-in lockfile. The CI workflow currently selects Node 20; dependency support should be rechecked whenever the lockfile changes.

```sh
git clone https://github.com/inbharatai/Inbharat.ai.git
cd Inbharat.ai
npm ci
cp .env.example .env
```

Fill only the variables needed for your work. The template has placeholders, not working credentials. Never commit local environment files. Public pages can be developed without provider keys; dependent features may be unavailable or return errors rather than silently becoming functional.

Choose one development mode:

```sh
npm run dev:vite    # UI only; no serverless API handlers
npm run dev:local   # local API shim :3001 + Vite proxy, normally :5173
npm run dev         # vercel dev; CLI login/project linking may be required
```

The local shim supports **a subset** of API routes, not full Vercel parity. Check [its route map](server/local-api.ts) before testing an endpoint. It has development-only admin allowances: use an isolated development database, do not expose it to untrusted networks, and never set `LOCAL_API_PORT` in production. For Vercel CLI setup, run `npx vercel login` and `npx vercel link` only against the project you intend to use.

## Environment variables

[`.env.example`](.env.example) is the copyable template; [DOCS.md](DOCS.md#configuration-reference) explains the configuration boundaries.

| Purpose | Variables | Boundary |
| --- | --- | --- |
| Public sign-in UI | `VITE_PUBLIC_LOGIN_ENABLED`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | UI switch defaults off while Supabase is inactive; it never relaxes server/admin authorization |
| Server auth and database | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Service-role key is secret and bypasses RLS |
| Web-console AI/search | `OPENAI_API_KEY`, optional `SERPER_API_KEY` | Server-only; not the UnoOne local runtime |
| Growth | `GEMINI_API_KEY`, `GROWTH_ADMIN_USER_IDS`, `GROWTH_MONTHLY_BUDGET_USD` | Server-only; admin role metadata is an alternative to the ID allowlist |
| Scheduled jobs | `CRON_SECRET` | Configure for authenticated scheduled execution; a user-agent/schedule header is not authentication |
| Repository publishing | `GITHUB_TOKEN` (fallback `GH_TOKEN`) | Read access for discovery; scoped Contents write permission for article/cover commits |
| Browser analytics | `VITE_GA_MEASUREMENT_ID` | Public, build-time GA4 ID; **not** `VITE_GA_ID` |
| Search ownership | `GSC_SITE_VERIFICATION` | Public verification token injected into HTML at build time |
| Analytics reporting | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GA4_PROPERTY_ID`, `GSC_SITE_URL` | Private key is server-only; service-account grants required |
| Contact | `RESEND_API_KEY`, `RESEND_FROM`, `CONTACT_NOTIFY_TO` | Server-side mail service and verified sender configuration |
| Social APIs | `IG_USER_ID`, `META_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` | Optional external publishing credentials and permissions |

Never use a `VITE_` prefix for provider keys, service-role keys, private keys or cron secrets: Vite exposes those variables to the client. Do not put production write credentials into routine local or CI builds.

## Build and verification

```sh
npm run lint
npm run test:growth
npm run ci:build
```

`ci:build` runs the production dependency audit, application build, SEO audit, shell crawl, Chromium installation and browser tests. Use a checkout without real `.env*` files: subprocess environment filtering does not stop Vite from reading files. Linux browser libraries may require an explicit, authorized `npx playwright install --with-deps chromium` setup step.

| Command | What it does |
| --- | --- |
| `npm run build` | Runs the application build and lifecycle hooks; creates `dist/`, SEO shells, sitemap, media and publication snapshots. **No publication database writes.** |
| `npm run build:app` | Vite + SEO generation + the write-free publication-sync compatibility entrypoint; bypasses top-level build lifecycle gates |
| `npm run build:seo` | Regenerates SEO output over an existing `dist/`; not a replacement for a complete release build |
| `npm run preview` | Serves built `dist/` locally; no production API runtime |
| `npm run lint` | ESLint, TypeScript, secret scanner/controls, CI controls, SEO contracts and the SEO-hardening suites |
| `npm run test:growth` | Hermetic Growth checks, separate from `lint` |
| `npm run test:seo-hardening` | Search submission, rendering, publication lifecycle, content accuracy, SQL, locale and cron-auth regression suites |
| `npm run test:publication-sql` | Executes publication migrations/fixtures in isolated PGlite; not hosted Supabase verification |
| `npm run audit:prod` | Production dependency audit at moderate severity and above; not an all-dependency audit |
| `npm run audit:secrets` | Scanner controls and current tracked-text scan; not Git-history scanning or credential revocation |
| `npm run audit:seo` / `npm run audit:shell` | Hermetic checks against built output |
| `npm run test:e2e` | Chromium Playwright tests against local built output by default; API-dependent flows use mocks |
| `npm run audit:deployment` | Read-only HTTP audit of the configured canonical production site after promotion |

See [`package.json`](package.json) for individual suites and the [dependency-security scope](docs/dependency-security.md) for the remaining upstream development-tool advisories. A clean production audit is not a clean full dependency graph. `build:vite-only` omits SEO/publication generation and is not release-equivalent. The legacy `arcade*` commands require a separate `agent-arcade` checkout that is not included here.

The [CI workflow](.github/workflows/ci.yml) has lint, build and Growth jobs. Automatic build-hook audit/browser work is restricted to **both** `GITHUB_ACTIONS=true` and `GITHUB_JOB=build`; ordinary local/Vercel builds and generic `CI=true` do not activate it. Do not set those GitHub flags on Vercel or disable npm lifecycle scripts when relying on these gates. Typechecking uses the actual repository configuration; it is not a claim of TypeScript strict mode.

### Evidence snapshot — 16 November 2026

The review of source baseline `10a6e8b745e7cb83054564f1904492f99b3c5ccd` recorded a local Node 20.20.2 validation with all ten selected gates passing: Growth **700 checks**, Playwright **80 passed / 2 GA-dependent skips** (82 cases), and **16 PGlite SQL checks**. These are dated results, not permanent suite counts or proof of live integrations. A separate deployed HTTP audit passed 45 public routes, missing-route/asset 404 checks and private-route noindex checks. Neither result establishes indexing, rankings, field Core Web Vitals, AI citations or on-device product qualification.

A hosted CI pass was **not established** for that review. Dependency-audit results are time- and lockfile-dependent; rerun both the production gate and an all-dependency audit before release rather than treating a historical count as a clean-bill-of-health guarantee.

## Article publication: implementation is not activation

1. An article draft is generated; this is not publication.
2. An authorized article publish commits its Markdown and manifest together in one non-force Git update. Repository acceptance is **not verified live publication**.
3. The production-only `/api/growth/cron/publication-sync` verifies the canonical public snapshot, running source SHA and **exact final HTML byte hashes**, rechecks snapshot identity, then calls one atomic `reconcile_production_articles` RPC.

Every build remains write-free. Activation requires the existing database schema plus **both** publication migrations:

- [`20261116000001_article_publication_lifecycle.sql`](supabase/migrations/20261116000001_article_publication_lifecycle.sql)
- [`20261116000002_article_publication_read_models.sql`](supabase/migrations/20261116000002_article_publication_read_models.sql)

The 16 November review had **not applied those migrations or verified the hosted database**. The observed [production snapshot](https://www.inbharat.ai/article-publication.json) identified the `10a6e8b` source baseline but reported `automatedSyncEligible: false`; the exact build-side cause had not been established. **Do not describe reconciliation as activated.** After owner-authorized Supabase reactivation, establish eligibility, schema/grants, authentication and a successful reconciliation separately. Do not perform that activation while the service is intentionally paused. See [deployment steps](DEPLOY-STEPS.md#activate-publication-reconciliation-separately) and the [lifecycle design](docs/article-publication-lifecycle.md).

Growth publishing also has important approval exceptions: Auto Mode (off by default) can approve this run’s LinkedIn/cover drafts when explicitly enabled. An admin-initiated article publish can regenerate, auto-approve and ship a stale companion cover. Do not claim that every asset always receives a separate human approval. Article commit, cover operations and deployment remain distinct outcomes; see [Growth operations](DOCS.md#growth-operations-and-approval-boundaries).

## Source map

| Location | Responsibility |
| --- | --- |
| `index.tsx`, `App.tsx`, `pages/`, `components/` | Routing, public pages, web console and admin UI |
| `content/privateAI.ts`, `content/deepTech.ts`, `content/claim-review.md` | Product/research descriptions and bounded evidence |
| `content/articles.meta.ts`, `content/articles/*.md` | Article metadata and bodies |
| `content/credentials.ts` | Recognition/completion register and schema classification |
| `seo.config.ts`, `scripts/build-seo.ts` | Canonical route metadata and generated static shells |
| `lib/`, `services/`, `api/` | Browser utilities, agent services and server endpoints |
| `lib/growth/`, `api/growth/` | Growth orchestration, publishing and reconciliation |
| `supabase/migrations/` | Reviewed, separately applied schema migrations |
| `e2e/`, `scripts/test-*` | Browser, contract and hermetic regression tests |
| `middleware.ts`, `vercel.json`, `vite.config.ts` | Host routing, deployment headers and local routing |

## Further reading

- [Maintainer documentation](DOCS.md) and [deployment runbook](DEPLOY-STEPS.md)
- [Content claim review](content/claim-review.md) and [publication lifecycle](docs/article-publication-lifecycle.md)
- [Social publishing](docs/social-publishing.md), [product concept media](docs/product-concept-media.md) and [redirect notes](docs/seo-redirects.md)
- [Security policy](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [MIT license](LICENSE)
