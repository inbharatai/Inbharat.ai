# InBharat (Bharat.ai) — Authentication

This document describes how authentication works in InBharat: **email/password** sign-in, **email verification links**, **password reset links**, and how everything is wired to **Supabase**.

---

## 1. Overview

- **Provider:** [Supabase Auth](https://supabase.com/docs/guides/auth).
- **Methods used:** Email + password (sign up, sign in, forgot password). Optional Google can be enabled in Supabase; the app’s UI is built for email/password.
- **Session:** Stored by the Supabase JS client (e.g. localStorage). The app reads it via `supabase.auth.getSession()` and reacts to changes with `onAuthStateChange`.
- **Protected APIs:** Serverless routes (Vercel) verify the user by validating the Supabase JWT (Bearer token) using the Supabase service role client.

---

## 2. Client-side setup

### 2.1 Supabase client (`lib/supabaseClient.ts`)

- Creates the browser Supabase client with:
  - `VITE_SUPABASE_URL` — Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon (public) key
- If either env var is missing, `isSupabaseConfigured` is false; the app still runs but auth and Supabase-backed features (e.g. persisted chats) are effectively disabled.
- A one-time console warning is shown in the browser when Supabase env is missing.

### 2.2 Auth context (`lib/auth.tsx`)

- **AuthProvider** wraps the app (in `index.tsx`) and:
  - On mount, calls `supabase.auth.getSession()` and sets session state.
  - Subscribes to `supabase.auth.onAuthStateChange()` so that sign-in, sign-out, and token refresh update the UI.
- **useAuth()** exposes:
  - `session`, `user`, `loading`, `isSignedIn`, `accessToken`, `signOut`.
- `accessToken` is the Supabase JWT sent to API routes as `Authorization: Bearer <token>`.

### 2.3 App entry and routes (`index.tsx`)

- **AuthProvider** wraps **BrowserRouter** and routes.
- Routes:
  - `/` → Landing
  - `/app` → Main app (chat UI; auth is optional for guest usage)
  - `*` → redirect to `/`

No dedicated “auth callback” route is defined: **email confirmation and password-reset links** redirect to the same app URL (e.g. `https://inbharat.ai/app` or `http://localhost:5173/app`). The Supabase client automatically reads the token from the URL hash and establishes the session; `onAuthStateChange` then updates the auth context.

---

## 3. Sign-in, sign-up, and “via link” flows

All of these are implemented in **`components/AuthPanel.tsx`**, which can be shown as a full panel or as a modal (when used with `onSuccess` in the main app).

### 3.1 Sign in (email + password)

- User enters email and password and submits.
- Code calls `supabase.auth.signInWithPassword({ email, password })`.
- On success, the session is set by Supabase; `onAuthStateChange` runs and the UI shows the user as signed in. Optional `onSuccess()` (e.g. close modal) is called.

### 3.2 Sign up (email + password)

- User enters email and password (min 6 characters) and submits.
- Code calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`.
  - `emailRedirectTo` is set to `window.location.origin + '/app'` so that **verification and password reset emails** link back to `/app`.
- Two outcomes:
  - **If Supabase returns a session immediately** (e.g. email confirmation disabled): user is considered signed in; `onSuccess()` is called.
  - **If Supabase requires email confirmation:** user sees a message to check email and click the **verification link**. That link points to the app (e.g. `.../app#access_token=...&type=signup`). When the user opens it, the Supabase client parses the hash, sets the session, and `onAuthStateChange` fires — so the user ends up signed in on that tab.

So “**via link**” here means: **email verification link** and **password reset link**; both redirect to `/app` and the client finishes auth by reading the token from the URL.

### 3.3 Forgot password (reset via link)

- User switches to “Reset” in AuthPanel, enters email, and submits.
- Code calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })` with `redirectTo = window.location.origin + '/app'`.
- Supabase sends an email with a link to that URL with a token in the hash. When the user clicks it, the app loads at `/app`, Supabase client exchanges the hash for a session (and may prompt to set a new password in Supabase’s flow if configured). Again, no separate callback route is needed; the same `/app` page handles it.

---

## 4. Where auth is used in the app

- **App.tsx:** Uses `useAuth()` for `isSignedIn`, `user`, `loading`, `signOut`; shows sign-in prompt after a few guest messages; opens AuthPanel in a modal for sign-in/sign-up.
- **Chat persistence:** When signed in, chat sessions and messages are stored in Supabase (RLS) keyed by `user.id`; when not signed in, a guest session exists only in memory.
- **API calls:** The chat service and other callers send the Supabase JWT in the `Authorization` header. Example: `services/openaiService.ts` gets the token via `supabase.auth.getSession()` and passes it to `/api/chat` (and similar). **NewsFeed** uses `accessToken` from `useAuth()` for `/api/news`.

---

## 5. Supabase dashboard configuration

To have “via email” and “via link” work correctly, Supabase must be configured as follows.

### 5.1 Authentication → Providers

- Enable **Email** (email/password and email confirmation).
- Optionally enable **Google** and configure OAuth; the app’s AuthPanel does not include a Google button by default, but the backend supports it if you add the UI.

### 5.2 Authentication → URL configuration

- **Site URL:** Your main app origin (e.g. `https://inbharat.ai`).
- **Redirect URLs:** Add every URL where the app can load after a link click (so Supabase allows those redirects). For example:
  - `https://inbharat.ai/app`
  - `https://YOUR_VERCEL_APP.vercel.app/app`
  - `http://localhost:5173/app` (or your local dev port)

If the redirect URL is not allowlisted, Supabase will reject the redirect and the “via link” flows will fail.

### 5.3 API keys

- **Browser (client):** Use **anon public** key in `VITE_SUPABASE_ANON_KEY`; safe to expose.
- **Server (Vercel):** Use **service_role** key in `SUPABASE_SERVICE_ROLE_KEY`; never expose to the client. Used only in serverless API routes to verify JWTs.

---

## 6. Server-side verification (connection to Supabase)

- **Admin client:** `api/lib/supabaseAdmin.ts` creates a Supabase client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and disables session persistence (used only for server-side checks).
- **Verification helpers:** `api/lib/verifySupabaseUser.ts`:
  - **verifySupabaseUser(req):** Reads `Authorization: Bearer <token>` from the request, calls `supabaseAdmin.auth.getUser(token)`. Returns either the user id or 401/500. Used by routes that **require** a signed-in user (e.g. `/api/news`, `/api/tts`, `/api/transcribe`).
  - **verifySupabaseUserOptional(req):** Same token read and validation, but if missing or invalid returns “guest” (no user id) instead of 401. Used by `/api/chat` and `/api/search` so that guests can still use chat/search; when a valid token is present, the backend can associate data with that user.

So the “connection” to Supabase on the server is: **every protected or optionally protected API route** uses these helpers, which in turn use the **service role** Supabase client to validate the JWT that the browser obtained from Supabase Auth (via sign-in or via the email/link flows).

---

## 7. Summary table

| Step / Flow              | Where it happens              | Supabase usage / link |
|--------------------------|-------------------------------|------------------------|
| App load                 | `AuthProvider` in `lib/auth.tsx` | `getSession()` + `onAuthStateChange()` |
| Sign in (email/password) | `AuthPanel.tsx`               | `signInWithPassword()` |
| Sign up (email/password) | `AuthPanel.tsx`               | `signUp()` with `emailRedirectTo: origin + '/app'` |
| Email verification link  | User clicks link → opens `/app` | Client reads hash; session set automatically; redirect URL must be in Supabase redirect list |
| Forgot password          | `AuthPanel.tsx`               | `resetPasswordForEmail()` with `redirectTo: origin + '/app'` |
| Password reset link      | User clicks link → opens `/app` | Same as verification: hash parsed by client; redirect URL must be allowlisted |
| API auth                 | `api/*.ts`                    | `verifySupabaseUser` or `verifySupabaseUserOptional` → `supabaseAdmin.auth.getUser(token)` |
| Env (client)             | `.env` / Vercel               | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Env (server)             | Vercel / serverless           | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

For deployment details (including Supabase project URL, migration, and env vars), see **DEPLOY-STEPS.md** and **DOCS.md**.
