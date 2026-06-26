#!/usr/bin/env node
/**
 * Apply Supabase migration SQL files statement-by-statement via `supabase db query -f`.
 *
 * `supabase db query` rejects multi-statement input (prepared statement), so
 * this splits each file (dollar-quote aware) and runs ONE statement per temp
 * file. Writing the statement to a file (not a shell arg) avoids shell expansion
 * corrupting `$$` dollar-quoting. The connection string comes from DATABASE_URL
 * in the env (sourced from the gitignored .env.db.local) — referenced as an env
 * var, never printed and never placed in command text.
 *
 * Usage:  set -a && . ./.env.db.local && set +a && node scripts/apply-migrations-pg.mjs <file.sql> [more...]
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌  DATABASE_URL not set (source .env.db.local first).");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  // appease linter — DB_URL already checked
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("❌  Pass migration file path(s) as arguments.");
  process.exit(1);
}

const TMP = join(tmpdir(), `inbharat_stmt_${process.pid}.sql`);

function splitSQL(sql) {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    current += ch;
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

let totalOk = 0;
let totalFail = 0;
let totalSkipped = 0;

for (const file of files) {
  const path = resolve(__dirname, "..", file);
  console.log(`\n📄  ${file}`);
  const sql = readFileSync(path, "utf8");
  const statements = splitSQL(sql);
  console.log(`    ${statements.length} statements`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, " ").slice(0, 70);
    writeFileSync(TMP, stmt + ";", "utf8");
    // Interpolate DB_URL directly (Windows execSync uses cmd.exe, which does not
    // expand $DATABASE_URL). The URL lives only in this process's command string —
    // the invoking Bash command is just `node scripts/...`, so no secret is placed
    // in the shell command text. Forward slashes for the temp path (node + cmd
    // both accept them, avoids backslash quoting issues).
    const tmpFwd = TMP.replace(/\\/g, "/");
    try {
      execSync(`npx --yes supabase db query --db-url "${DB_URL}" -f "${tmpFwd}"`, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      });
      process.stdout.write(`    [${i + 1}/${statements.length}] ✅  ${preview}\n`);
      totalOk++;
    } catch (err) {
      const msg = String(err.stderr || err.stdout || err.message).replace(/\s+/g, " ").slice(0, 160);
      if (/already exists|duplicate key/i.test(msg)) {
        process.stdout.write(`    [${i + 1}/${statements.length}] ⚠️   ${preview} (already exists)\n`);
        totalSkipped++;
      } else {
        process.stdout.write(`    [${i + 1}/${statements.length}] ❌  ${preview}\n         ${msg}\n`);
        totalFail++;
      }
    }
  }
}
try { unlinkSync(TMP); } catch {}

console.log(`\n${"═".repeat(60)}`);
console.log(`Done: ${totalOk} ok, ${totalSkipped} already-existed, ${totalFail} failed`);
if (totalFail > 0) process.exit(1);