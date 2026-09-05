# Lead Generation via the InBharat Growth Agent

**Status:** Design + minimal scaffold (2026-06-28). Founder review before build-out.
**Scope:** How the Growth Agent turns InBharat.ai traffic into attributable leads — and how the same layer later serves the sibling sites (JAKSwarm, UnoOne, KathaKitaab, Sahayaak Seva, etc.) once each is connected to analytics.

---

## 1. The thesis

The Growth Agent is already a **reach + engagement measurement loop** (not just a writer) — but conversion is the open side. Today the loop closes for *reach* (impressions, pageviews, queries) and *engagement* (reactions, comments); it does **not** yet close for *conversion* (a visitor who became a contact/waitlist/signup). That is the gap this design fills:

```
   draft (caption/cover/article/video-script)
        ↓  human gate
   publish  →  growth_outcomes baseline (SEO/GEO delta from publish point)
        ↓  daily cron reads GA4 + GSC server-side
   outcomes  →  weekly distill proposes growth_agent_rules (source='learned', enabled=false)
        ↓  founder approves
   approved rules re-injected into every future prompt
```

Lead generation is the **missing input** to that loop. Today the loop measures *reach* (impressions, pageviews, queries) and *engagement* (reactions, comments). It does not measure **conversion** — the visitor who became a contact, a waitlist signup, a trial start. Adding lead capture + attribution closes that gap: the agent can then reason "article X drives 3× leads/visit vs article Y, and leads from X close 2× more often — double down on X's angle." That is the CMO-grade decision the agent is being asked to make.

The design principle throughout: **the agent never acts on leads autonomously.** It captures, attributes, analyses, and *proposes* human-gated actions (a lead-magnet draft, a CTA rewrite, a follow-up outreach message). Every outbound touch is a draft the founder approves. This matches the existing never-auto-publish rule.

---

## 2. Capture — what a "lead" is and where it's caught

A lead is a row in `growth_leads` (schema in §6). The minimal record:

- **Identity:** `email` (required) — the one durable handle. Name + company optional.
- **Intent:** `kind` — `newsletter` | `contact` | `waitlist:<product>` | `lead-magnet:<slug>` | `demo-request`.
- **Attribution:** `source_site` (inbharat.ai | jakswarm.com | …), `source_path` (the page they submitted from), `source_slug` (article slug if from an article), `utm_*` (campaign/source/medium/content/term parsed from the URL), `referrer`.
- **Consent:** `consent_at` timestamp + `consent_text` (what they agreed to). No consent = no lead stored.
- **State:** `status` (`new` → `contacted` → `qualified` → `won` | `lost`), `owner` (founder/user id), `notes`.

**Capture surfaces (InBharat.ai):**
1. **Contact page** — the existing `/contact` page becomes a real form (today it's a static channel list). Submit → `kind=contact`.
2. **Newsletter / "Desh ki AI" digest** — a single email field in the footer + on the Learn AI hub. `kind=newsletter`.
3. **Article lead-magnets** — each long-form article can offer a downloadable artifact (a one-page PDF / checklist distilled from the article) in exchange for email. `kind=lead-magnet:<slug>`. This is the highest-intent surface because the visitor is already reading the topic.
4. **Product waitlists** — on ecosystem pages, a "join the waitlist" for products not yet public. `kind=waitlist:<product-slug>`.

Every surface is a single reusable `<LeadCapture kind=… />` component (scaffold in §7) so the attribution fields are stamped consistently.

---

## 3. Attribution — stitching a lead back to its source

The capture component stamps every lead with the full attribution tuple at submit time (client-side reads `location` + the page's known slug), so no server-side session or cookie store is required. UTMs are parsed once from `window.location.search` and forwarded. This means:

- A lead from `inbharat.ai/learn-ai-with-reeturaj/harness-engineering?utm_source=linkedin&utm_campaign=harness-launch` is stored with `source_slug=harness-engineering`, `utm_source=linkedin`, `utm_campaign=harness-launch`.
- The daily outcomes job already joins `growth_outcomes` to `growth_drafts` by article URL/slug. Extending that join to `growth_leads.source_slug` gives a per-article **conversion rate** (leads / pageviews) alongside the existing SEO delta.

**Multi-site (later):** `source_site` is the partition key. Each sibling site runs the same `<LeadCapture>` (or posts to the same `/api/growth/leads` endpoint with its own `source_site`). One table, one agent, per-site views. The agent's analytics reader grows a `site` dimension — GA4 property per site, GSC per-site verification — so it can compare "a JAK Swarm trial signup that originated from an InBharat article" (cross-product funnel, §5).

---

## 4. What the agent *does* with leads (always proposed, never auto-sent)

The agent gains four new CMO capabilities, each emitting a **human-gated draft** (same `growth_drafts` table, new kinds):

1. **Lead-magnet authoring.** For a top-performing article (high pageviews, low leads — the "leaking bucket"), the agent drafts a lead-magnet (a one-page PDF outline / checklist) + the CTA copy + placement. Founder approves → publish as a `cover`-style GitHub commit (the PDF goes to `public/lead-magnets/<slug>.pdf`).
2. **CTA + funnel optimization.** The agent reads per-article conversion rates and proposes CTA rewrites for under-performing surfaces ("article X gets 5× the traffic of Y but 0.3× the leads — the CTA buries the value; here's a sharper version"). Proposed as a `growth_drafts` row of kind `cta-rewrite`; founder applies manually.
3. **Lead scoring + segmentation.** The agent classifies new leads by ICP fit (founder-defined criteria: role, company size, intent kind) and surfaces "hot this week" on the admin Overview. Pure read + label; no outbound automation.
4. **Follow-up outreach drafting.** For a lead the founder marks `contacted`/`qualified`, the agent drafts a personalized first-touch message (email or LinkedIn) grounded in the article they came from — "you read our harness-engineering piece; here's how JAK Swarm applies it." Drafted, **never sent**. The founder reviews; if it's a LinkedIn message, the local `scripts/linkedin-populate.ts` tool can auto-fill it (same human gate as captions).

Every one of these is a draft + a learned-rule proposal, not an autonomous action. With lead capture live, the loop would then have a conversion signal feeding back into the same rule-distillation pipeline — closing the open side flagged in §1.

---

## 5. Multi-site expansion (the "later via the other websites" part)

Once each sibling site is connected to analytics (GA4 property + GSC verification per site), the same three layers port wholesale:

- **Capture:** each site embeds `<LeadCapture>` (or its own minimal form posting to `https://www.inbharat.ai/api/growth/leads` with its `source_site`). Centralized capture, per-site attribution.
- **Attribution:** `source_site` + cross-site UTMs let the agent see cross-product funnels — "40% of JAK Swarm trial signups originated from an InBharat article" — which justifies doubling down on the article funnel rather than paid ads.
- **Agent analysis:** the agent's analytics reader adds a `site` filter; the admin console (Sites page already exists at `/admin/growth/sites`) becomes the per-site dashboard. Learned rules can be `scope: 'site:jakswarm.com'` so a rule learned for one site doesn't leak into another's prompts.

The agent's value compounds here: one CMO brain reading N sites' analytics and proposing per-site actions is the thing a solo founder cannot do manually at scale. That is the real return on connecting analytics to every site.

---

## 6. Data model — `growth_leads` (DDL in `supabase/APPLY_PENDING_MIGRATIONS.sql`)

```sql
create table if not exists public.growth_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,                       -- validated, lowercased
  name text,
  company text,
  kind text not null,                         -- newsletter|contact|waitlist:<slug>|lead-magnet:<slug>|demo-request
  source_site text not null default 'inbharat.ai',
  source_path text,                           -- the page submitted from
  source_slug text,                           -- article slug if from an article
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text,
  consent_at timestamptz not null,            -- no consent = no row
  consent_text text not null,
  status text not null default 'new',         -- new|contacted|qualified|won|lost
  owner uuid,                                 -- founder/user id (auth.users)
  notes text,
  ip_hash text,                               -- sha256(ip+salt), for rate-limit dedupe only; never the raw IP
  created_at timestamptz not null default now()
);
create index if not exists growth_leads_kind_idx        on public.growth_leads(kind);
create index if not exists growth_leads_source_site_idx on public.growth_leads(source_site);
create index if not exists growth_leads_source_slug_idx on public.growth_leads(source_slug);
create index if not exists growth_leads_status_idx      on public.growth_leads(status);
create index if not exists growth_leads_created_at_idx  on public.growth_leads(created_at desc);
-- unique on (email, kind, source_site) so a re-submit of the same newsletter signup
-- is idempotent, not a duplicate:
create unique index if not exists growth_leads_email_kind_site_uniq
  on public.growth_leads(email, kind, source_site) where status <> 'lost';
```

RLS: public INSERT only (via the service-role key server-side, so effectively no client RLS needed — the API owns writes). SELECT/UPDATE restricted to `auth.uid() = owner` or the founder role. The API endpoint uses `supabaseAdmin` (service role), so RLS is bypassed server-side; the admin GET is gated by `requireAdmin`.

Privacy: store `ip_hash` (salted SHA-256) for rate-limit dedupe — **never** the raw IP. Email is the only PII; a future `growth_leads_pii` deletion endpoint + a "right to be forgotten" handler are noted as Phase 2.

---

## 7. Minimal scaffold shipped now (safe, degrades gracefully)

1. **`api/growth/leads.ts`** — public POST (capture) + admin GET (list). Public POST is the security-sensitive part:
   - Zod-validated body (email, kind, name/company optional, attribution tuple, consent flag).
   - **Honeypot** field (`website` — hidden; if filled, silently accept-and-discard, HTTP 200, no row).
   - **Rate limit:** in-memory per-`ip_hash` token bucket (60s window) — best-effort; a single serverless instance won't share state, so this is a soft guard, with Vercel Edge rate-limit / Turnstile noted as the hard guard for Phase 2.
   - **Email validation** + lowercasing + length cap.
   - **Consent required** — no `consent` flag = 400.
   - Writes via `supabaseAdmin`; on `.then(onFulfilled,onRejected)` (Postgrest builders are PromiseLike, not Promises — same rule as the rest of the growth code).
   - **No-DB → 503** (matches outcomes.ts); the capture form shows a graceful "couldn't save, please email info@inbharat.ai" fallback.
   - Never logs the email. Audit log records only `kind`, `source_site`, `source_slug`, `status=new` (no PII).
   - Admin GET: `requireAdmin` → lists recent leads with attribution; supports `?site=` and `?status=` filters.
2. **`components/LeadCapture.tsx`** — the reusable form. Props: `kind`, `sourceSlug?`, `ctaLabel`, `compact?`. Stamps `source_path` + UTMs from `location` on submit. Honeypot included. Posts to `/api/growth/leads`. Success → inline "✓ subscribed / we'll be in touch"; failure → the email fallback.
3. **Wiring:** `<LeadCapture kind="contact" />` on `/contact` (alongside the existing channel list — the form is the primary capture, the channels stay as direct links). `<LeadCapture kind="newsletter" compact />` in the footer. Article lead-magnets are Phase 2 (need the PDF distill step).

**What is deliberately NOT shipped now:** outbound automation (the agent emailing/messaging leads), paid-ad integrations, a full CRM, Turnstile/Captcha (optional hard rate-limit), the lead-magnet PDF generator, and the per-article conversion-rate join in the outcomes job. These are Phase 2 once the capture pipeline is live and the founder has reviewed real leads.

---

## 8. Rollout order (lowest-risk first)

1. **Apply the `growth_leads` migration** (same Dashboard/CLI path as the other 4 pending — see `supabase/APPLY_PENDING_MIGRATIONS.sql`). Until applied, the capture endpoint returns 503 and the form falls back to email — no broken UX.
2. **Deploy** the new endpoint + component (the next push auto-deploys via Vercel).
3. **Wire the Contact form + footer newsletter.** Watch real leads arrive in `/admin/growth` (a Leads view is Phase 2; until then `GET /api/growth/leads` lists them).
4. **Connect GA4 + GSC** (GSC is still pending per the SEO/GA/GSC memory). Once live, the outcomes job can join leads → pageviews per slug.
5. **Agent lead-gen capabilities (§4)** — build only after step 4 shows real conversion signal. Premature agent actions on zero data are guesses.

---

## 9. Open questions for the founder

- **Lead destination / owner:** Should leads go to the founder's email inbox (forward on new), a CRM (HubSpot free?), or just the admin console? The scaffold stores them; where they're *read* is a workflow choice.
- **Consent text:** what's the exact consent statement per surface? (Newsletter vs contact vs waitlist differ.) Needs founder-approved copy.
- **Lead-magnet format:** one-page PDF vs a curated email course vs a private Notion/GDoc link — which is worth building the distill step for?
- **Multi-site posting:** should sibling sites POST cross-origin to `inbharat.ai/api/growth/leads` (CORS enabled for those origins) or each run its own endpoint? Centralized is simpler; CORS allowlist is the safe version.