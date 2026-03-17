#!/usr/bin/env node
/**
 * InBharat AI — Supabase Migration Runner
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env,
 * then executes each migration SQL file against the database.
 *
 * Usage:
 *   node scripts/run-migration.mjs                    # run all pending
 *   node scripts/run-migration.mjs 20260317000000     # run specific migration
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Load .env manually (no dotenv dep needed) ──────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env not found — use existing env */ }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || SUPABASE_URL.includes("your-project-ref")) {
  console.error("❌  SUPABASE_URL not set in .env — add your project URL first.");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.includes("your-service-role")) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY not set in .env — add your service role key first.");
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "").split(".")[0];
console.log(`🔗  Project: ${PROJECT_REF}`);
console.log(`📡  URL: ${SUPABASE_URL}\n`);

// ── Split SQL into individual statements ───────────────────────────────────
function splitSQL(sql) {
  // Remove single-line comments
  const noComments = sql.replace(/--[^\n]*/g, "");
  // Split on semicolons, keeping dollar-quoted blocks ($$) intact
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    current += ch;

    // Detect $$ or $tag$ dollar quoting
    if (!inDollarQuote && ch === "$") {
      const end = noComments.indexOf("$", i + 1);
      if (end !== -1) {
        dollarTag = noComments.slice(i, end + 1);
        inDollarQuote = true;
        i = end;
        current = current.slice(0, -1) + dollarTag;
        continue;
      }
    }
    if (inDollarQuote && noComments.slice(i, i + dollarTag.length) === dollarTag) {
      current += noComments.slice(i + 1, i + dollarTag.length);
      i += dollarTag.length - 1;
      inDollarQuote = false;
      dollarTag = "";
      continue;
    }

    if (!inDollarQuote && ch === ";") {
      const stmt = current.trim().replace(/;$/, "").trim();
      if (stmt.length > 3) statements.push(stmt);
      current = "";
    }
  }
  const last = current.trim().replace(/;$/, "").trim();
  if (last.length > 3) statements.push(last);
  return statements;
}

// ── Execute SQL via Supabase Management REST API ───────────────────────────
async function executeSQL(sql) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    // Try the direct REST endpoint as fallback
    const fallbackUrl = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
    const fallback = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sql }),
    });
    if (!fallback.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    return fallback.json().catch(() => ({}));
  }
  return response.json().catch(() => ({}));
}

// ── Get migration files ────────────────────────────────────────────────────
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const targetId = process.argv[2]; // optional: run specific migration

const allFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith(".sql"))
  .sort();

const filesToRun = targetId
  ? allFiles.filter(f => f.startsWith(targetId))
  : allFiles;

if (filesToRun.length === 0) {
  console.error(`❌  No migration files found${targetId ? ` matching "${targetId}"` : ""}`);
  process.exit(1);
}

// ── Run migrations ─────────────────────────────────────────────────────────
let totalOk = 0;
let totalFail = 0;

for (const file of filesToRun) {
  console.log(`\n📄  Running migration: ${file}`);
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const statements = splitSQL(sql);
  console.log(`    ${statements.length} statements found`);

  let fileOk = 0;
  let fileFail = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
    try {
      await executeSQL(stmt);
      process.stdout.write(`    [${i + 1}/${statements.length}] ✅  ${preview}\n`);
      fileOk++;
    } catch (err) {
      const msg = err.message || String(err);
      // "already exists" errors are OK for idempotent migrations
      if (/already exists|duplicate/i.test(msg)) {
        process.stdout.write(`    [${i + 1}/${statements.length}] ⚠️   ${preview} (already exists — skipped)\n`);
        fileOk++;
      } else {
        process.stdout.write(`    [${i + 1}/${statements.length}] ❌  ${preview}\n`);
        console.error(`         Error: ${msg}`);
        fileFail++;
      }
    }
  }

  console.log(`\n    ✅ ${fileOk} succeeded  ❌ ${fileFail} failed`);
  totalOk += fileOk;
  totalFail += fileFail;
}

console.log(`\n${"═".repeat(60)}`);
console.log(`Migration complete: ${totalOk} succeeded, ${totalFail} failed`);
if (totalFail > 0) {
  console.log("⚠️  Some statements failed. Check errors above.");
  console.log("   You can also run the SQL manually in Supabase Dashboard → SQL Editor.");
  process.exit(1);
} else {
  console.log("🎉  All migrations applied successfully!");
}
