# Contributing to InBharat AI

Thank you for contributing. Read the [README](README.md), [maintainer documentation](DOCS.md), [Code of Conduct](CODE_OF_CONDUCT.md) and [security policy](SECURITY.md) first.

## Set up safely

1. Fork/clone and create a focused branch from `main`.
2. Use the Node engine range in `package.json` and run `npm ci` with the committed lockfile.
3. Copy `.env.example` to `.env` only if your task needs configured services. Use development credentials and an isolated database, never production write access by default.
4. Choose `npm run dev:vite` for UI-only work, `npm run dev:local` for the limited local API shim, or `npm run dev` for Vercel development. See the README for differences.

The local API shim has development-only authorization allowances and is not a public server. Do not expose it to untrusted networks. Never commit secrets, local environment files, logs, reports, browser profiles or test output. Public `VITE_*` variables must not contain secrets.

## Make evidence-based changes

- Follow existing TypeScript/React patterns and keep changes focused. Update tests and documentation when behavior changes.
- For content/product work, use [the claim review register](content/claim-review.md). Separate current capability from research, historical evidence, plans and release qualification. UI locale resources are not a speech/model support matrix.
- For articles, update metadata and body consistently. Preserve original publication dates and slugs unless there is a reviewed reason to change them. Do not invent dates, citations, customer results, patent scope, endorsements or availability.
- For credentials, preserve holder/category semantics in `content/credentials.ts`; programme participation and membership are not awards.
- Keep publication builds write-free. Database migrations, repository publishing, production reconciliation, search submission and social publishing are separate authorized operations.
- Do not weaken authentication, RLS, secret scanning or content-hash verification to make a test pass. Report unmet configuration/evidence prerequisites honestly.

## Validate your change

Run the relevant targeted suites while developing, then the release-equivalent checks before requesting merge:

```sh
npm run lint
npm run test:growth
npm run ci:build
npm audit
git diff --check
```

`lint` includes the SEO-hardening contract suites; `ci:build` builds and audits local static output and runs Chromium Playwright. It does not apply migrations or prove hosted Supabase/API behavior. Use a checkout without real `.env*` files for those gates. `npm run test:publication-sql` executes publication fixtures in isolated PGlite, not a production database.

The production dependency gate does not include development dependencies; review the separate full audit and do not blindly force dependency upgrades. Preserve `package-lock.json` when changing packages and explain compatibility/testing impact. Do not disable lifecycle scripts when relying on CI build hooks.

Record the revision, Node version, commands, pass/fail/skip counts and limitations. Local tests, mocked APIs, hosted CI, deployed HTTP checks and live integration checks are distinct evidence. If a hosted workflow did not execute, do not label it passed. `npm run audit:deployment` is a read-only production HTTP audit; it is not a license to run write-capable crons or publish test content.

## Open a pull request

Include:

- What changed and why, with issue/context links.
- Exact checks run and honest failures, skips or untested paths.
- Screenshots for meaningful UI changes, with private/user data removed.
- Migration, configuration, permission and rollout/rollback implications.
- Any unresolved product/evidence questions; do not hide them behind a broad “verified” label.

Inspect `git status`, `git diff` and the staged diff. Stage reviewed paths explicitly. Keep local reports in ignored `reports/`, `playwright-report/` and `test-results/`; sanitize evidence before sharing. A passing current-tree secret scan does not establish a clean Git history or revoked credentials.

Use [GitHub Issues](https://github.com/inbharatai/Inbharat.ai/issues) for ordinary bugs and proposals. Follow [SECURITY.md](SECURITY.md) rather than posting sensitive vulnerability details or credentials publicly.
