/**
 * Fail-closed secret scan over tracked repository text files.
 *
 * This is intentionally hermetic and reuses the same high-signal detector that
 * protects Growth Engine model calls. It scans only tracked files, skips binary
 * assets, narrowly masks exact fixtures in their declared paths, and never prints a
 * matched value. Run in CI with: npm run audit:secrets
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { redact } from "../lib/growth/redaction.js";

const BINARY_EXTENSIONS = new Set([
  ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".webp", ".woff", ".woff2",
]);

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function isProbablyBinary(file: string, text: string): boolean {
  return BINARY_EXTENSIONS.has(extname(file).toLowerCase()) || text.includes("\0");
}

function maskDocumentedPlaceholders(file: string, text: string): string {
  let normalized = text
    // Whole assignments whose right-hand side explicitly reads an environment
    // variable. The repository contains only the reference, not the value.
    .replace(
      /^\s*[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*(?:(?:os\.getenv|env)\(["']?[A-Z][A-Z0-9_]+["']?\)|["']env\([A-Z][A-Z0-9_]+\)["'])\s*$/gim,
      "ENV_REFERENCE_ASSIGNMENT=empty",
    );
  if (file === ".env.example" || file.endsWith(".md")) {
    // Whole RHS only, with exact documented values. Never arbitrary <...>,
    // YOUR_*, PASTE_* or case-insensitive bare identifiers.
    normalized = normalized.replace(
      /^(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|GITHUB_TOKEN|CRON_SECRET)[ \t]*=[ \t]*(?:sk-\.\.\.|eyJ\.\.\.|<your-key>|<your-token>|<your-secret>)[ \t]*$/gm,
      "DOCUMENTED_PLACEHOLDER=empty",
    );
  }
  if (file === "content/articles/red-teaming-your-ai-feature-before-it-ships.md") {
    normalized = normalized.replace(/^api_key = "(?:YOUR)_INBHARAT_AI_API_KEY"$/gm, "DOCUMENTED_PLACEHOLDER=empty");
  }
  if (file === "scripts/set-growth-admin.mjs") {
    normalized = normalized.replace(/\bapikey: SERVICE_ROLE_KEY(?=,)/g, "apikey: [ENV_REFERENCE]");
  }
  if (file === "scripts/test-growth.ts") {
    normalized = normalized
      .replace(/(?<![\w-])sk_live_1234567890abcdef(?![\w-])/g, "[SYNTHETIC_API_KEY_FIXTURE]")
      .replace(/(?<![\w-])AKIA(?:IOSFODNN7EXAMPLE)(?![\w-])/g, "[SYNTHETIC_AWS_FIXTURE]")
      // Exact fake values exercised by scripts/test-growth.ts. Mask the literals,
      // not the whole file, so a newly committed real secret in that test still
      // fails this audit.
      .replace(/(?<![\w-])(?:sk_(?:live|proj)-1234567890abcdef|sk-(?:proj)-1234567890abcdef)(?![\w-])/g, "[SYNTHETIC_API_KEY_FIXTURE]")
      .replace(/password=(?:supersecret)-hunter2-9988abc(?![\w-])/g, "password=[SYNTHETIC_PASSWORD_FIXTURE]")
      .replace(/(?<![\w.-])eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJzdWIiOiIxMjM0NTY3ODkwIn0\.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c(?![\w.-])/g, "[SYNTHETIC_JWT_FIXTURE]")
      .replace(/-----BEGIN (?:PRIVATE KEY)-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggJjAgEAAoGB\\n-----END (?:PRIVATE KEY)-----/g, "[SYNTHETIC_PRIVATE_KEY_FIXTURE]");
  }
  return normalized;
}

export function scanText(file: string, text: string): string[] {
  const normalized = maskDocumentedPlaceholders(file, text);
  const kinds = new Set<string>();
  for (const line of normalized.split("\n")) {
    for (const match of redact(line).matches) kinds.add(match.kind);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(normalized)) {
    kinds.add("private_key_block");
  }
  return [...kinds];
}

function main(): void {
  const findings: Array<{ file: string; kinds: string[] }> = [];
  for (const file of trackedFiles()) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      findings.push({ file, kinds: ["unreadable_tracked_file"] });
      continue;
    }
    if (isProbablyBinary(file, text)) continue;
    const kinds = scanText(file, text);
    if (kinds.length > 0) findings.push({ file, kinds });
  }

  if (findings.length > 0) {
    console.error(`audit-secrets: ${findings.length} tracked file(s) contain secret-like material:`);
    for (const finding of findings) {
      console.error(`  ${finding.file}: ${finding.kinds.join(", ")}`);
    }
    console.error("Matched values are intentionally withheld. Remove the value or document a narrow synthetic fixture.");
    process.exit(1);
  }

  console.log(`audit-secrets: passed (${trackedFiles().length} tracked files, no high-signal secrets)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
