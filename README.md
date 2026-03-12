# InBharat AI — Desh Ka AI

<div align="center">

**AI Intelligence for Bharat**

Agentic search, voice-first interaction, and multilingual AI — built for every Indian.

[![License: MIT](https://img.shields.io/badge/License-MIT-138808.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev/)

</div>

---

## Overview

**InBharat AI** is a world-class, agentic AI search and chat experience tailored for Bharat and the world. It combines:

- **Multi-mode agents** — Research, Creative, Coder, Educator, Browser, Executive, Shopper, and standard Nexus
- **Voice-first** — Speak in the search bar, listen to replies (TTS), and full Live voice conversation
- **Indian languages** — Hindi, Tamil, Telugu, and more, plus English
- **Image context** — Upload images and get answers; Creative mode supports image generation
- **Auth** — Supabase Auth (email/password + optional Google)

Part of the **InBharat** ecosystem alongside [UniAssist.ai](https://www.uniassist.ai) (education) and **UniBot** (WhatsApp).

---

## Features

| Feature | Description |
|--------|-------------|
| **Agent modes** | Standard (Nexus), Research, Creative, Coder, Educator, Browser, Executive, Shopper |
| **Voice** | Mic input (speak-to-type), TTS on replies, full Live voice mode |
| **Languages** | English + Indian languages (Hindi, Tamil, Telugu, etc.) |
| **Images** | Upload from omnibox; image generation in Creative mode |
| **Auth** | Supabase Auth (email/password + optional Google) |
| **Landing** | Product cards for InBharat AI, UniAssist.ai, UniBot with clear CTAs |

---

## Quick start

### Prerequisites

- **Node.js** 18+ (20+ recommended)

### 1. Clone and install

```bash
git clone https://github.com/inbharatai/Inbharat.ai.git
cd Inbharat.ai
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (see [Environment variables](#environment-variables) for details):

```env
# Required for chat + voice (server-side only; do not expose in browser)
OPENAI_API_KEY=sk-...

# Required for auth (Supabase client)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=ey...

# Required for auth verification (server)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...

# Optional: web search (Serper)
SERPER_API_KEY=...
```

### 3. Run

```bash
npx vercel login
npx vercel link
npm run dev
```

Open the URL shown (e.g. `http://localhost:3003`). Sign in to use the app (Supabase session secures `/api/*`).

If you can’t (or don’t want to) use Vercel CLI locally, you can run UI-only:

```bash
npm run dev:vite
```

Note: in UI-only mode, `/api/*` won’t run locally.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev using `vercel dev` (runs `/api/*` too) |
| `npm run dev:vite` | Start Vite only (UI only; `/api/*` will 404) |
| `npm run build` | Production build (`dist/`) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint (zero warnings required) |

### Quick check (Production & Preview)

After deploying to Vercel, confirm static assets are public:

- **`/favicon.png`** (or `/favicon.ico`) should return **200** on both your production domain (e.g. `https://inbharat.ai`) and the preview domain (e.g. `https://inbharat-xxx.vercel.app`). If you see 401, ensure Deployment Protection is disabled for Preview (Vercel → Project → Settings → Deployment Protection).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI API key (server-side) for chat, TTS, and STT. Set in Vercel env (do not expose in browser). |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL for browser auth. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key for browser auth. |
| `SUPABASE_URL` | Yes | Supabase project URL for serverless auth verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only). |
| `SERPER_API_KEY` | No | [Serper](https://serper.dev) for web search in Research mode. |

\* App runs without keys but shows warnings and disables dependent features (e.g. chat/voice without OpenAI).

---

## Project structure

```
├── App.tsx              # Main app: chat, sessions, modes, auth gate
├── index.tsx            # Entry: AuthProvider (Supabase), router, / and /app
├── index.html           # HTML shell
├── index.css            # Global + product-card styles
├── types.ts             # AgentMode, ViewMode, Message, widgets, etc.
├── services/
│   └── openaiService.ts # NexusAgent: chat, TTS, STT, image, tools
├── lib/
│   ├── auth.tsx          # Supabase auth context
│   └── supabaseClient.ts # Supabase client (anon)
├── components/
│   ├── Omnibox.tsx      # Search bar, mode picker, mic, image upload
│   ├── ChatView.tsx     # Message list, sources, follow-ups, widgets
│   ├── LiveConversation.tsx  # Full voice conversation
│   ├── Sidebar.tsx      # Sessions, new chat, discover
│   ├── NewsFeed.tsx     # Discover feed
│   ├── SourceCard.tsx   # Source link cards
│   ├── AgentWidgets.tsx # Calendar, email, PPTX, shopping widgets
│   └── TricolourStar.tsx# InBharat logo
├── pages/
│   └── Landing.tsx      # Landing: hero, product cards, sections
└── public/              # Static assets (logos, etc.)
```

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
- **UniAssist.ai:** [uniassist.ai](https://www.uniassist.ai)
- **Supabase:** [supabase.com](https://supabase.com)
- **OpenAI:** [platform.openai.com](https://platform.openai.com)
