# Social Publishing (Instagram + LinkedIn)

The Growth Engine's social-publishing layer turns material dropped into the
**Inbox** into human-gated Instagram and LinkedIn posts.

## Design rule (non-negotiable)

**Visuals come from the Inbox. The uploaded assets ARE the post.** The model
writes only the **caption** and **alt text** — it never invents a visual, a
product feature, or a metric. A post is built from an inbox *folder*: the
images/videos in it, in a founder-controlled order, become the post media.

Nothing publishes automatically. `compose` creates a `pending` draft; a human
approves it (existing approvals flow); only an `approved` draft can `publish` —
the same gate as `api/growth/publish.ts`.

## Required environment variables (server-only)

All secrets are read server-side only and are never bundled into the browser.
Missing/placeholder values degrade honestly to a typed `not_configured` result
(never an opaque 500).

| Var | Channel | What it is | How to obtain |
| --- | --- | --- | --- |
| `IG_USER_ID` | Instagram | The Instagram **Business/Creator** account's IG user id | In the Meta App, connect the IG account to a Facebook Page, then `GET /me/accounts` → the Page → `?fields=instagram_business_account`. |
| `META_ACCESS_TOKEN` | Instagram | A **long-lived** Page/User access token with `instagram_content_publish` (+ `pages_read_engagement`, `instagram_basic`) | Create a Meta app → add the permissions → generate a User token → exchange for a long-lived token (`GET /oauth/access_token?grant_type=fb_exchange_token`), then a Page token. Long-lived tokens last ~60 days; refresh before expiry. |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn | A valid 3-legged OAuth access token | Create a LinkedIn app → request `w_member_social` (personal) and/or `w_organization_social` (company) → run the OAuth authorization-code flow → store the access token. |
| `LINKEDIN_AUTHOR_URN` | LinkedIn | The post author URN; its type decides personal vs company posting | Personal: `urn:li:person:<id>` (from `GET /v2/userinfo` → `sub`). Company: `urn:li:organization:<id>` (needs `w_organization_social` + an admin role on the page). |

> Do NOT put these in `.env.example` here — that file is owned elsewhere. Set
> them in the deployment environment (Vercel project env vars).

### Pinned API versions

- Instagram Graph API: **v21.0** (`GRAPH_VERSION` in `lib/growth/social/instagram.ts`).
- LinkedIn Posts API: **202506** (`LINKEDIN_VERSION` in `lib/growth/social/linkedin.ts`, sent as the `LinkedIn-Version` header).

Both are pinned deliberately so a silent platform default bump can't change
behavior with no code change. Bump them intentionally.

## Instagram publishing limit (25 / 24h)

Instagram's Content Publishing API allows **25 published posts per rolling
24 hours** per account. Before every publish the client calls
`GET /{ig-user-id}/content_publishing_limit` and refuses to start when the
remaining quota is 0. The `quota` action surfaces `{ quota, used, remaining }`
for the admin UI.

## Media constraints

What is validated server-side vs. what is `unverified` (needs ffprobe / pixel
decode and is therefore checked by the platform at container time, not here):

| Kind | Constraint | Checked here? |
| --- | --- | --- |
| Image | JPEG or PNG | ✅ extension/mime |
| Image | aspect ratio 4:5 … 1.91:1 | ⚠️ `unverified` (needs dimensions) |
| Carousel | 2–10 items | ✅ count |
| Video (Reel) | MP4 / MOV | ✅ extension/mime |
| Video | ≤ 1 GB | ✅ when Storage byte size is loaded, else `unverified` |
| Video | 3s–15min, 9:16 for Reels | ⚠️ `unverified` (needs ffprobe) |

`unverified` is an honest "we couldn't check this from the inbox row" — not a
pass. The founder reviews the preview before approving, and the platform rejects
a truly invalid asset at container-creation time (surfaced as `failed`).

## The flow

1. **Drop media into the Inbox** under a folder (existing inbox upload flow).
2. **Order** the folder's media for a carousel/post:
   `POST /api/growth/inbox?action=reorder` `{ order: [{ itemId, postOrder }] }`.
3. **Annotate** items with alt text (accessibility + LinkedIn altText):
   `POST /api/growth/inbox?action=annotate` `{ itemId, altText }`.
4. **Compose** a draft:
   `POST /api/growth/social?action=compose`
   `{ folder, channel: "instagram"|"linkedin", kind: "image"|"carousel"|"video", articleSlug? }`
   → validates media, orders the carousel, generates a caption from the *real*
   uploaded material, inserts a `pending` `growth_drafts` row (kind = the channel)
   with the `SocialPostDraft` in `schema_json.social`.
5. **Preview**: `POST /api/growth/social?action=preview` `{ draftId }` → the draft
   with **fresh signed media URLs** so the UI renders the exact final order.
6. **Approve** the draft (existing approvals flow — never auto).
7. **Publish** (approved only): `POST /api/growth/social?action=publish`
   `{ draftId }` → calls the channel client, writes a `growth_syndication` ledger
   row (`platform='instagram'|'linkedin'`), marks the draft `published`, stores the
   permalink. On a partial carousel failure the created child containers are saved
   to `schema_json.social_progress` for an **idempotent retry** (never re-publishes
   a `media_publish` that already succeeded — double-post safe).

## Dry-run mode

`POST /api/growth/social?action=dryrun` `{ draftId }` returns the **exact request
sequence** the channel client would issue — endpoints + payloads with the real
signed media URLs — **without calling the API**. Access tokens are never
included. Use it to inspect a plan before approving/publishing.

## Caption generation

`generateCaption(channel, source)` reuses the Growth Engine's Gemini helper,
redaction (runs last before the model call), and monthly budget check (same
pattern as `promoter.ts`). It is channel-aware:

- **Instagram** — caption ≤ 2,200 chars; hashtags go in the **first comment**
  (posted after the media publishes), keeping the caption clean.
- **LinkedIn** — longer-form, plain text (no markdown); hashtags inline at the
  end, **≤ 5**; no first comment.

The prompt is fed the real inbox item names + notes/alt text and is instructed
to describe only what is actually uploaded and to never invent product claims.
When the model isn't configured or the budget is exhausted, the caption comes
back `null` and the founder writes it manually — the draft is still created.

## LinkedIn: API path vs. deep-link fallback

`lib/growth/social/linkedin.ts` is the **real API** path (native post via the
Posts API). The existing **deep-link share** flow in `api/growth/publish.ts`
(kind='linkedin', returns a `share-offsite` URL the founder posts manually) is
**retained** as a zero-infra fallback — it is not removed. Choose the API path
when the tokens above are configured; the deep-link path always works with no
credentials.
