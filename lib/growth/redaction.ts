/**
 * InBharat Growth Agent — Module 4: Secret Redactor.
 *
 * Run before ANY content is sent to a model. Detects and masks secrets:
 * env files, credential JSON, keys/certs, API tokens, passwords, database
 * URLs, Supabase service-role keys, Railway/Vercel/OAuth/JWT secrets, and
 * private contact info. Also reports which file paths must never be read.
 *
 * Pure + hermetically testable (no I/O).
 */

/** File basenames / globs the repo-reader must never open. */
export const FORBIDDEN_PATHS: string[] = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.example",
  "credentials.json",
  "service-account.json",
  "service-account*.json",
  "*.pem",
  "*.key",
  "*.p12",
  "*.keystore",
];

export interface RedactionResult {
  containedSecret: boolean;
  redacted: string;
  matches: { kind: string; preview: string }[];
}

/**
 * High-signal secret patterns. Each is intentionally narrow to avoid
 * false-positives on ordinary prose, but together they cover the classes
 * listed in the master plan.
 */
const SECRET_PATTERNS: { kind: string; re: RegExp }[] = [
  // OpenAI / Anthropic / Google AI keys
  { kind: "openai_key", re: /\bsk-[a-zA-Z0-9_-]{20,}\b/g },
  { kind: "google_ai_key", re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { kind: "anthropic_key", re: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g },
  // AWS access key id
  { kind: "aws_access_key", re: /\bAKIA[0-9A-Z]{16,}\b/g },
  // Generic long bearer / token assignments
  { kind: "token_assignment", re: /\b(api[_-]?key|token|secret|access[_-]?token|bearer|password|passwd|client[_-]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}["']?/gi },
  // Supabase service role keys (eyJ... JWT-shaped)
  { kind: "supabase_service_key", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  // Database / connection URLs with credentials
  { kind: "db_url_credentials", re: /\b(?:postgres|postgresql|mongodb(?:\+srv)?|mysql|redis|amqp):\/\/[^:@/\s]+:[^@/\s]+@[^/\s'"]+/gi },
  // Generic URL with embedded user:pass@. Keep both credential fields inside
  // the authority so query strings containing @ (for example Google Fonts)
  // cannot be misclassified as credentials.
  { kind: "url_credentials", re: /\bhttps?:\/\/[^:@/\s]+:[^@/\s]+@/gi },
  // Private key PEM blocks
  { kind: "private_key_block", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  // .env-style lines (KEY=value) where value looks secret-ish
  { kind: "env_secret_line", re: /^[ \t]*(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GROWTH_OPENAI_API_KEY|GITHUB_TOKEN|GH_TOKEN|CRON_SECRET|STRIPE_SECRET_KEY|AWS_SECRET_ACCESS_KEY|JWT_SECRET|OAUTH_CLIENT_SECRET|RAILWAY_API_KEY|VERCEL_TOKEN)\s*=\s*.+$/gmi },
  // JWTs
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
];

const PLACEHOLDER = "[REDACTED]";

/** True if the input contains anything that looks like a secret. */
export function containsSecret(input: string): boolean {
  return SECRET_PATTERNS.some((p) => {
    p.re.lastIndex = 0;
    return p.re.test(input);
  });
}

/** Mask every secret match, returning the redacted text and what was found. */
export function redact(input: string): RedactionResult {
  let redacted = input;
  const matches: { kind: string; preview: string }[] = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      matches.push({ kind, preview: preview(m[0]) });
      redacted = redacted.split(m[0]).join(PLACEHOLDER);
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length
    }
  }
  return { containedSecret: matches.length > 0, redacted, matches };
}

function preview(s: string): string {
  if (s.length <= 12) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

/** Should this file path be skipped entirely by the repo-reader? */
export function isForbiddenPath(path: string): boolean {
  const base = path.split("/").pop() || path;
  return FORBIDDEN_PATHS.some((p) => {
    if (p.includes("*")) {
      const re = new RegExp("^" + p.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      return re.test(base);
    }
    return base === p;
  });
}