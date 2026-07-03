# InBharat AI — Deploy from Git to Hosting (A to Z)

Complete step-by-step from first commit to live app at inbharat.ai. Uses **free Supabase** (no custom domain). Frontend and API host on **Vercel**; domain **inbharat.ai** points to Vercel via **GoDaddy**.

---

## A. Before you start

- Code is ready: local dev works with `npm run dev:local`, chat and search work.
- You have:
  - A GitHub (or GitLab) account and a **remote repo** for this project.
  - A **Vercel** account; the project can be linked to the repo now or in step D.
  - A **Supabase** account; project **yxyikhnlevqioaqksevy** is the one you use.
  - **GoDaddy** access for the domain **inbharat.ai**.
- Never commit `.env`. It is in `.gitignore`; your secrets stay in `.env` locally and in Vercel Environment Variables in production.

---

## B. Git: commit and push

**B1. Check nothing secret is staged**

- Open a terminal in the project root.
- Run: `git status`
- Ensure `.env` does **not** appear in the list of files to be committed. If it appears, it is not ignored; fix `.gitignore` so `.env` is listed there and try again.

**B2. Stage and commit**

- Run: `git add .`
- Run: `git status` again and review the list. Confirm only source code and config (no `.env`, no keys) are staged.
- Run: `git commit -m "Prep for deploy: InBharat AI with Supabase auth and chat storage"`  
  (Or use your own message.)

**B3. Push to the remote**

- If you have not added a remote yet:  
  `git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git`  
  (Replace with your actual repo URL.)
- Run: `git push -u origin main`  
  (If your default branch is `master`, use `git push -u origin master`.)

After this, your code is on GitHub/GitLab. If Vercel is already connected to this repo, a deploy may start automatically; it will not work fully until you complete the steps below (env vars and Supabase).

---

## C. Supabase: Auth and database (free project, default URL)

Use the **default** project URL: `https://yxyikhnlevqioaqksevy.supabase.co`. No custom domain, no paid plan required.

**C1. Open the project**

- Go to: https://supabase.com/dashboard/project/yxyikhnlevqioaqksevy

**C2. Authentication — Providers**

- In the left sidebar: **Authentication** → **Providers**.
- Enable **Email** (sign in with email/password).
- If you want “Continue with Google”, enable **Google** and follow Supabase/Google Cloud instructions to add client ID and secret; otherwise leave it disabled.

**C3. Authentication — URL configuration**

- Go to **Authentication** → **URL Configuration**.
- **Site URL:** set to `https://inbharat.ai`  
  (Or your live app URL if different, e.g. `https://your-app.vercel.app`.)
- **Redirect URLs:** add these one by one (plus any others you need):
  - `https://inbharat.ai/app`
  - `https://YOUR_VERCEL_APP.vercel.app/app`  
    (Replace `YOUR_VERCEL_APP` with your actual Vercel project subdomain.)
  - `http://localhost:5173/app`  
    (For local testing.)

**C4. API keys (for Vercel env in step D)**

- Go to **Project Settings** (gear icon) → **API**.
- Note:
  - **Project URL:** `https://yxyikhnlevqioaqksevy.supabase.co`
  - **anon public** key (safe for browser).
  - **service_role** key (secret; server-only, never in client code).

**C5. Database — run migration once**

- Go to **SQL Editor**.
- Create a new query.
- Open the file `supabase/migrations/20250219000000_chat_sessions_messages.sql` in your project, copy its **entire** contents, and paste into the SQL Editor.
- Click **Run** (or Execute).
- Ensure it runs without errors. This creates `chat_sessions` and `chat_messages` and sets up RLS so each user only sees their own data.

Supabase is now configured for auth and chat storage. No DNS or custom domain is required.

---

## D. Vercel: project, env vars, and deploy

**D1. Link the project (if not already linked)**

- Go to https://vercel.com and sign in.
- **Add New** → **Project** (or open the existing project if you already use it).
- Import the repo that contains InBharat AI (e.g. from GitHub).
- Use the recommended settings: **Framework Preset** Vite, **Build Command** `npm run build`, **Output Directory** `dist`. Root directory is the repo root unless you use a monorepo.
- Do **not** add env vars yet; add them in D2, then deploy.

**D2. Environment variables**

- In the Vercel project, go to **Settings** → **Environment Variables**.
- Add each variable below. Apply to **Production** (and **Preview** if you want preview deploys to work the same).
- **Do not** add `VITE_OPENAI_API_KEY`: the OpenAI key must stay server-only. Use only `OPENAI_API_KEY`. If `VITE_OPENAI_API_KEY` exists, remove it.

| Name | Value | Notes |
|------|--------|--------|
| `OPENAI_API_KEY` | Your OpenAI API key | Server-only; required for chat. |
| `SERPER_API_KEY` | Your Serper API key | Server-only; optional, for search/news. |
| `VITE_SUPABASE_URL` | `https://yxyikhnlevqioaqksevy.supabase.co` | Exact; no trailing slash. |
| `VITE_SUPABASE_ANON_KEY` | The anon public key from Supabase (C4) | From Project Settings → API. |
| `SUPABASE_URL` | `https://yxyikhnlevqioaqksevy.supabase.co` | Same as VITE_SUPABASE_URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | The service_role key from Supabase (C4) | Secret; server-only. |

Save each variable. After adding all six, trigger a new deploy (see D3).

**D2b. (Optional) Growth Agent — syndication + advanced keys**

Only if you run the Growth Agent surface (`/admin/growth`). All are server-only and **optional** — each feature degrades honestly (logs "not configured" / skips) when its key is absent, so the site + chat work without them. Add only what you use:

| Name | Value | Notes |
|------|--------|--------|
| `GROWTH_OPENAI_API_KEY` | OpenAI key for the growth agent | Separate from chat; the chat model selection is never touched. |
| `GEMINI_API_KEY` | Gemini key for the growth model router | Separate from chat. |
| `GITHUB_TOKEN` | GitHub PAT | For audit PR creation; read-only is fine. |
| `CRON_SECRET` | A shared secret | Authenticates the scheduled daily cron + external schedulers. |
| `DEVTO_API_KEY` | Forem API key (dev.to/settings/extensions) | Stage 3 — cross-post articles to DEV.to as drafts. |
| `HASHNODE_TOKEN` | Hashnode PAT (hashnode.com/settings/developer) | Stage 3 — cross-post to Hashnode (no Bearer prefix). |
| `HASHNODE_PUBLICATION_ID` | Your publication's ObjectId | Stage 3 — required by Hashnode's `publishPost` mutation. |

Medium has no API (deprecated) → Stage 3 surfaces it as a manual import helper (canonical URL + the `medium.com/p/import` page), so there is no `MEDIUM_*` key.

**D2c. Supabase migrations — run once**

The growth + SEO migrations do **not** auto-apply on deploy. After the first deploy, run each pending migration once via the Supabase SQL Editor (paste the file's contents) **or** `supabase db push` / the HTTPS Management API (the DB is not directly reachable; use the Management API). Pending migrations:

- `supabase/migrations/20260702120000_published_articles.sql` — SEO article mirror.
- `supabase/migrations/20260702130000_growth_hygiene.sql` — Stage 1 hygiene (indexes + constraints).
- `supabase/migrations/20260703120000_growth_retention.sql` — Stage 2 `prune_growth_tables` (called by the daily cron).
- `supabase/migrations/20260703130000_growth_syndication.sql` — Stage 3 syndication ledger.

Each is idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`), so re-running is safe.

**D3. Deploy**

- Go to **Deployments**.
- If a deploy was triggered by your push but failed or is missing env: click the **…** on the latest deployment → **Redeploy** (with “Use existing Build Cache” unchecked if you want a clean build).
- Or push an empty commit to trigger a new deploy:  
  `git commit --allow-empty -m "Trigger deploy"` then `git push origin main`.
- Wait until the deployment status is **Ready**. Note the deployment URL (e.g. `https://your-project.vercel.app`).

**D4. (Optional) Add custom domain inbharat.ai in Vercel**

- In the same project: **Settings** → **Domains**.
- Add `inbharat.ai` (and `www.inbharat.ai` if you want).
- Vercel will show the DNS records you need (e.g. A record or CNAME). You will add these in GoDaddy in step E.

At this point the app runs on the default Vercel URL. If you added inbharat.ai in D4, it will work on that domain after you complete step E.

---

## E. GoDaddy: point inbharat.ai to Vercel

This step only makes your **website** (frontend) load at inbharat.ai. Supabase stays on its default URL; you do **not** add any DNS records for Supabase.

**E1. Open DNS for inbharat.ai**

- Go to https://dcc.godaddy.com/ (or your GoDaddy dashboard), sign in.
- Find the domain **inbharat.ai** and open **DNS** / **Manage DNS**.

**E2. Records for the app (Vercel)**

- In Vercel → Project → **Settings** → **Domains**, you see what to add for `inbharat.ai` (and `www.inbharat.ai`).
- In GoDaddy, add or update:
  - For **root** (`@`): usually an **A** record with the value Vercel gives (e.g. `76.76.21.21`), or a **CNAME** if Vercel says so.
  - For **www**: usually a **CNAME** with value `cname.vercel-dns.com` (or what Vercel shows).
- Remove or do not add any **Clerk**-related CNAME/TXT records if they still exist.
- Save. DNS can take a few minutes to a few hours to propagate.

**E3. No Supabase records**

- Do **not** add a CNAME for `api` or any TXT for `_acme-challenge.api`. Those are only for a custom Supabase domain; you are using the free default URL.

After propagation, visiting `https://inbharat.ai` (and `https://www.inbharat.ai` if configured) will show your Vercel-hosted app.

---

## F. Verify end-to-end

**F1. App and auth**

- Open `https://inbharat.ai` (or your Vercel URL if the domain is not ready yet).
- Go to `https://inbharat.ai/app` (or `https://your-project.vercel.app/app`).
- Try the guest flow: send a few messages without signing in.
- Click **Sign in**, create an account (email + password), and sign in.
- Send a message; then refresh the page. The conversation should still be there (Supabase storage).

**F2. Health check**

- Open: `https://inbharat.ai/api/health` (or `https://your-project.vercel.app/api/health`).
- You should see JSON with `ok: true` and flags for OPENAI, SERPER, SUPABASE_ADMIN. No secrets should appear.

**F3. Optional**

- Try Research mode (if SERPER_API_KEY is set).
- Try signing out and signing in again; confirm redirects and session.

---

## G. Quick reference

**Order of operations**

1. Git: commit and push (B).
2. Supabase: Auth providers and URL config (C1–C3), copy API keys (C4), run migration (C5).
3. Vercel: link repo (D1), add all 6 env vars (D2), deploy (D3), optionally add domain inbharat.ai (D4).
4. GoDaddy: point inbharat.ai (and www) to Vercel (E); no records for Supabase.
5. Test app and health (F).

**Env vars (names only)**

- Client (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server (Vercel): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SERPER_API_KEY` (optional)

**URLs**

- App: `https://inbharat.ai` and `https://inbharat.ai/app` (after DNS and Vercel domain).
- Supabase (free): `https://yxyikhnlevqioaqksevy.supabase.co` (no custom domain).
- Health: `https://inbharat.ai/api/health`.

---

End of deploy steps. If something fails, check: (1) env vars in Vercel, (2) Supabase redirect URLs and Site URL, (3) DNS in GoDaddy for inbharat.ai, (4) migration run in Supabase SQL Editor.
