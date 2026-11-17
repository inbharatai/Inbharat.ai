# Dependency security scope — 16 November 2026

Dependency advisories and test results are different evidence. A successful build is not a vulnerability audit; a production-only audit is not a claim that developer tooling is clean.

## Current maintenance decision

Compatible package updates and scoped transitive patches reduced the earlier full audit from 54 findings to **9 high-severity findings** at the reviewed lockfile. The remaining dependency chain is the Vercel development CLI's framework tooling, which pins Zod 3.22.4 in `@vercel/backends`, `@vercel/express`, `@vercel/hono` and `@vercel/python-analysis`. The current advisory's fixed range is in Zod 4; no patched Zod 3 release was available in the inspected registry metadata. Updating to the latest inspected Vercel CLI did not eliminate that chain.

These findings remain **open**, not waived by a passing test. They are outside the production-only dependency graph, but still matter when running development/build tools, especially with untrusted project/configuration inputs. Do not describe this repository as universally vulnerability-free.

We have not forced Zod 4 into packages written against Zod 3, downgraded to unrelated old tooling merely to change audit output, disabled the scanner, or removed the Vercel CLI solely to hide the findings. Those approaches could break behavior or obscure rather than fix risk. Recheck upstream releases and retest any compatible remediation.

## Reproduce

```sh
npm ci
npm audit --omit=dev --audit-level=moderate
npm audit
npm run test:toolchain-compat
```

The first audit is the existing production release gate. The second intentionally reports all dependencies and may exit nonzero for the known development-tool findings. Neither command changes dependencies. Record their results separately, with the tested lockfile; counts can change as advisories are updated.

`test:toolchain-compat` exercises the APIs used by patched tooling (Vercel static configuration validation, file tracing, glob/minimatch, YAML/TOML and router parsing). It is not a hosted Vercel build, full vendor test suite, or proof that an advisory is harmless.

## Runtime compatibility

The browser/backend Supabase SDK is pinned to the previously used 2.97.0 line for Node 20 compatibility. A broad update had selected a Node-22-only SDK and broke server-side rendering through eager WebSocket initialization. Restoring the compatible line preserves the existing integration without activating the paused service. Do not upgrade runtime requirements or add a fake WebSocket/auth shim merely to hide that failure.

No dependency change authorizes access to hosted Supabase, secret inspection, or disabling authentication. The owner's current instruction is to leave Supabase inactive and preserve its integration for later reactivation.
