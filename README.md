# InBharat AI — Desh Ka AI

<div align="center">

**AI Intelligence for Bharat**

Agentic search, voice-first interaction, multilingual AI, and a founder-authored
learning hub — built for every Indian.

[![License: MIT](https://img.shields.io/badge/License-MIT-138808.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev/)

</div>

---

## Overview

**InBharat AI** is an agentic AI search and chat experience tailored for Bharat,
plus a public marketing site and a founder-authored learning hub. It combines:

- **Multi-mode agents** — Research, Creative, Coder, Educator, Browser, Executive, Shopper, and standard Nexus
- **Voice-first** — Speak in the search bar, listen to replies (TTS), and full Live voice conversation
- **Indian languages** — English + Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Odia, Assamese)
- **Image context** — Upload images and get answers; Creative mode supports image generation
- **Auth** — Supabase Auth (email/password + optional Google)
- **14-product ecosystem** — InBharat AI + 13 sister products organized into 6 verticals (InBharat Core AI · Agent Ops & Trust · Growth & Publishing · Consumer & Culture · Education & Career · Health & Public Service) on the landing page: KathaKitaab, JAK Swarm, Agent Arcade, SocialFlow, Sahayaak AI, Phoring, UniBot, UniAssist.ai, TestsPrep.in, UnoOne, OpenClawFix, Sahayaak Seva, and SwasthyaScore AI
- **"Learn AI with Reeturaj" hub** — 18 published practical-AI articles with world-class SEO/GEO/AI-citation shells, grown daily by the founder-authored "Build with Reeturaj" content calendar
- **Growth Agent** — a Gemini function-calling agent loop (17 tools) that drafts one new article per day from a founder-edited content calendar, plus a sitemap-driven SEO/GEO auditor, a human-gated LinkedIn promotion loop, multi-platform syndication (DEV.to / Hashnode / Medium, with a local-Playwright submit path mirroring the LinkedIn flow), a high-intent web-search topic-discovery pipeline, an inbox-as-knowledge-base retrieval layer (FTS + token-Jaccard, no pgvector), and a private founder-only admin console. Publishing is always human-gated; an optional Auto Mode can pre-approve pending drafts (off by default) — nothing ever auto-publishes
- **Contact** — a contact form (Resend) that emails the team + auto-replies the submitter, alongside the existing growth-leads capture

---

## Features

| Area | Description |
|--------|-------------|
| **Agent modes** | Standard (Nexus), Research, Creative, Coder, Educator, Browser, Executive, Shopper |
| **Voice** | Mic input (speak-to-type), TTS on replies, full Live voice mode |
| **Languages** | English + 10 Indian languages (locale files in `locales/`) |
| **Images** | Upload from omnibox; image generation in Creative mode |
| **Auth** | Supabase Auth (email/password + optional Google) |
| **Landing** | Searchable grid of all 12 ecosystem products with per-product CTAs |
| **Learn AI hub** | `/learn-ai-with-reeturaj` — searchable article grid + per-article pages with hero, direct-answer callout, FAQ accordion, related/prev-next nav |
| **SEO/GEO shells** | Pre-built per-route HTML shells (`scripts/build-seo.ts`) with route-specific JSON-LD (Organization, WebSite, TechArticle, FAQPage, BreadcrumbList), sitemap.xml, OG image, and a crawlable article body for AI-search engines |
| **Analytics** | GA4 baked into every shell (Measurement ID via `VITE_GA_ID`) |
| **Contact** | `/api/contact` (Resend) — emails `info@inbharat.ai` + auto-replies the submitter; growth-leads captured separately |
| **Growth Agent** | Gemini function-calling agent loop (17 tools) drafting one daily article from a founder content calendar (`/api/growth/cron/morning`, 8am IST) + sitemap SEO/GEO audit (`/api/growth/cron/daily`) + weekly high-intent topic discovery (`/api/growth/cron/topic-discovery`) + daily GA4/GSC analytics sync (`/api/growth/cron/analytics-sync`) + a 30-min Auto Mode pass (`/api/growth/auto`) + human-gated LinkedIn promotion + DEV.to/Hashnode/Medium syndication (API + local-Playwright) + inbox-as-knowledge-base retrieval; admin review at `/admin/growth` |

---

## Quick start

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **Vercel CLI** for local serverless (`npm i -g vercel`) — optional but needed for `/api/*` locally

### 1. Clone and install

```bash
git clone https://github.com/inbharatai/Inbharat.ai.git
cd Inbharat.ai
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (see [Environment variables](#environment-variables)).
The app runs without keys but disables dependent features (chat/voice without OpenAI, drafts without Gemini).

### 3. Run

```bash
npx vercel login
npx vercel link
npm run dev          # vercel dev — serves /api/* + the SPA (port printed in the terminal)
```

If you can't (or don't want to) use Vercel CLI locally, run UI-only:

```bash
npm run dev:vite     # Vite only; /api/* will 404
```

Or run the local API + Vite together (no Vercel CLI needed):

```bash
npm run dev:local    # API on :3001, Vite on :5173 with /api proxied to :3001
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | `vercel dev` — full local dev (SPA + `/api/*`) |
| `npm run dev:vite` | Vite only (UI; `/api/*` 404) |
| `npm run dev:local` | Local API (`server/local-api.ts` :3001) + Vite (:5173) with `/api` proxy — no Vercel CLI |
| `npm run build` | `vite build && tsx scripts/build-seo.ts && tsx scripts/sync-published-articles.ts` — emits `dist/` + per-route SEO shells + sitemap + OG image, then mirrors published articles into the `published_articles` SEO-memory table (non-fatal if Supabase is absent) |
| `npm run build:seo` | Re-run only the SEO shell generator over the existing `dist/` |
| `npm run preview` | Preview the production build locally (`vite preview`, :4173) |
| `npm run lint` | ESLint, zero warnings required (the project gate) |
| `npm run test:growth` | 400+ hermetic Growth Agent unit checks — cron auth, redaction, crawler, auditor, promoter, calendar topic picker, agent narration detection, article slug resolution, knowledge-base FTS/dedupe, topic-discovery scoring |
| `npm run test:e2e` | Playwright end-to-end (founder hub, article pages, growth admin, chat regression) |

### Production & preview check

After deploying to Vercel, confirm static assets are public:

- **`/favicon.png`** should return **200** on both production (`https://inbharat.ai`) and the preview domain. If you see 401, disable Deployment Protection for Preview (Vercel → Project → Settings → Deployment Protection).
- **`/learn-ai-with-reeturaj/rag`** should return **200** with `TechArticle` + `FAQPage` JSON-LD and a crawlable article body (non-JS crawlers see the full article).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Chat* | OpenAI key (server-only) for chat, TTS, STT. Set in Vercel env. |
| `GEMINI_API_KEY` | Growth | Gemini key for the Growth Agent's draft model (separate from chat). |
| `GROWTH_OPENAI_API_KEY` | Growth | Optional OpenAI key for growth drafts (never falls back to `OPENAI_API_KEY`). |
| `GROWTH_MONTHLY_BUDGET_USD` | No | Growth Agent monthly model spend cap fallback (default 20). Overridden at runtime by the `growth_settings` row edited live from the admin dashboard — no redeploy. |
| `GROWTH_ADMIN_USER_IDS` | Admin | Comma-separated Supabase user ids allowed to view `/admin/growth`. (Alternative: set the user's `app_metadata.role = "admin"` in Supabase — no env/redeploy.) |
| `CRON_SECRET` | No | Optional shared secret for an external scheduler to authenticate the five growth crons (`/api/growth/cron/{daily,morning,topic-discovery,analytics-sync}` + `/api/growth/auto`). The Vercel scheduled crons (identified by their `vercel-cron` user-agent) and the admin "Run now" buttons work without it. |
| `VITE_SUPABASE_URL` | Auth | Supabase project URL for browser auth. |
| `VITE_SUPABASE_ANON_KEY` | Auth | Supabase anon key for browser auth. |
| `SUPABASE_URL` | Auth | Supabase project URL for serverless auth verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth | Supabase service role key (server-only). |
| `VITE_GA_ID` | No | GA4 Measurement ID (e.g. `G-XXXX`) baked into every SEO shell. |
| `GSC_SITE_VERIFICATION` | No | Google Search Console verification token (baked into the home shell). |
| `SERPER_API_KEY` | No | [Serper](https://serper.dev) for live web search in the **chat** Research/Browser mode + `/api/search` + `/api/news`. The Growth Agent's `web_search` tool, draft-time grounding, and weekly topic discovery use Gemini `google_search` grounding (reuses `GEMINI_API_KEY`, no Serper key). |
| `GITHUB_TOKEN` | Growth | GitHub PAT (private-read) for the Growth Agent's repo discovery + drop-folder. |
| `DEVTO_API_KEY` | Syndication | DEV.to API key (Forem v1 `api-key` header) for cross-posting approved articles. |
| `HASHNODE_TOKEN` | Syndication | Hashnode Personal Access Token for GraphQL `publishPost`. |
| `HASHNODE_PUBLICATION_ID` | Syndication | Hashnode publication ID the agent publishes into. |
| `RESEND_API_KEY` | Contact | Resend API key for the `/api/contact` form (team email + submitter auto-reply). |
| `RESEND_FROM` | Contact | Verified sender address for the contact form (e.g. `InBharat <notify@inbharat.ai>`). |
| `CONTACT_NOTIFY_TO` | Contact | Inbox that receives contact submissions (e.g. `info@inbharat.ai`). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Analytics Inbox | Google service-account email for the GA4 + Search Console read API (the analytics-sync cron + `read_analytics`/`sync_analytics` tools). |
| `GOOGLE_PRIVATE_KEY` | Analytics Inbox | Google service-account private key (server-only, **secret** — never paste in chat or commit). The service account must be added as a Viewer on the GA4 property and a Restricted user in Search Console, or the sync returns partial 403s (honest, surfaced). |
| `GA4_PROPERTY_ID` | Analytics Inbox | GA4 property id (numeric; not secret) for the analytics-sync cron's totals + dimension report. |
| `GSC_SITE_URL` | Analytics Inbox | Search Console site URL (not secret; e.g. `sc-domain:inbharat.ai`) for the GSC query report. |

\* Chat runs without `OPENAI_API_KEY` but shows warnings and disables chat/voice. The Growth Agent is fully separate and never uses the chat key. Syndication + contact vars are optional — each feature degrades honestly (returns `not_configured`) when its var is missing; the others still work.

> **Secrets:** never commit `.env`. Supabase service-role keys, OpenAI/Gemini keys, and `CRON_SECRET` are server-only — they are read in `/api/*` and `scripts/*`, never exposed to the browser bundle.

---

## Project structure

```
├── App.tsx                # Chat app: sessions, modes, auth gate
├── index.tsx              # Entry: AuthProvider, router, lazy routes, RouteEffects
├── index.html             # HTML shell (Vite)
├── seo.config.ts          # Per-route SEO + JSON-LD definitions (ROUTES array)
├── vite-env.d.ts          # Vite client types (import.meta.glob ?raw)
├── types.ts               # AgentMode, ViewMode, Message, widgets
├── content/
│   ├── articles.meta.ts            # ArticleMeta[] (body-free, isomorphic) for the 18 published articles
│   ├── articles.body.ts            # Lazy loadArticleBody() via import.meta.glob('?raw')
│   ├── article-schema.ts           # TechArticle + FAQPage + BreadcrumbList JSON-LD builders
│   ├── build-with-reeturaj-calendar.ts  # Founder-authored content calendar (next-up topics for the morning cron)
│   └── articles/*.md               # The 18 article markdown bodies
├── services/
│   └── openaiService.ts   # NexusAgent: chat, TTS, STT, image, tools (chat backend — do not mix with Growth Agent)
├── lib/
│   ├── auth.tsx           # Supabase auth context
│   ├── useDocumentHead.ts # Syncs per-route SEO head + JSON-LD client-side
│   ├── analytics.ts       # GA4 gtag helpers (deduped page views)
│   └── growth/            # Growth Agent: agent loop + tools, calendar, articleWriter, cover, gemini, model-router, promoter, critique, learning, crawler, auditor, redaction, syndication/
├── api/
│   ├── chat.ts            # Chat endpoint (chat backend)
│   ├── contact.ts         # Contact form (Resend) — team email + submitter auto-reply
│   ├── lib/serverLLM.ts   # Chat LLM selection (chat backend)
│   └── growth/            # Growth Agent endpoints: agent turn, inbox, issues/approvals, rules, strategy, leads, outcomes, publish, syndicate, insights, usage, budget, whoami, knowledge, cron/{daily,morning,topic-discovery,analytics-sync}, auto
├── scripts/
│   ├── build-seo.ts                # Build-time per-route HTML shells + sitemap + OG image + baked article bodies (admin shells are noindex)
│   ├── sync-published-articles.ts  # Mirrors articles.meta.ts → published_articles SEO-memory table (non-fatal)
│   ├── test-growth.ts              # 400+ hermetic Growth Agent unit checks
│   └── verify-shell-crawl.ts       # Accuracy check: crawler/auditor over built shells + admin noindex/sitemap hygiene
├── components/            # Omnibox, ChatView, LiveConversation, Sidebar, NewsFeed, SourceCard, AgentWidgets, TricolourStar
├── pages/
│   ├── Landing.tsx        # Landing: hero, 12-product grid, sections (PRODUCT_DEFS)
│   ├── LearnAIWithReeturaj.tsx  # Article hub (searchable grid)
│   ├── ArticlePage.tsx    # Per-article reading page (lazy)
│   └── admin/growth/      # Growth Agent admin UI (Overview, Usage, Sites, Repos, Issues, Performance, Strategy, Learning, Rules, Inbox, Agent, Knowledge, Settings)
├── locales/               # 10 Indian-language + English i18n bundles
└── public/                # Static assets (logos, per-article visuals)
```

---

## Growth Agent

A standalone content + SEO/GEO system that is **completely separate from the chat backend** (it uses `GEMINI_API_KEY` / `GROWTH_OPENAI_API_KEY`, never the chat LLM path). It drafts articles, promotes them, syndicates them, audits the site, discovers high-intent topics, retrieves from an inbox-as-knowledge-base, and syncs GA4/GSC analytics. Publishing is always human-gated; an optional Auto Mode can pre-approve pending drafts (off by default) — the agent never publishes.

- **Morning cron — "Build with Reeturaj" daily plan** (`/api/growth/cron/morning`, `vercel.json` schedule `30 2 * * *` = 02:30 UTC = 08:00 IST): picks the next unbuilt topic from the founder's content calendar (`content/build-with-reeturaj-calendar.ts`), then drives ONE `runAgentTurn` that calls `write_article → promote_article → generate_cover` to produce three human-gated pending drafts (article + LinkedIn caption + cover) in a single stable "Build with Reeturaj — Daily Plan" thread. The calendar slug is passed to `write_article` so the draft is filed under `slugifyTitle(topic)` — that's what the picker matches, so the calendar advances one topic per day instead of re-drafting the same topic. The calendar fallback is **3-tier**: (1) the founder-authored calendar file → (2) founder-approved topics in the knowledge base (`type='topic'`, `status='approved'`, ordered by `intent_score DESC`) → (3) a free-plan `web_search` for a fresh trending topic when both are exhausted.
- **Agent loop** (`lib/growth/agent.ts` + `agentTools.ts`): Gemini function-calling with a bounded iteration cap (MAX_WORK=6 + MAX_RECOVERY=4, hard cap 10). The 17 tools are `list_recent_drafts`, `redraft_caption`, `review_text`, `generate_cover`, `list_inbox_folder`, `analyze_attachment`, `write_article`, `web_search`, `write_video_script`, `promote_article`, `save_knowledge`, `search_knowledge`, `list_knowledge`, `find_duplicate`, `find_high_intent_topics`, `read_analytics`, `sync_analytics`. (There is no `critique` tool — the critique pass runs *inside* `write_article`.) The loop recovers from two known Gemini failure modes — a malformed function call, and the model *narrating* a tool call in prose ("Called tool write_article(...)") instead of emitting a real `functionCall` — by nudging the model to actually invoke the tool. The morning cron surfaces the tool trail + an honest `ok` (the agent outcome, not a blanket true), so a zero-draft run is visible in the error feed, not buried as "success".
- **Daily SEO/GEO audit cron** (`/api/growth/cron/daily`, `17 6 * * *`): audits every authorized domain via sitemap discovery (`fetchSitemapUrls`), enqueues a human-gated LinkedIn promotion draft for each article. Accepts **GET** (Vercel's scheduled cron, `vercel-cron` user-agent / `x-vercel-cron-schedule` header) **and** POST (admin "Run now"); an optional `CRON_SECRET` covers external schedulers. `authorizeCron` is the single auth path (Vercel signature | `CRON_SECRET` | authenticated admin).
- **Auto Mode cron** (`/api/growth/auto?action=run`, `7,37 * * * *` — every 30 min): fills missing LinkedIn captions + covers for already-published articles and (when `autoApprove` is on, off by default) flips pending drafts to approved so they're ready for the founder's publish click. Never publishes. `autoApprove` is audited (`auto=true` in the action log) and stays off unless the founder turns it on in Settings.
- **Topic-discovery cron** (`/api/growth/cron/topic-discovery`, `23 3 * * 1` — weekly Monday 03:23 UTC): runs `find_high_intent_topics` across the InBharat portfolio (7 products), scoring candidate topics 0–100 across 12 dimensions (intent strength, InBharat relevance, product fit, founder authority, SEO/GEO opportunity, lead/follower potential, freshness, competition difficulty, source availability, risk level) and storing them in the knowledge base as `type='topic'` (`status='needs_review'` for high-risk regulated topics — medical/legal/patent/visa/finance). No fabricated search volume — intent is labeled "estimated". Uses Gemini `google_search` grounding (reuses `GEMINI_API_KEY`, no Serper key).
- **Analytics-sync cron** (`/api/growth/cron/analytics-sync`, `47 3 * * *` — daily 03:47 UTC): pulls GA4 totals + a top-pages dimension report + a GSC query report and writes them as `type='performance'` knowledge-base rows the agent retrieves before drafting. Honest about partial data — when the service account isn't a Viewer on the GA4 property / a Restricted user in Search Console (the default until the founder adds it), the sync records a partial-403 snapshot and the Performance page surfaces it as "GA4 data unavailable this window" instead of hiding behind a blank.
- **Promotion loop** (`lib/growth/promoter.ts`): generates a LinkedIn caption + 2–3 internal-link suggestions (budget-capped via `growth_model_usage`, redaction-gated before any model call, idempotent so re-runs only draft new articles). Captions end with the article's hashtags. `canPublishDirectly` is false and `requiresHumanApproval` is true — nothing auto-publishes.
- **Knowledge base** (`lib/growth/knowledge.ts` + `api/growth/knowledge.ts` + `pages/admin/growth/Knowledge.tsx`): the inbox-as-memory layer — sources, discovered topics, prior articles/posts, decisions, and performance signals the agent retrieves before drafting (FTS `tsvector` + token-Jaccard rerank, no pgvector). Cross-source dedupe by content-hash + token overlap (`find_duplicate`). The agent's `web_search` results, critiques, publishes, and outcomes all auto-save rows here; the founder reviews/approves in the Knowledge tab.
- **Syndication** (`lib/growth/syndication/` + `api/growth/syndicate.ts`): human-gated, per-article cross-posting of approved articles to **DEV.to** (draft, `api-key` header), **Hashnode** (live, GraphQL `publishPost`), and **Medium** (manual — API deprecated; surfaces the import URL + canonical-back). A local-Playwright submit path mirrors the LinkedIn flow: the "↗ local" button copies the body/canonical + the founder runs `scripts/syndicate-populate.ts` on their own machine (persistent logged-in profile) to pre-fill the editor and clicks Publish themselves — no API keys. No cron, no auto-publish. A secret-scanner runs over the body before any POST, so a leaked secret is never shipped to a third party.
- **Human gate**: an admin reviews pending drafts at `/admin/growth/issues` and approves/rejects via `/api/growth/approvals`. Publishing stays gated on `status='approved'` + admin auth; the agent never publishes. Auto Mode (above) can pre-approve pending drafts when explicitly turned on, but the publish click is still the founder's.
- **Token efficiency**: idempotency bounds total model calls; `maxOutputTokens` caps completions (article drafts use 8192 — a full article-as-JSON was right at the 4096 ceiling); sibling-link candidates are trimmed to 8 and category-ranked.

Authorization is deny-by-default (`lib/growth/authorization.ts`); only allow-listed domains may be crawled/audited/drafted.

### Admin dashboard (`/admin/growth`) — private, founder-only

A single private console for the founder to see **what's going on**, **which AI API is used where**, and **edit the monthly spend cap live**. Reachable only to the founder; the admin gate is **server-verified** (`api/lib/requireAdmin.ts` → `GROWTH_ADMIN_USER_IDS` env **or** Supabase `app_metadata.role === "admin"`), never a build-time client allowlist.

- **Overview** — live ops snapshot from `GET /api/growth/insights`: last cron run, pages audited, open issues, pending drafts, this-month spend vs cap, integration-health dots (booleans only — secret values never leave the server), a recent-activity feed, and a **"Run daily audit now"** button that POSTs the cron on demand.
- **Usage** (`GET /api/growth/usage?days=N`) — the centerpiece: this-month spend vs cap + projected + a live **budget editor** (`PATCH /api/growth/budget` → `growth_settings.monthly_budget_usd`, `$1–$500`, takes effect on the next `withinBudget()` check with **no redeploy**), a Gemini/OpenAI provider split, per-model / per-task / **where-used (per article)** tables, a 30-day spend bar chart, and a recent-calls table. `growth_model_usage` records `context_url` + `provider` so spend is attributable to the exact article and API.
- **Sites / Repos / Issues / Performance / Strategy / Learning / Rules / Inbox / Agent / Knowledge / Settings** — the management views, now using the authenticated `useAdminApi` helper (`lib/growth/adminApi.ts`) so their calls no longer 401. **Agent** is the conversational drafting surface (with a "Run morning plan now" button + per-thread tool trail); **Inbox** is the LinkedIn composer prefill + publish path; **Issues → Published tab** holds the per-article DEV.to/Hashnode/Medium cross-post UI (SyndicatePanel, with an API-key path + a local-Playwright "↗ local" path); **Knowledge** is the inbox-as-knowledge-base browser (search/filter/approve discovered topics/mark outdated); **Rules** is the live-editable expert-CMO rule set; **Settings** shows live integration flags + the confirmed admin identity from `GET /api/growth/whoami`.

Admin routes ship as prebuilt **noindex** shells (so the SPA boots and the `/admin/growth` 404 is fixed) and are **excluded from `sitemap.xml`** — verified by `scripts/verify-shell-crawl.ts`. The `20260625000001_growth_usage_context.sql` migration adds the `context_url`/`provider` columns and the `growth_settings` singleton table (RLS deny-all, service_role only).

---

## Authentication (Supabase)

- Sign in with email/password (and optionally Google).
- Browser sends `Authorization: Bearer <access_token>` to `/api/*`.
- Serverless routes verify tokens using `SUPABASE_SERVICE_ROLE_KEY` (server-only).

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Links

- **Repository:** [github.com/inbharatai/Inbharat.ai](https://github.com/inbharatai/Inbharat.ai)
- **Live site:** [www.inbharat.ai](https://www.inbharat.ai) (apex `inbharat.ai` 308→www)
- **Learn AI hub:** [www.inbharat.ai/learn-ai-with-reeturaj](https://www.inbharat.ai/learn-ai-with-reeturaj)
- **Contact:** [www.inbharat.ai/contact](https://www.inbharat.ai/contact)
- **Supabase:** [supabase.com](https://supabase.com)
- **OpenAI:** [platform.openai.com](https://platform.openai.com)