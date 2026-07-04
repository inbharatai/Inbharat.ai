#!/usr/bin/env node
/**
 * apply-migrations.cjs — apply pending Supabase migrations to the live DB.
 *
 * Hands-free: connects via the postgres connection string (env SUPABASE_DB_URL
 * or PG env vars), reads supabase/migrations/*.sql in order, skips anything
 * already recorded in supabase_migrations.schema_migrations, applies the rest,
 * and records each. Idempotent — safe to re-run. Each migration file is wrapped
 * in its own transaction; a failure rolls back that file and aborts (so order is
 * never partially applied silently).
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres:PW@db.REF.supabase.co:5432/postgres" \
 *     node scripts/apply-migrations.cjs
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

function buildConfig() {
  // Prefer an explicit connection string; fall back to PG* env vars (pg reads
  // these natively, and they dodge URI-parsing issues with special chars in the
  // password like '!').
  if (process.env.SUPABASE_DB_URL) {
    return { connectionString: process.env.SUPABASE_DB_URL };
  }
  if (process.env.PGHOST || process.env.PGUSER) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "postgres",
    };
  }
  return null;
}

async function main() {
  const cfg = buildConfig();
  if (!cfg) {
    console.error("Set SUPABASE_DB_URL (or PGHOST/PGUSER/PGPASSWORD) to connect.");
    process.exit(2);
  }
  const client = new Client({
    ...cfg,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  await client.connect();
  console.log("CONNECTED");

  // Ensure the migrations tracking table exists (Supabase manages this; create if absent).
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text,
      statements jsonb
    );
  `);

  const { rows: applied } = await client.query(
    "SELECT version FROM supabase_migrations.schema_migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let pending = 0,
    ok = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    const name = file.replace(/\.sql$/, "").slice(version.length + 1);
    if (appliedSet.has(version)) {
      continue;
    }
    pending++;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`APPLY ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING",
        [version, name, ["applied via apply-migrations.cjs"]]
      );
      await client.query("COMMIT");
      console.log("OK");
      ok++;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      console.error(`  → ${e.message}`);
      await client.end();
      process.exit(1);
    }
  }

  if (pending === 0) console.log("All migrations already applied — nothing to do.");
  else console.log(`Applied ${ok}/${pending} pending migration(s).`);
  await client.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});