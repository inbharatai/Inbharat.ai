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
- **12-product ecosystem** — InBharat AI + 11 sister products (KathaKitaab, JAK Swarm, Phoring, Agent Arcade, Sahaayak AI, SahaayakSeva, UniAssist.ai, TestsPrep.in, UniBot, SocialFlow, OpenClawFix) showcased on the landing page
- **"Learn AI with Reeturaj" hub** — 12 flagship practical-AI articles (of a 79-piece series) with world-class SEO/GEO/AI-citation shells
- **Growth Agent** — a sitemap-driven SEO/GEO auditor + human-gated LinkedIn promotion loop for the articles

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
| **Growth Agent** | Daily cron audits authorized domains via sitemap discovery + enqueues human-gated LinkedIn promotion drafts (admin review at `/admin/growth`) |

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
| `npm run build` | `vite build && tsx scripts/build-seo.ts` — emits `dist/` + per-route SEO shells + sitemap + OG image |
| `npm run build:seo` | Re-run only the SEO shell generator over the existing `dist/` |
| `npm run preview` | Preview the production build locally (`vite preview`, :4173) |
| `npm run lint` | ESLint, zero warnings required (the project gate) |
| `npm run test:growth` | Hermetic Growth Agent unit checks (auth, redaction, crawler, auditor, promoter) |
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
| `GROWTH_MONTHLY_BUDGET_USD` | No | Growth Agent monthly model spend cap (default 20). |
| `GROWTH_ADMIN_USER_IDS` | Admin | Comma-separated Supabase user ids allowed to view `/admin/growth`. |
| `CRON_SECRET` | Cron | Shared secret Vercel cron sends to authenticate `/api/growth/cron/daily`. |
| `VITE_SUPABASE_URL` | Auth | Supabase project URL for browser auth. |
| `VITE_SUPABASE_ANON_KEY` | Auth | Supabase anon key for browser auth. |
| `SUPABASE_URL` | Auth | Supabase project URL for serverless auth verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth | Supabase service role key (server-only). |
| `VITE_GA_ID` | No | GA4 Measurement ID (e.g. `G-XXXX`) baked into every SEO shell. |
| `GSC_SITE_VERIFICATION` | No | Google Search Console verification token (baked into the home shell). |
| `SERPER_API_KEY` | No | [Serper](https://serper.dev) for web search in Research mode. |

\* Chat runs without `OPENAI_API_KEY` but shows warnings and disables chat/voice. The Growth Agent is fully separate and never uses the chat key.

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
│   ├── articles.meta.ts   # ArticleMeta[] (body-free, isomorphic) for 12 flagship articles
│   ├── articles.body.ts   # Lazy loadArticleBody() via import.meta.glob('?raw')
│   ├── article-schema.ts  # TechArticle + FAQPage + BreadcrumbList JSON-LD builders
│   └── articles/*.md      # The 12 article markdown bodies
├── services/
│   └── openaiService.ts   # NexusAgent: chat, TTS, STT, image, tools (chat backend — do not mix with Growth Agent)
├── lib/
│   ├── auth.tsx           # Supabase auth context
│   ├── useDocumentHead.ts # Syncs per-route SEO head + JSON-LD client-side
│   ├── analytics.ts       # GA4 gtag helpers (deduped page views)
│   └── growth/            # Growth Agent: crawler, auditor, promoter, model-router, authorization, redaction
├── api/
│   ├── chat.ts            # Chat endpoint (chat backend)
│   ├── lib/serverLLM.ts   # Chat LLM selection (chat backend)
│   └── growth/            # Growth Agent endpoints: audit, promote, approvals, cron/daily
├── scripts/
│   ├── build-seo.ts       # Build-time per-route HTML shells + sitemap + OG image + baked article bodies
│   ├── test-growth.ts     # Hermetic Growth Agent unit checks
│   └── verify-shell-crawl.ts  # Accuracy check: crawler/auditor over built shells
├── components/            # Omnibox, ChatView, LiveConversation, Sidebar, NewsFeed, SourceCard, AgentWidgets, TricolourStar
├── pages/
│   ├── Landing.tsx        # Landing: hero, 12-product grid, sections (PRODUCT_DEFS)
│   ├── LearnAIWithReeturaj.tsx  # Article hub (searchable grid)
│   ├── ArticlePage.tsx    # Per-article reading page (lazy)
│   └── admin/growth/      # Growth Agent admin UI (Issues, Repos)
├── locales/               # 10 Indian-language + English i18n bundles
└── public/                # Static assets (logos, per-article visuals)
```

---

## Growth Agent

A standalone SEO/GEO auditing + content-promotion system that is **completely separate from the chat backend** (it uses `GEMINI_API_KEY` / `GROWTH_OPENAI_API_KEY`, never the chat LLM path).

- **Daily cron** (`/api/growth/cron/daily`, scheduled in `vercel.json`) audits every authorized domain via sitemap discovery (`fetchSitemapUrls`), then enqueues a human-gated LinkedIn promotion draft for each "Learn AI with Reeturaj" article.
- **Promotion loop** (`lib/growth/promoter.ts`): generates a LinkedIn caption + 2–3 internal-link suggestions (budget-capped via `growth_model_usage`, redaction-gated before any model call, idempotent so re-runs only draft new articles). `canPublishDirectly` is false and `requiresHumanApproval` is true — nothing auto-publishes.
- **Human gate**: an admin reviews pending drafts at `/admin/growth/issues` and approves/rejects via `/api/growth/approvals`.
- **Token efficiency**: idempotency bounds total model calls to one per article; `maxOutputTokens` caps completions; the sibling-link candidate list is trimmed to 8 and category-ranked.

Authorization is deny-by-default (`lib/growth/authorization.ts`); only allow-listed domains may be crawled/audited/drafted.

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
- **Live site:** [inbharat.ai](https://inbharat.ai)
- **Learn AI hub:** [inbharat.ai/learn-ai-with-reeturaj](https://inbharat.ai/learn-ai-with-reeturaj)
- **Supabase:** [supabase.com](https://supabase.com)
- **OpenAI:** [platform.openai.com](https://platform.openai.com)