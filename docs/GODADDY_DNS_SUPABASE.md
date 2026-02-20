# GoDaddy DNS: Replace Clerk with Supabase (inbharat.ai)

The **GoDaddy MCP** in Cursor can only check domain availability and suggest domains. It **cannot** list or edit DNS records. Use the steps below in the GoDaddy dashboard.

---

## 1. Open DNS in GoDaddy

1. Go to [GoDaddy Domain Portfolio](https://dcc.godaddy.com/) and sign in.
2. Find **inbharat.ai** and click it.
3. Click **DNS** or **Manage DNS** to open DNS Management.

---

## 2. Remove Clerk-related records

Look for records that point to Clerk (auth):

- **CNAME** records whose **Name** is something like:
  - `frontend-api`
  - `accounts`
  - `clerk`
  - `*.clerk` or similar
- **TXT** records whose **Name** or **Value** mention Clerk or verification for Clerk.

Delete only the ones you added for Clerk. Leave A/CNAME for your main site (e.g. `@` or `www`) if they point to Vercel or your host.

---

## 3. Add Supabase custom domain records

Supabase expects a **subdomain** (e.g. `api.inbharat.ai`), not the root `inbharat.ai`.

### 3.1 Add CNAME (required)

| Type  | Name | Value                              | TTL  |
|-------|------|------------------------------------|------|
| CNAME | api  | `yxyikhnlevqioaqksevy.supabase.co` | 600  |

- **Name:** `api` (so the host is `api.inbharat.ai`).
- **Value:** `yxyikhnlevqioaqksevy.supabase.co` (trailing dot optional; some UIs add it).
- Use a low TTL (e.g. 600) while testing.

If your UI asks for “Host” instead of “Name”, use `api` (not `api.inbharat.ai` if GoDaddy appends the domain).

### 3.2 Get and add TXT for SSL (Supabase verification)

1. In **Supabase Dashboard** → your project **yxyikhnlevqioaqksevy** → **Settings** → **General** (or **Custom Domains** add-on).
2. Add custom hostname: `api.inbharat.ai`.
3. Supabase will show a **TXT** record for `_acme-challenge.api.inbharat.ai` and a value like `ca3-xxxx...`.
4. In GoDaddy DNS, add:
   - **Type:** TXT  
   - **Name:** `_acme-challenge.api` (or `_acme-challenge.api.inbharat.ai` if your UI uses full name).  
   - **Value:** the exact value from Supabase (no extra spaces).  
   - **TTL:** 600.
5. In Supabase, run “Verify” / “Reverify”; SSL can take up to ~30 minutes.

---

## 4. After DNS is verified in Supabase

- Your Supabase API will be reachable at:  
  **`https://api.inbharat.ai`**  
  (same as `https://yxyikhnlevqioaqksevy.supabase.co`).
- In app env (e.g. Vercel), you can set:
  - `VITE_SUPABASE_URL=https://api.inbharat.ai`
- Keep the default URL in env as fallback until you confirm the custom domain works.

---

## 5. Summary

| Action   | Where        | What |
|----------|-------------|------|
| Remove   | GoDaddy DNS | All Clerk CNAME/TXT records you added. |
| Add      | GoDaddy DNS | CNAME `api` → `yxyikhnlevqioaqksevy.supabase.co`. |
| Add      | GoDaddy DNS | TXT `_acme-challenge.api` → value from Supabase. |
| Configure| Supabase    | Custom domain `api.inbharat.ai` and verify. |

**Project ref:** `yxyikhnlevqioaqksevy`  
**Supabase URL:** `https://yxyikhnlevqioaqksevy.supabase.co`
