# Canonical redirects: policy and observed behavior

Reviewed 16 November 2026. The canonical origin is `SITE.url` in `seo.config.ts`, currently `https://www.inbharat.ai`. Public sitemap, canonical and entity URLs derive from that origin. Redirect-source examples below intentionally include the apex and HTTP variants.

## Configuration vs observation

The previous deployment records place the main-host redirects in Vercel's project/domain settings, not in this repository's redirect array. The 16 November review verified the HTTP responses below; it did **not** inspect the dashboard configuration. An empty `redirects` array alone does not prove a missing redirect.

Vercel route redirects can use host conditions. The old statement that `vercel.json` cannot express a host-conditioned redirect was incorrect. Host/protocol normalization can involve platform settings as well as application rules; check the deployed behavior rather than assuming one mechanism.

## Fresh read-only GET observations

| Request | Observed chain |
|---|---|
| `https://www.inbharat.ai/` | 200 directly |
| `https://inbharat.ai/` | 308 → `https://www.inbharat.ai/` → 200 |
| `http://inbharat.ai/` | 308 → `https://inbharat.ai/` → 308 → `https://www.inbharat.ai/` → 200 |
| `https://www.inbharat.ai/unoone/` | 308 → `/unoone` → 200 |

The final 200 is **not** another redirect hop. The Growth auditor now counts only redirect statuses (301/302/303/307/308). The observed two-hop HTTP-apex path is not by itself an indexing failure. Avoid unnecessary chains, but do not treat every redirect exclusion in Search Console as a defect: alternate URLs intentionally redirect to the canonical.

These responses do not prove which URL Google has indexed or selected as canonical. That requires Search Console evidence. They also do not prove all route/asset/SILT variants behave correctly.

## Re-verification

```sh
curl -sSL -o /dev/null -w '%{url_effective} status=%{http_code} redirects=%{num_redirects}\n' http://inbharat.ai/
curl -sSL -o /dev/null -w '%{url_effective} status=%{http_code} redirects=%{num_redirects}\n' https://inbharat.ai/
curl -sSL -o /dev/null -w '%{url_effective} status=%{http_code} redirects=%{num_redirects}\n' https://www.inbharat.ai/unoone/
```

Run `npm run audit:deployment` after production promotion for current route/status/schema contracts. Run browser navigation checks separately. Vite preview does not execute Vercel middleware or establish production domain configuration.
