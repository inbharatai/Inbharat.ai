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

No dedicated “auth callback” route is defined: **email confirmation and password-reset links** redirect to the same app URL (e.g. `https://www.inbharat.ai/app` or `http://localhost:5173/app`). The Supabase client automatically reads the token from the URL hash and establishes the session; `onAuthStateChange` then updates the auth context.

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

### 3.3 Magic link (passwordless)

- User selects **Magic link**, enters only their **email**, and submits.
- Code calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })`.
- Supabase sends an email with a magic link. When the user clicks it, they are redirected to `/app` and signed in automatically. No password is required. If the email is not yet registered, Supabase can create the user when they click the link (default behavior).

### 3.4 Forgot password (reset via link)

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

- **Site URL:** Your main app origin (e.g. `https://www.inbharat.ai`).
- **Redirect URLs:** Add every URL where the app can load after a link click (so Supabase allows those redirects). For example:
  - `https://www.inbharat.ai/app`
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
| Magic link (email only)  | `AuthPanel.tsx`               | `signInWithOtp()` with `emailRedirectTo` |
| Sign up (email/password) | `AuthPanel.tsx`               | `signUp()` with `emailRedirectTo: origin + '/app'` |
| Email verification link  | User clicks link → opens `/app` | Client reads hash; session set automatically; redirect URL must be in Supabase redirect list |
| Forgot password          | `AuthPanel.tsx`               | `resetPasswordForEmail()` with `redirectTo: origin + '/app'` |
| Password reset link      | User clicks link → opens `/app` | Same as verification: hash parsed by client; redirect URL must be allowlisted |
| API auth                 | `api/*.ts`                    | `verifySupabaseUser` or `verifySupabaseUserOptional` → `supabaseAdmin.auth.getUser(token)` |
| Env (client)             | `.env` / Vercel               | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Env (server)             | Vercel / serverless           | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

For deployment details (including Supabase project URL, migration, and env vars), see **DEPLOY-STEPS.md** and **DOCS.md**.

---

## 8. Troubleshooting: "I don't receive the password reset email"

If you click **Reset**, enter your email, and see "Password reset email sent" but **no email arrives**, check the following in order.

### 8.1 Redirect URL must be allowlisted in Supabase

Supabase **will not send** the reset email (or may reject the request) if the `redirectTo` URL is not in the allowlist.

- The app sends `redirectTo: window.location.origin + '/app'`.
- So when you use **https://www.inbharat.ai**, the redirect URL is **`https://www.inbharat.ai/app`** (no trailing slash).
- In Supabase Dashboard: **Authentication** → **URL Configuration** → **Redirect URLs**.
- Add **`https://www.inbharat.ai/app`** exactly if it is not there.
- If you test from a Vercel preview URL (e.g. `https://inbharat-xxx.vercel.app`), add **`https://inbharat-xxx.vercel.app/app`** as well.
- Save and try the reset again.

Ref: [Redirect URLs (Supabase)](https://supabase.com/docs/guides/auth/redirect-urls).

### 8.2 Check spam / junk and "Promotions"

- Look in **Spam**, **Junk**, and **Promotions** (Gmail).
- The sender is typically from Supabase (e.g. `noreply@mail.app.supabase.io` or your custom SMTP). Add it to safe senders if needed.

### 8.3 Supabase email delivery (default SMTP)

- On the free tier, Supabase sends auth emails via their own SMTP. There are **rate limits**; too many requests in a short time can block delivery.
- In **Authentication** → **Email Templates**, ensure the **Reset Password** template exists and is enabled.
- If emails still do not arrive, configure **custom SMTP**: **Project Settings** → **Auth** → **SMTP Settings**. Use your own SMTP (e.g. SendGrid, Mailgun, or your domain’s SMTP) so delivery is more reliable and less likely to be filtered.

### 8.4 User must already exist

- For security, Supabase returns **success** even when no user exists for that email (to avoid revealing whether an account exists). So the message "Password reset email sent" can appear even if the email is not registered.
- Confirm you are using an email that has already **signed up** (and, if required, verified) for InBharat. If the account was never created, no email will be sent.

### 8.5 Quick checklist

| Check | Where |
|-------|--------|
| `https://www.inbharat.ai/app` is in Redirect URLs | Supabase → Authentication → URL Configuration |
| Site URL is `https://www.inbharat.ai` | Same page |
| Reset Password email template is present | Authentication → Email Templates |
| Check spam/junk | Your inbox |
| Use an email that has already signed up | — |
| Consider custom SMTP if still failing | Project Settings → Auth → SMTP |

### 8.6 When Supabase is correct but the email still doesn’t arrive

Supabase sends auth emails (reset, confirmation) via **their default SMTP** on the free tier. That service is rate-limited and is often filtered or blocked by providers (Gmail, Outlook, etc.), so emails can be missing even when URL config and templates are correct.

**Fix: use custom SMTP**

1. In Supabase: **Project Settings** (gear) → **Auth** → **SMTP Settings**.
2. Enable **Custom SMTP** and fill in your SMTP provider (e.g. [Resend](https://resend.com), [SendGrid](https://sendgrid.com), [Mailgun](https://mailgun.com), or your domain’s SMTP).
3. Save. From then on, Supabase sends auth emails through your SMTP, which usually delivers reliably and avoids spam filters.

**Optional: force the link in the email to match your allowlist**

Set this in Vercel (and in `.env` locally if you want):

- **Name:** `VITE_AUTH_REDIRECT_URL`  
- **Value:** `https://www.inbharat.ai/app` (no trailing slash)

The app will use this as the redirect URL for “forgot password” and “email confirmation” links, so the link in the email always matches the URL you added in Supabase Redirect URLs.

