# InBharat AI — Documentation & Notes

This document is for maintainers and contributors: architecture, configuration, and operations.

---

## Architecture overview

- **Frontend:** Single-page app (React 19, TypeScript, Vite 6). Routes: `/` (Landing), `/app` (main AI app).
- **Auth:** Supabase Auth (email/password + optional Google). Session is required to call protected `/api/*` routes.
- **AI:** OpenAI API (chat, TTS, STT, image) via `openaiService.ts` (NexusAgent). Optional Serper for web search in Research mode.
- **State:** React state. Signed-in users: chat sessions and messages are stored in Supabase Postgres (`chat_sessions`, `chat_messages`) with RLS. Signed-out users have no persisted chat.

---

## Chat storage (Supabase)

When a user is signed in, chat sessions and messages are persisted in the Supabase project. Run the migration once per project:

- In Supabase Dashboard → **SQL Editor**, run the SQL in `supabase/migrations/20250219000000_chat_sessions_messages.sql` (creates `chat_sessions`, `chat_messages`, RLS, and triggers).

The app uses the anon key and RLS; no server-side DB writes. Load on sign-in, create/append via `lib/chatStorage.ts`.

---

## API routes (serverless)

- **`/api/search`** — Serper web search proxy (protected). Requires `Authorization: Bearer <supabase_access_token>`.
- **`/api/news`** — Serper news proxy (protected). Requires `Authorization: Bearer <supabase_access_token>`.
- **`/api/chat`**, **`/api/tts`**, **`/api/transcribe`** — OpenAI routes (protected). No OpenAI calls from the browser.
- **`/api/health`** — `GET` only. Returns `{ ok, version, env: { ... } }`. Use for observability; does not leak secrets.

All API routes run on Node (Vercel serverless); keys stay server-side.

---

## Environment variables (reference)

| Variable | Where used | Notes |
|----------|------------|--------|
| `OPENAI_API_KEY` | Server (Vercel `/api/*`) | Chat, TTS, STT. Do not expose in browser. |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL (anon / public). Safe to expose. |
| `VITE_SUPABASE_ANON_KEY` | Browser | Supabase anon key (public). Safe to expose. |
| `SUPABASE_URL` | Server | Same as Supabase project URL, but read server-side. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role key (secret). Used to verify JWTs; never expose to browser. |
| `SERPER_API_KEY` | Server only (Vercel env) | **Do not** use `VITE_SERPER_API_KEY`. Set in Vercel → Project → Settings → Environment Variables (Production and Preview). Required for `/api/search` and `/api/news` to return live results. |

For local dev with search and news, use **`vercel dev`** so `/api/search` and `/api/news` run locally with your env.

If `vercel dev` fails with “No existing credentials found”, run:

- `npx vercel login`
- `npx vercel link`

---

## Supabase Auth setup

1. Supabase Dashboard → **Authentication → Providers**: enable **Email** (and optionally **Google**).
2. Supabase Dashboard → **Authentication → URL Configuration**:
   - Set Site URL to your production domain (e.g. `https://www.inbharat.ai`).
   - Add redirect URLs for local dev (e.g. `http://localhost:3003/app`) and production (`https://www.inbharat.ai/app`).
3. Vercel env:
   - Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Build & deploy

- **Build:** `npm run build` → `dist/`. Serve `dist/` with any static host (Vercel, Netlify, GitHub Pages, etc.).
- **Env in production:** Set Supabase + OpenAI env vars in Vercel and redeploy.

### Vercel: 500 on /api/search or 401 on /favicon.png

- **500 “Cannot find module api/_lib/requestId”:** The app no longer uses `api/_lib`; requestId and rate limit are inlined in `api/search.ts` and `api/news.ts`. Ensure the **latest commit** is deployed (Vercel → Deployments → trigger redeploy from latest commit if needed).
- **401 on /favicon.png (preview):** The app has no middleware. If preview URLs still return 401 for static assets, turn off **Deployment Protection** for Preview: Vercel → Project → **Settings** → **Deployment Protection** → set “Vercel Authentication” / “Password Protection” for **Preview** to **Disabled** (or allow public access for the preview URL).

---

## Linting and tests

- **Lint:** `npm run lint`. ESLint + TypeScript + React; zero warnings.
- **E2E:** `npm run test:e2e`. Playwright: home + favicon, static assets (no 401), chat page load (mocked API), settings panel. Run `npx playwright install chromium` once before first test.

---

## Production hardening (summary)

- **Static assets:** `vercel.json` rewrites only `/` and `/app` to `index.html`; favicon, `robots.txt`, `*.png`, etc. are served from `dist/` and never hit auth. Root `middleware.ts` matcher excludes all real routes so middleware never runs (no 401 on static).
- **Health:** `GET /api/health` for uptime checks; optional OpenAI reachability check.
- **APIs:** Zod validation, timeouts, retries (search), IP rate limit, request IDs, no secrets in responses.
- **UI:** Copy / Regenerate / Retry / Stop, offline banner, export chat as `.txt`, voice settings (speech rate, auto-read, push-to-talk), TTS Stop speaking.
- **Security:** CSP and safe headers in `vercel.json`; no secrets in client (use server env only for API keys).

---

## License

MIT. See [LICENSE](LICENSE).
