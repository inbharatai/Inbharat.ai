#!/usr/bin/env node
/**
 * InBharat AI — set Growth Agent admin role on a Supabase user (hands-free).
 *
 * Uses the Supabase GoTrue admin API (which accepts the service-role key) to set
 * app_metadata.role = "admin" on the founder's account. The server-side admin
 * gate (api/lib/requireAdmin.ts) reads app_metadata via getUserById at request
 * time, so this takes effect immediately — no redeploy, no re-sign-in.
 *
 * The service-role key is read from the environment (sourced from the gitignored
 * .env.local produced by `vercel env pull`) and is NEVER printed. Only a masked
 * user id + the resulting app_metadata are logged.
 *
 * Usage:  set -a && . ./.env.local && set +a && node scripts/set-growth-admin.mjs [email]
 */
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.argv[2] || "reetu004@gmail.com").toLowerCase();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in env (source .env.local first).");
  process.exit(1);
}

function adminHeaders(json = true) {
  const h = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function findUserByEmail(email) {
  // Page through auth users (GoTrue admin) until we find the matching email.
  let page = 1;
  const perPage = 100;
  while (page < 50) {
    const url = `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, { headers: adminHeaders(false) });
    if (!res.ok) throw new Error(`list users HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    const body = await res.json();
    const users = body.users || body || [];
    if (!Array.isArray(users) || users.length === 0) break;
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < perPage) break;
    page++;
  }
  return null;
}

async function setAdminRole(uid) {
  // PUT /auth/v1/admin/users/:uid merges app_metadata.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: "PUT",
    headers: adminHeaders(true),
    body: JSON.stringify({ app_metadata: { role: "admin" } }),
  });
  if (!res.ok) throw new Error(`update user HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

function maskId(id) {
  if (!id) return "(none)";
  return id.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

try {
  console.log(`🔗  Project: ${SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")}`);
  console.log(`🔎  Looking up user: ${EMAIL}`);
  const user = await findUserByEmail(EMAIL);
  if (!user) {
    console.error(`❌  No auth user found for ${EMAIL}. Sign up / sign in once first, then re-run.`);
    process.exit(1);
  }
  console.log(`✅  Found user ${maskId(user.id)} (existing role: ${JSON.stringify(user.app_metadata?.role ?? null)})`);
  const updated = await setAdminRole(user.id);
  const role = updated?.app_metadata?.role ?? updated?.user?.app_metadata?.role;
  console.log(`🎉  app_metadata.role is now: ${JSON.stringify(role)}`);
  if (role === "admin") {
    console.log("\nDone. Sign in at https://www.inbharat.ai/admin/growth — the gate reads this live, no redeploy needed.");
  } else {
    console.error("\n⚠️  Role did not persist as 'admin'. Check the response above.");
    process.exit(1);
  }
} catch (e) {
  console.error(`\n❌  Failed: ${e.message}`);
  process.exit(1);
}