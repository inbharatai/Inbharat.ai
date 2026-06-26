#!/usr/bin/env tsx
/**
 * InBharat Growth Agent — seed the DB-backed registry + founder rules.
 *
 * Run AFTER applying supabase/migrations/20260626000001_growth_registry_rules.sql.
 * Idempotent: repos/assets use INSERT ... ON CONFLICT DO NOTHING (a founder's UI
 * edits are never overwritten by a re-seed); the 3 global rules are seeded only
 * if no global rules exist yet.
 *
 * Sources SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment —
 * on Windows:  set -a && . ./.env.local && set +a && npx tsx scripts/seed-growth-registry.ts
 * (PowerShell: get-content .env.local | foreach { ... } — easier: use bash via Git Bash)
 *
 * The RHCF-Seva deny row is seeded exactly as in config/repo-registry.json
 * (allow_agent_read=false, public_repo_status='do_not_use') and editor_locked so
 * it can be neither edited nor deleted from the UI — the deny persists forever.
 */
import { createRequire } from "node:module";
import { supabaseAdmin } from "../api/lib/supabaseAdmin.js";
import type { AuthorizedAssetsConfig, RepoRegistry } from "../lib/growth/types.js";

const cfgRequire = createRequire(import.meta.url);
const reposConfig = cfgRequire("../config/repo-registry.json") as RepoRegistry;
const assetsConfig = cfgRequire("../config/growth-authorized-assets.json") as AuthorizedAssetsConfig;

function repoRow(r: RepoRegistry["repos"][number]) {
  return {
    product_name: r.productName,
    product_slug: r.productSlug,
    canonical_private_repo: r.canonicalPrivateRepo,
    public_repo: r.publicRepo,
    website_path: r.websitePath,
    source_of_truth: r.sourceOfTruth,
    public_repo_status: r.publicRepoStatus,
    crawl_private_repo: r.crawlPrivateRepo,
    crawl_public_repo: r.crawlPublicRepo,
    allow_agent_read: r.allowAgentRead,
    allow_agent_pr: r.allowAgentPR,
    notes: r.notes,
    source: "seed" as const,
    // The do_not_use deny record is locked so the UI can't edit or delete it.
    editor_locked: r.publicRepoStatus === "do_not_use",
  };
}

function assetRow(a: AuthorizedAssetsConfig["assets"][number]) {
  return {
    domain: a.domain,
    name: a.name,
    status: a.status,
    can_crawl: a.canCrawl,
    can_audit: a.canAudit,
    can_draft: a.canDraft,
    can_create_pr: a.canCreatePR,
    can_publish_directly: a.canPublishDirectly, // always false in the seed
    requires_human_approval: a.requiresHumanApproval, // always true
    notes: a.notes,
    source: "seed" as const,
  };
}

// Founder-authored global rules — the agent's standing "memory".
const SEED_RULES = [
  {
    scope: "global",
    scope_key: null,
    kind: "dont",
    rule_text:
      "Never mention 'UniGurus'. The product is UniAssist. If asked about UniGurus, redirect to UniAssist without using the word UniGurus.",
  },
  {
    scope: "global",
    scope_key: null,
    kind: "voice",
    rule_text:
      "Healthcare / field-worker positioning lives under Sahayaak Seva only. Never surface 'RHCF Seva' under its own name — it is the former name. Always say Sahayaak Seva.",
  },
  {
    scope: "global",
    scope_key: null,
    kind: "voice",
    rule_text:
      "Promote in the founder's first-person voice (Reeturaj). Confident, plainspoken, no hype words. Lead with the user benefit, not the tech.",
  },
] as const;

async function main() {
  if (!supabaseAdmin) {
    console.error("❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in env (source .env.local first).");
    process.exit(1);
  }

  const repoRows = reposConfig.repos.map(repoRow);
  const assetRows = assetsConfig.assets.map(assetRow);

  const { error: repoErr } = await supabaseAdmin
    .from("growth_repo_registry")
    .upsert(repoRows, { onConflict: "product_slug", ignoreDuplicates: true });
  if (repoErr) {
    console.error("❌  repo seed failed:", repoErr.message);
    process.exit(1);
  }

  const { error: assetErr } = await supabaseAdmin
    .from("growth_authorized_assets")
    .upsert(assetRows, { onConflict: "domain", ignoreDuplicates: true });
  if (assetErr) {
    console.error("❌  asset seed failed:", assetErr.message);
    process.exit(1);
  }

  // Seed global rules only if none exist yet (idempotent — no natural unique key).
  const { data: existing, error: ruleErr } = await supabaseAdmin
    .from("growth_agent_rules")
    .select("id")
    .eq("scope", "global")
    .limit(1);
  if (ruleErr) {
    console.error("❌  rules lookup failed:", ruleErr.message);
    process.exit(1);
  }
  if (existing && existing.length === 0) {
    const { error: insertErr } = await supabaseAdmin
      .from("growth_agent_rules")
      .insert(SEED_RULES.map((r) => ({ ...r, enabled: true, created_by: "seed" })));
    if (insertErr) {
      console.error("❌  rules seed failed:", insertErr.message);
      process.exit(1);
    }
    console.log(`✅  Seeded ${SEED_RULES.length} global rules.`);
  } else {
    console.log("ℹ️  Global rules already present — skipped seeding rules.");
  }

  const deny = reposConfig.repos.find((r) => r.publicRepoStatus === "do_not_use");
  if (deny) {
    console.log(`🔒  Deny record '${deny.productSlug}' seeded with allow_agent_read=false, editor_locked=true.`);
  }
  console.log(`🎉  Seeded ${repoRows.length} repos + ${assetRows.length} assets (on-conflict-do-nothing).`);
}

main().catch((e) => {
  console.error(`\n❌  Failed: ${e?.message ?? e}`);
  process.exit(1);
});