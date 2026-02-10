# InBharat AI — Documentation & Notes

This document is for maintainers and contributors: architecture, configuration, and operations.

---

## Architecture overview

- **Frontend:** Single-page app (React 19, TypeScript, Vite 6). Routes: `/` (Landing), `/app` (main AI app).
- **Auth:** [Clerk](https://clerk.com). Optional: app is usable without sign-in; register prompt after N messages.
- **AI:** OpenAI API (chat, TTS, STT, image) via `openaiService.ts` (NexusAgent). Optional Serper for web search in Research mode.
- **State:** React state + `localStorage` for sessions and anonymous message count.

---

## Environment variables (reference)

| Variable | Where used | Notes |
|----------|------------|--------|
| `VITE_OPENAI_API_KEY` | Browser (Vite exposes `VITE_*`) | Chat, TTS, STT, image. Required for core AI. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser | Clerk publishable key. Required for sign-in/sign-up. |
| `SERPER_API_KEY` | Backend / server* | If you add a small proxy for Serper, use server-side only. |

\* Current code may use Serper from client; keep keys safe and consider a server proxy for production.

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

---

## Register prompt (anonymous → account)

- Anonymous message count is stored in `localStorage` under `inbharat_anon_message_count`.
- After `REGISTER_PROMPT_THRESHOLD` (default 6) user messages, a modal suggests signing up.
- “Maybe later” sets `inbharat_register_prompt_dismissed` so the modal is not shown again (until storage is cleared).
- Constants: `App.tsx` → `REGISTER_PROMPT_THRESHOLD`, `ANON_MESSAGE_COUNT_KEY`, `REGISTER_DISMISS_KEY`.

---

## Build & deploy

- **Build:** `npm run build` → `dist/`. Serve `dist/` with any static host (Vercel, Netlify, GitHub Pages, etc.).
- **Env in production:** Set `VITE_OPENAI_API_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` in the host’s environment so they are baked into the client bundle at build time.
- **Clerk:** Add your production URL to Clerk’s allowed origins and redirect URLs.
- **Google:** Add production origin and redirect URI in the OAuth client.

---

## Linting

- ESLint + TypeScript + React. Run: `npm run lint`. CI should enforce zero warnings.

---

## License

MIT. See [LICENSE](LICENSE).
