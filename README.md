# InBharat AI — Desh Ka AI

<div align="center">

**Sovereign Intelligence for Bharat**

Agentic search, voice-first interaction, and multilingual AI — built for every Indian.

[![License: MIT](https://img.shields.io/badge/License-MIT-138808.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev/)

</div>

---

## Overview

**InBharat AI** is a world-class, agentic AI search and chat experience tailored for Bharat and the world. Use it **free** without signing in; create an account to save your chats and use InBharat on any device. It combines:

- **Multi-mode agents** — Research, Creative, Coder, Educator, Browser, Executive, Shopper, and standard Nexus
- **Voice-first** — Speak in the search bar, listen to replies (TTS), and full Live voice conversation
- **Indian languages** — Hindi, Tamil, Telugu, and more, plus English
- **Image context** — Upload images and get answers; Creative mode supports image generation
- **Optional auth** — Sign in with Email or Google (Clerk); try first, register when you’re ready

Part of the **InBharat** ecosystem alongside [UniAssist.ai](https://www.uniassist.ai) (education) and **UniBot** (WhatsApp).

---

## Features

| Feature | Description |
|--------|-------------|
| **Agent modes** | Standard (Nexus), Research, Creative, Coder, Educator, Browser, Executive, Shopper |
| **Voice** | Mic input (speak-to-type), TTS on replies, full Live voice mode |
| **Languages** | English + Indian languages (Hindi, Tamil, Telugu, etc.) |
| **Images** | Upload from omnibox; image generation in Creative mode |
| **Auth** | Optional sign-in (Clerk). Use free; register after a few chats to save history |
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

# Required for optional sign-in (Email / Google)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Optional: web search (Serper)
SERPER_API_KEY=...
```

### 3. Run

```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:3003`). Use the app without signing in, or sign in to save chats.

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
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes* | Clerk publishable key for sign-in/sign-up. From [dashboard.clerk.com](https://dashboard.clerk.com). |
| `SERPER_API_KEY` | No | [Serper](https://serper.dev) for web search in Research mode. |

\* App runs without keys but shows warnings and disables dependent features (e.g. chat/voice without OpenAI).

---

## Project structure

```
├── App.tsx              # Main app: chat, sessions, modes, auth banner, register prompt
├── index.tsx            # Entry: ClerkProvider, router, / and /app
├── index.html           # HTML shell
├── index.css            # Global + product-card styles
├── types.ts             # AgentMode, ViewMode, Message, widgets, etc.
├── services/
│   └── openaiService.ts # NexusAgent: chat, TTS, STT, image, tools
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

## Authentication (Clerk)

- **Use without sign-in** — Full app is available; chats are stored in browser storage.
- **Sign in** — Header and banner offer “Sign in” (Clerk modal). Use Email or Google if enabled in your [Clerk Dashboard](https://dashboard.clerk.com).
- **Register prompt** — After a few chats (default: 6 messages), a modal suggests creating an account to keep history; users can choose “Maybe later”.

For **Google / Gmail** sign-in: enable Google in Clerk and add your dev/production URLs (including `http://localhost:PORT`) in [Clerk](https://dashboard.clerk.com) and in [Google Cloud Console](https://console.cloud.google.com) (OAuth client authorized origins and redirect URIs). See [DOCS.md](DOCS.md#clerk--google-oauth-setup).

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Links

- **Repository:** [github.com/inbharatai/Inbharat.ai](https://github.com/inbharatai/Inbharat.ai)
- **UniAssist.ai:** [uniassist.ai](https://www.uniassist.ai)
- **Clerk:** [clerk.com](https://clerk.com) · [Dashboard](https://dashboard.clerk.com)
- **OpenAI:** [platform.openai.com](https://platform.openai.com)
