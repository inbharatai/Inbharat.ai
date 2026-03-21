# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

If you discover a security vulnerability in InBharat AI, **please do not open a public GitHub issue.**

Instead, report it responsibly:

- **Email:** security@inbharat.ai
- **GitHub:** Use [GitHub's private vulnerability reporting](https://github.com/inbharatai/Inbharat.ai/security/advisories/new)

Please include:

1. A description of the vulnerability and its potential impact
2. Steps to reproduce or a proof-of-concept
3. Any suggested fix (optional but appreciated)

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation within **14 days** for confirmed vulnerabilities.

## Security Best Practices (for contributors)

- **Never commit secrets.** Use environment variables (see `.env.example`).
- The `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **server-side only** — they must not be exposed to the browser.
- All `/api/*` routes verify the Supabase session token before processing requests.
- The Supabase anon key (`VITE_SUPABASE_ANON_KEY`) is safe to expose — Row Level Security (RLS) enforces data access.
