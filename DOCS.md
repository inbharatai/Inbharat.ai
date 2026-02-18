# InBharat AI — Documentation & Notes

This document is for maintainers and contributors: architecture, configuration, and operations.

---

## Architecture overview

- **Frontend:** Single-page app (React 19, TypeScript, Vite 6). Routes: `/` (Landing), `/app` (main AI app).
- **Auth:** [Clerk](https://clerk.com). Optional: app is usable without sign-in; register prompt after N messages.
- **AI:** OpenAI API (chat, TTS, STT, image) via `openaiService.ts` (NexusAgent). Optional Serper for web search in Research mode.
- **State:** React state + `localStorage` for sessions and anonymous message count.

---

## API routes (serverless)

- **`/api/search`** — Serper web search proxy. `POST` with body `{ q: string }` (zod-validated). Uses `SERPER_API_KEY`; returns `{ organic, ... }` or 503 if key missing; 429 if rate limited; 502 on upstream failure (with retries). Request ID and structured logging. Never exposes keys.
- **`/api/news`** — Serper news proxy. `GET`/`POST` with optional `q`. Same env and rate limit; returns `{ articles }` or 200 with empty articles on error.
- **`/api/health`** — `GET` only. Returns `{ ok, version, env: { SERPER, OPENAI }, openaiReachable? }`. Use for observability; does not leak secrets.

All API routes run on Node (Vercel serverless); keys stay server-side.

---

## Environment variables (reference)

| Variable | Where used | Notes |
|----------|------------|--------|
| `OPENAI_API_KEY` | Server (Vercel `/api/*`) | Chat, TTS, STT. Do not expose in browser. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser | Clerk publishable key. Required for sign-in/sign-up. |
| `SERPER_API_KEY` | Server only (Vercel env) | **Do not** use `VITE_SERPER_API_KEY`. Set in Vercel → Project → Settings → Environment Variables (Production and Preview). Required for `/api/search` and `/api/news` to return live results. |

For local dev with search and news, use **`vercel dev`** so `/api/search` and `/api/news` run locally with your env.

---

## Clerk & Google OAuth setup

### Clerk Dashboard

1. [dashboard.clerk.com](https://dashboard.clerk.com) → your application.
2. **User & Authentication → Email, Phone, Username:** Enable **Email** and/or **Google** as desired; disable **Phone** if you don’t want phone sign-in.
3. **Paths / Domains:** Add dev and prod URLs, e.g. `http://localhost:3003`, `https://yourdomain.com`. Add the same to **Allowed redirect URLs** if present.

### Google (for “Continue with Google”)

1. [Google Cloud Console](https://console.cloud.google.com) → your project → **APIs & Services → Credentials** → OAuth 2.0 Client ID (Web).
2. **Authorized JavaScript origins:** Add `http://localhost:3003` and `https://yourdomain.com`.
3. **Authorized redirect URIs:** Add the exact redirect URI Clerk provides (e.g. `https://<your-clerk-domain>.clerk.accounts.dev/v1/oauth_callback`).
4. In Clerk, connect this OAuth client in **Social connections → Google**.

Without these, sign-in may fail on localhost or production.

### Fixing 500 / "Serverless Function has crashed" on email sign-in

If users see **500: INTERNAL_SERVER_ERROR** or "This Serverless Function has crashed" on `*.accounts.dev` when signing in with **email**, the failure is in **Clerk’s** infrastructure. Fix it in the Clerk Dashboard:

1. **Configure Email (required for email sign-in)**  
   - Go to [Clerk Dashboard](https://dashboard.clerk.com) → your application.  
   - **User & Authentication → Email, Phone, Username** → ensure **Email** is enabled.  
   - **Email** → set up delivery:
     - **Development:** Clerk’s built-in email often works; confirm it’s enabled.  
     - **Production:** Add a custom **SMTP** provider or use Clerk’s production email (if available for your plan). Without a valid sender, magic links / verification can fail and Clerk may return 500.

2. **Domains and redirects**  
   - **Paths / Domains** (or **Allowed redirect URLs**): include your live site, e.g. `https://inbharat.ai` and `https://www.inbharat.ai`, plus `https://inbharat.ai/app` if users land there.  
   - Mismatched or missing production URLs can cause redirect or backend errors.

3. **Key environment**  
   - Use the **Production** publishable key (`pk_live_...`) in Vercel env for `https://inbharat.ai`.  
   - If you use a **Development** key (`pk_test_...`) in production, switch to the production key and redeploy.

4. **Clerk status and logs**  
   - Check [status.clerk.com](https://status.clerk.com) for incidents.  
   - In the Dashboard, open **Logs** (or **Activity**) and retry sign-in to see the exact error for the 500.

After changing Clerk settings, wait a minute and try again; no app redeploy is needed for Dashboard-only changes.

---

## Register prompt (anonymous → account)

- Anonymous message count is stored in `localStorage` under `inbharat_anon_message_count`.
- After `REGISTER_PROMPT_THRESHOLD` (default 6) user messages, a modal suggests signing up.
- “Maybe later” sets `inbharat_register_prompt_dismissed` so the modal is not shown again (until storage is cleared).
- Constants: `App.tsx` → `REGISTER_PROMPT_THRESHOLD`, `ANON_MESSAGE_COUNT_KEY`, `REGISTER_DISMISS_KEY`.

---

## Build & deploy

- **Build:** `npm run build` → `dist/`. Serve `dist/` with any static host (Vercel, Netlify, GitHub Pages, etc.).
- **Env in production:** Set `OPENAI_API_KEY` (server-side) and `VITE_CLERK_PUBLISHABLE_KEY` in the host’s environment and redeploy.
- **Clerk:** Add your production URL to Clerk’s allowed origins and redirect URLs.
- **Google:** Add production origin and redirect URI in the OAuth client.

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
