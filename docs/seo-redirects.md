# SEO redirects — canonical host + redirect chain verification

Recorded 2026-07-20 from live `curl` probes against the production deployment.
This documents the canonical-host redirect configuration so it is verifiable
and not silently dependent on a single maintainer's Vercel-dashboard memory.

## Canonical host

```
https://www.inbharat.ai
```

All sitemap `<loc>`, `<link rel="canonical">`, OG/Twitter URLs, and JSON-LD
`url` fields use this host (asserted by `scripts/test-growth.ts` "Sitemap
hygiene" block: every loc starts with `https://www.inbharat.ai/`, no `http://`
or apex variants).

## Redirect configuration location

The apex→www and http→https redirects are configured at the **Vercel
project / domain level** (Project → Settings → Domains), NOT in `vercel.json`.

`vercel.json` `redirects` are path-based and cannot express a host redirect
(apex→www) or a protocol redirect (http→https). Vercel instead:

- auto-upgrades `http://` → `https://` for any domain attached to the project; and
- redirects the non-primary domain to the primary domain when both `inbharat.ai`
  (apex) and `www.inbharat.ai` are attached and `www` is set primary.

Both behaviors are out-of-repo. This file is the in-repo record that they are
configured and verified.

## Observed redirect chains (2026-07-20)

| Request URL | Hops | Final | Notes |
|---|---|---|---|
| `https://www.inbharat.ai/` | 0 | 200 | Canonical — served directly. |
| `https://inbharat.ai/` | 1 | 308 → `https://www.inbharat.ai/` | Apex→www, one hop. Correct. |
| `http://www.inbharat.ai/` | 1 | 308 → `https://www.inbharat.ai/` | http→https only. Correct. |
| `http://inbharat.ai/` | 2 | → `https://inbharat.ai/` → `https://www.inbharat.ai/` | http→https **then** apex→www. |

### About the 2-hop `http://inbharat.ai/` case

This is **expected and unavoidable on Vercel**, not a misconfiguration:

1. `http://inbharat.ai/` → 308 → `https://inbharat.ai/` (Vercel's automatic TLS upgrade — one stage).
2. `https://inbharat.ai/` → 308 → `https://www.inbharat.ai/` (apex→www domain redirect — a separate stage).

Vercel performs these as two independent stages and does not collapse them
into a single hop. Google follows 2-hop chains without issue and indexes the
final destination (`https://www.inbharat.ai/`). The GSC "Page with redirect"
exclusion for `http://`/apex variants is the **correct, expected** outcome —
those URLs are not meant to be indexed; the canonical is. **Do not attempt to
"fix" this exclusion by validating it in GSC** — it is intentional.

If a chain of 3+ hops ever appears, that WOULD be a defect (an intermediate
path redirect piling onto the host/protocol stages) and should be fixed by
removing the intermediate path redirect.

## Re-verification

```bash
curl -sIL -o /dev/null -w "%{url_effective} -> status=%{http_code} hops=%{num_redirects}\n" http://inbharat.ai/
curl -sI  -o /dev/null -w "status=%{http_code} location=%{redirect_url}\n" https://inbharat.ai/
curl -sI  -o /dev/null -w "status=%{http_code} location=%{redirect_url}\n" http://www.inbharat.ai/
curl -sI  -o /dev/null -w "status=%{http_code} location=%{redirect_url}\n" https://www.inbharat.ai/
```

Expected: canonical 200; apex-https 308→www; http-www 308→https-www; http-apex
2 hops → `https://www.inbharat.ai/`.