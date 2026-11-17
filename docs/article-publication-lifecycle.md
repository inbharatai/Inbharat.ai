# Article publication lifecycle and production reconciliation

## Three different facts

1. **Draft generated**: `schema_json.generatedAt` is the UTC draft-generation instant. Old drafts may contain `datePublished`; the publish route deliberately ignores it.
2. **Repository published**: the admin-approved route commits the body and full manifest update in **one Git tree/commit**. `publicationState: "repository_published"` and `liveVerified: false` describe this accurately. The existing draft DB enum remains `published` for compatibility; it means repository acceptance for articles, not verified deployment. A newly added manifest record has `repositoryRecordedAt`: the snapshot preparation instant recorded in the eventual commit, **not an exact commit-acceptance or deployment timestamp**.
3. **Observed canonical content**: the automatic production cron fetches the public snapshot and exact final article HTML from `SITE.url`, checks the snapshot source SHA against its running deployment's `VERCEL_GIT_COMMIT_SHA`, rechecks snapshot identity, then calls one transactional reconciliation RPC. The database's `first_verified_at` is the first successful observation, **not** the exact first-publication timestamp. `verified_at`/`synced_at` are the latest successful reconciliation observation, including observed removals. A separate optional operator CLI can add Vercel deployment/alias evidence; automatic operation never needs a Vercel API token.

`datePublished` is optional: retain a historical editorial value where already present; omit it for new articles unless an independently verified first-live publication date is entered. A successful build, repository commit, deployment creation time, or first observation must not be silently substituted. This implementation does not backfill dates from guesses or overwrite historical values. Missing dates must be omitted from visible date labels/schema/sitemap, never rendered as `Invalid Date` or today.

`dateModified` is the UTC calendar date of a substantive repository body/metadata revision. Updates preserve first publication and unrelated/unknown metadata (including images/video). A repeated identical body and metadata is a byte-for-byte no-op and does not refresh the date. This revision date can legitimately precede the deployment that serves it; it is not a live-promotion timestamp. Cover-only publication is still a separate existing best-effort operation, not included in the substantive article revision mechanism.

## Atomic repository updates

The publisher reads the manifest and existing markdown pinned to one `main` SHA, parses **literal data only**, and creates one tree with both changed files. Only a non-force branch update is allowed; concurrent edits are rejected rather than overwritten. Retry after reviewing branch changes. Unsupported source syntax or ambiguous/duplicate entries fail closed, before a branch update. Unknown literal metadata fields are retained. The parser never executes code fetched from GitHub.

TS serialization escapes line breaks, carriage returns, tabs, backslashes, quotes and Unicode separators. The separate rendering layer must still safely escape inline JSON-LD (`<` to `\\u003c`); safe TypeScript serialization is not HTML encoding.

The existing calendar/cover/knowledge actions run afterward and remain separate best-effort operations. The API does not promise that these later commits or a deployment succeeded. A lost GitHub response can leave an accepted commit whose acknowledgement was lost; retry reads the branch and no-ops if the article snapshot already matches. A failed DB status write does not roll back a successful repository commit.

## Automatic production reconciliation — no new Vercel credential

Ordinary local, preview and production **builds never write the publication mirror**. `scripts/sync-published-articles.ts` remains a harmless compatibility entrypoint. It must not acquire a DB client or perform network writes. Reconciliation is asynchronous, after canonical production promotion, through `/api/growth/cron/publication-sync` (scheduled at minute 19 and 49 each hour).

`scripts/build-seo.ts` preserves existing rendering and generates two public files after the final HTML shells are written:

- `/article-publication.json`: current canonical snapshot, `no-store`;
- `/article-publication/<snapshotId>.json`: identical, content-addressed immutable snapshot.

The manifest contains public mirror rows, body byte count/hash, final HTML byte count/SHA-256, source commit SHA, build time and eligibility. Snapshot identity is SHA-256 of deterministic key-sorted JSON of **all** snapshot fields except the identity itself. It is not a deployment ID. The SHA covers public article source metadata/body as well as exact final HTML; raw bodies and secrets are not included. `builtAt` is snapshot construction time, not first publication, repository commit time, or Vercel deployment time. `sourceCommitSha` is a source revision, not a timestamp.

Eligibility requires `VERCEL=1`, `VERCEL_ENV=production`, a full lowercase 40-hex `VERCEL_GIT_COMMIT_SHA`, and **independent source verification**. These identity signals are captured before loading local `.env` rendering defaults. A SHA environment variable alone is never proof. `lib/growth/source-provenance.ts` implements two paths:

1. **Local Git fast path:** when the checkout has `.git`, require the exact repository root, HEAD equal to the declared SHA, and clean porcelain status (including nonignored untracked files). Then compare every committed regular file's raw Git blob SHA-1 (`blob <byte length>\\0<raw bytes>`) and size against the local committed tree. This also catches modifications hidden by `assume-unchanged`. An existing dirty, wrong-HEAD, broken or unavailable Git checkout **never falls back** to network verification.
2. **Hosted checkout without `.git`:** one unauthenticated, read-only HTTPS request to `https://api.github.com/repos/inbharatai/Inbharat.ai/git/trees/<exact SHA>?recursive=1`. Repository/host are fixed in source, not supplied by environment or response. Require HTTP 200 JSON, no redirects, exact response commit/repository binding, explicit `truncated:false`, valid complete tree structure and supported ordinary-file objects. Compare **every tracked file**, including lockfile, configuration, scripts, metadata and media, against its committed raw Git blob SHA and size. Tree entry URLs are never fetched and remote code is never executed. Missing files, changed bytes, symlinks, submodules, unsafe paths, unknown object types, unavailable/rate-limited network or malformed/oversized/incomplete trees fail closed.

Tracked files are never exempt from verification, even under an output path. Additional source files reject eligibility; only explicitly recognized generated/dependency/operator-local output paths (for example `dist`, `node_modules`, `.vercel`, generated product/field-lab media and local environment files) are skipped during the extra-file scan. Environment files are not read by this verifier unless committed as source; it does not acquire credentials. Dependencies and allowed build-time environment values are not independently attested by this source check; retain the pinned lockfile and reproducible install gate.

Bounds: one public tree request, 15-second request/stream deadline, 4 MiB response, 10,000 tree entries, 64 MiB per file, 256 MiB total tracked file bytes, 20,000 directory-scan entries and 60-second overall verification deadline (with bounded local Git subprocesses). Streaming file hashing avoids loading source files wholesale. No token or new dependency is needed. A public GitHub outage/rate limit leaves a no-Git build **ineligible**, rather than granting an exception; a local clean Git build does not need the network.

The build emits `[build-seo] publication source eligibility` with fixed reason codes, method, eligibility and verified file/byte counts only—never filenames, file contents, environment values or raw exceptions. The same diagnostics appear as optional `sourceProvenance` in the identity-covered v1 snapshot. This additive v1 extension remains compatible with the existing runtime identity validator: old eligible v1 snapshots remain readable, old ineligible/local snapshots remain rejected, and a diagnostic failure cannot override `automatedSyncEligible:false`. New diagnostics must themselves be consistent when present. Runtime still requires eligibility, exact running source SHA and exact public article HTML, followed by the second manifest check; diagnostics do not bypass any of those checks.

Local, preview, dirty/uncommitted, unidentified or unverifiable builds emit explicitly **ineligible** artifacts. Missing production environment signals report `NOT_VERCEL` or `NOT_PRODUCTION`; missing/malformed source SHA reports `INVALID_SOURCE_SHA`. Source failures report distinct codes such as `GIT_HEAD_MISMATCH`, `GIT_DIRTY`, `GIT_UNAVAILABLE`, `TREE_FETCH_FAILED`, `TREE_TRUNCATED`, `FILE_MISSING` or `FILE_MISMATCH`. A same-SHA rebuild receives a distinct snapshot if its build time or final HTML differs.

**Diagnosis limit:** the observed deployed baseline `10a6e8b745e7cb83054564f1904492f99b3c5ccd` had the expected public source SHA but `automatedSyncEligible:false`. No Vercel build logs were available to identify the failed original predicate. Missing `.git`, absent production environment signals, or install/build modifications are possibilities, **not established root causes**. An isolated archive of that baseline (without `.git`) was successfully verified through the public API: 474 tracked files, 35,371,017 bytes. That demonstrates fallback compatibility with the public baseline, not the state of the hosted build or a successful reconciliation. A reproducible `npm ci` install is recommended; any deployment configuration change belongs to the release owner.

The cron uses existing server `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and existing `CRON_SECRET` (or existing authenticated admin authorization for a POST). **No `VERCEL_TOKEN`, new token, Vercel API call or manual operator invocation is required for the automatic path.** Vercel scheduled GET requests use `Authorization: Bearer CRON_SECRET`. The endpoint deliberately strips the legacy UA/schedule shortcut before calling the existing cron authorization helper: a spoofable `vercel-cron` user-agent and schedule header alone never authorize publication writes. Preview/local execution is rejected even for a valid administrator. If the existing cron secret is not configured, configure that existing authentication mechanism rather than accepting unauthenticated scheduling.

The automatic sequence is:

1. Authenticate; require production runtime and source SHA; require existing server Supabase configuration.
2. Fetch **only** `SITE.url + /article-publication.json`; reject redirects, non-200, incorrect content type, oversized streams, invalid JSON, corrupt identity, ineligible builds and a source SHA different from the running deployment.
3. Validate all rows, dates, slug uniqueness and exact same-origin canonical URLs.
4. Fetch every article with `redirect: error`, direct HTTP 200 HTML, exact byte count and SHA-256, exactly one correct canonical, TechArticle and no detected robots/meta or HTTP noindex/none. A generic SPA fallback, stale CDN body, missing page or content mismatch blocks the entire reconciliation.
5. Re-fetch the current canonical snapshot and require the identical snapshot ID, closing the long verification window.
6. Record the current observation time and call **one** atomic `reconcile_production_articles` RPC. No partial batch writes, per-row fallback or destructive deletes.

Bounds: 1,000 articles, 4 MiB manifest, 4 MiB per HTML response, six concurrent page checks, 15-second individual request/body deadline, 240-second whole verification deadline and 30-second DB RPC deadline inside a 300-second function. Headers request cache revalidation; the manifest pointer is no-store. Any failure blocks reconciliation and returns `ok:false`, `status:failed` (non-2xx). Missing server runtime configuration or RPC/migration reports `status:unconfigured` (503); skipped work is never a success. Only completed reconciliation returns `status:reconciled` with snapshot identity, article count and observation time.

## One-time database prerequisite — UNAPPLIED

Review `supabase/migrations/20261116000001_article_publication_lifecycle.sql`, test it through normal migration review, and apply it **separately** to the intended database. This is the remaining activation prerequisite for reconciliation, not an instruction to run SQL from a build or cron. The SQL depends on the original `published_articles` migration. This change has **not** read secrets, performed API/DB writes, or applied the migration.

The proposed migration:

- allows unknown `publish_date` (`NULL`) without manufacturing dates;
- adds live/unverified/removed state, canonical snapshot ID/build time, source SHA and observation timestamps;
- distinguishes optional `deployment_id`, `deployment_created_at`, `vercel_verified_at` from canonical proof (automatic runs never invent those);
- leaves legacy rows `unverified` until reconciled;
- exposes one service-role-only transaction with an advisory lock;
- rejects older observations and conflicting identities at the same observation time; repeated identity must retain source/build provenance;
- records initial/repeat/advance/rollback transitions in a service-role-only observation history;
- tombstones removed canonical originals; preserves onset on repeated removal and clears tombstone on revival;
- preserves old publication dates and first observation, syndication metadata and foreign-platform rows; conflicts abort the whole transaction;
- retains optional Vercel evidence only for the same snapshot, avoiding misattribution to a later snapshot.

The checkpoint order is **completed canonical observation time**, not artifact construction, Git revision or Vercel deployment order. An owner rollback to an older snapshot is accepted only after the same current-canonical identity, running-source and exact HTML checks, with a newer observation time; it is recorded as a rollback transition. Delayed older observations are rejected. No checkpoint hand-edit is required for a verified rollback, and no build timestamp is treated as a first-publication date.

This proposal replaces an **unapplied** earlier deployment-checkpoint proposal. It is not an upgrade script for a database where that draft was independently applied; such a database needs a separately reviewed migration. `npm run test:publication-sql` executes both proposed migrations and lifecycle, rollback, atomic-failure, read-model, grant and RLS fixtures in an isolated PGlite PostgreSQL/WASM engine. This is real local SQL execution, **not** hosted Supabase or multi-process concurrency verification. The live schema and permissions still require verification before activation. Do not claim the automatic path is live until the committed deployment and DB prerequisite are actually verified.

## Optional stronger operator verification (not the automatic path)

The existing manual CLI remains usable and adds Vercel API deployment/alias evidence to the **same canonical snapshot and checkpoint**, rather than maintaining incompatible freshness identities. Use a clean checkout of the exact promoted commit, installed dependencies, and a trusted server environment with `VERCEL_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and optional `VERCEL_TEAM_ID`. These Vercel credentials are **optional for operators only; do not add them to enable the cron**.

```sh
./node_modules/.bin/tsx scripts/sync-production-articles.ts \
  --confirm-production-sync --deployment-id=dpl_THE_PROMOTED_DEPLOYMENT
```

The CLI rejects npm lifecycle and preview/development execution. It verifies ready production deployment, repository `inbharatai/Inbharat.ai`, exact checkout SHA and canonical alias both before and after content verification. It also performs all canonical byte-hash checks and manifest identity recheck, then calls the same RPC with separate `vercel_verification` evidence. It requires the new eligible public manifest on the promoted site; it cannot reconcile legacy builds without that artifact. Unknown/mismatched aliases, missing credentials, failed verification or RPC return a nonzero exit. Never add this to build/postbuild.

## Operational limits

- Canonical hosting and the DB transaction cannot be checked/changed atomically. A promotion immediately after the final manifest check remains a narrow race; the next scheduled run converges. The DB checkpoint rejects delayed older observations. A failed RPC response is an uncertain acknowledgement (the transaction could have committed); retry is safe and preserves first observation/history.
- HTTP content-addressed proof is not a Vercel deployment API attestation, nor proof of first publication or search-engine indexing. A running SHA match plus exact canonical HTML verifies the selected source snapshot; it does not establish Vercel deployment creation time.
- Manifest removals become tombstones; this does not independently prove the old URL returns 404. Redirect/404 behavior needs separate routing tests.
- Current-live consumers should filter `publication_state = 'live'`; history remains queryable. Existing Growth Engine syndication/calendar/learning functionality is not replaced by this mechanism.
- Historical source dates are not guessed or rewritten. Invalid/future/inverted lifecycle dates cause snapshot construction/verification to fail closed until an editor corrects them with evidence.

## Hermetic tests (not live proof)

```sh
./node_modules/.bin/tsx scripts/test-canonical-article-sync.ts
./node_modules/.bin/tsx scripts/test-source-provenance.ts
./node_modules/.bin/tsx scripts/test-article-lifecycle.ts
# Optional single public read-only API request, using an isolated archive of the known baseline:
./node_modules/.bin/tsx scripts/test-source-provenance.ts --public-baseline
```

The provenance suite uses isolated filesystem fixtures, a local clone of existing committed objects (no new commits), and fake fetch by default. It tests clean/dirty/wrong-SHA Git, missing Git, local/preview gates, raw-byte mismatches, generated-output handling, unexpected extra source, symlinks, traversal, unsupported objects, truncation, request/size/count limits and failures without fallback. Only the explicit `--public-baseline` option performs a live public read; it does not deploy or access credentials/DBs. The shared working tree is not represented as clean.

The canonical suite uses fake fetch and fake DB adapters only: ineligible builds, identity tampering, wrong running SHA, stale/changing manifests, off-origin URLs, count/size limits, page status/type/hash/robots/canonical failures, duplicate slugs, date checks, source/body hash coverage, failed atomic RPC and optional Vercel evidence. SQL, cron/auth and build wiring assertions are labeled **source contracts**, not endpoint integration tests or database execution. Existing lifecycle tests cover the atomic repository publishing path. Full build/route and deployed-site validation remain distinct release gates.
