# InBharat.ai private AI positioning & Growth Agent release contract

This document tracks the October 2026 UnoOne-first website upgrade. It is **not** a claim that every feature has been deployed or is production-qualified.

## Protected invariants
- Preserve the Bhagavad Gita shloka component `HeroGitaQuote` on the homepage.
- Preserve the dark visual language, original logo, saffron/orange accent `#f59f4f`, green highlights and existing AI Console.
- Keep the existing React/Vite app and Vercel API routes. No separately hosted Growth Agent project.
- Do not expose private-repository URLs in public pages, invent verified release capabilities, or represent a discontinued product as current.

## Public information architecture
- `/` — InBharat.ai: private AI for people and organisations.
- `/unoone` — one personal-agent direction for phone and computer.
- `/unoone/power` — local-first desktop assistant, still under integrated qualification.
- `/unoone/mobile` — bounded Android-native agent actions, alpha, device qualification pending.
- `/enterprise-ai` — JAK Swarm and JAK Shield, controlled early testing.
- `/technology` — SILT, local inference and historical research.
- Existing `/app`, article, contact, privacy, terms and restricted Growth Agent pages remain in place.

## Brand and claim policy
- UnoOne Power and UnoOne Mobile are the personal private AI flagships.
- JAK Swarm and JAK Shield explain secure autonomous work for organisations.
- SILT is research; patent applications must be presented as filings, never proof of granted rights or general product readiness.
- The Pocket AI removable-drive product is **discontinued**. Preserve honest historical patent and engineering information without selling a pen-drive product.
- Every product claim needs a status: planned, implemented, automated-tested, device-tested, pilot-available, or production-qualified.
- Supported local model operations may remain on-device. Optional cloud inference, web access or integrations must disclose data boundaries.

## SEO and GEO principles
- Canonical host `https://www.inbharat.ai`, unique indexable route shells and updated XML sitemap.
- All priority pages must render useful content, correct metadata, sensible internal links and valid JSON-LD. `scripts/audit-seo.ts` and `scripts/verify-shell-crawl.ts` are release gates.
- Do not create scaled low-value pages, fake reviews, fabricated demand data or manipulative AI search content.
- Publish original technical evidence, accurate FAQs, screenshots from tested builds, limitations and dated comparisons where useful.
- High-intent research priority: private Windows AI, desktop agent for local files, offline Android assistant, secure phone-PC continuity, AI agent policy gateways and audit trails.
- Google sitelinks, indexing and AI citations are search-engine decisions, not engineering guarantees.

## Growth Agent operating rules
- Only owner-authorized domains and repositories may be accessed.
- Canonical private repositories remain the primary evidence source; public preview status must not revoke private reading permission.
- A failed configured authorization DB must fail closed.
- Content sources, claims, release evidence and repository status should be verified per product before public publication.
- Human review and verification remain required for production publication. Future unattended repairs must be explicitly allowlisted and reversible.
- Daily analytics and indexing suggestions require live Google Search Console and GA4 account permissions; source code alone does not configure a production property.

## Remaining deployment / validation work
1. Confirm the production hosting project is wired to the authoritative `main` branch and the new static route shells actually deploy.
2. Manually inspect desktop (1440px) and mobile (360px, 390px, 768px), including typography, tap targets, nav, shloka and contrast.
3. Verify production GA4 measurement, conversion events, service account permissions and Search Console API visibility.
4. Update and quality-review all 11 language versions; English-first copy changes must not silently override meaningful localized content.
5. Audit every old Pocket AI mention on public surfaces, articles and product links; distinguish historical research from active offerings.
6. Expand Growth Agent private repo evidence beyond README files, with secret redaction and commit/test provenance.
7. Implement scoped code-fix generation, tests, approval queues, GitHub PR or explicitly owner-approved commit workflows, deploy verification and rollback.
8. Measure indexed pages, qualified lead conversions, branded search and high-intent query results rather than promising rankings.
9. Review transitive dependency updates and npm audit results on each future lockfile refresh.

## Verification commands
```sh
npm ci
npm run lint
npm run test:growth
npm run build
npm run audit:seo
npm run audit:shell
```

The Growth Agent is still under active engineering. Not all items above are completed by the first website update.
