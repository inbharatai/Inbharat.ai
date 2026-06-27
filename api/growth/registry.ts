import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import {
  bustRegistryCache,
  ensureRegistryLoaded,
  getAuthorizedAssets,
  getRepoRegistry,
  logDeniedAttempt,
  logInfo,
} from "../../lib/growth/authorization.js";
import { adminAssetView, adminRepoView } from "../../lib/growth/redactRegistry.js";
import { mapAssetRow, mapRepoRow } from "../../lib/growth/authorization.js";

/**
 * /api/growth/registry — live-editable repo/asset registry (the founder's
 * "change repos/links + grant private-repo access" surface). Admin-only.
 *
 *   GET    → { assets:[redacted], repos:[redacted] }
 *   POST   { resource:'repo'|'asset', data }   → create (busts cache + logs)
 *   PATCH  { resource, key, patch }            → update (busts cache + logs)
 *   DELETE { resource, key }                   → delete (busts cache + logs)
 *
 * Single dispatching endpoint (Vercel file-routes one file → one path; we
 * branch on `resource` rather than nesting /repo /asset sub-paths).
 *
 * Server-side hard guards (the UI cannot weaken these):
 *   - refuse to DELETE / weaken any repo with publicRepoStatus='do_not_use'
 *     (the Sahayaak-Seva-former-name deny record stays forever).
 *   - refuse to set publicRepoStatus='do_not_use' on a NON-deny repo via PATCH
 *     of allowAgentRead — actually: refuse to FLIP allowAgentRead=true on a
 *     do_not_use repo (can't re-grant the denied one).
 *   - refuse to set canPublishDirectly=true on an asset (publish is never auto).
 *   - refuse to set requiresHumanApproval=false on an asset.
 *   - refuse to mutate editor_locked rows (founder unlocks via SQL/seed).
 *
 * Canonical PRIVATE repo names are writeable here (the founder grants access
 * by entering them) but are NEVER returned by GET — redactRepo collapses them
 * to hasPrivateRepo:true. They live only in this DB + the authed writes.
 */
const PUBLIC_REPO_STATUS = [
  "canonical_private",
  "public_mirror_current",
  "public_mirror_outdated",
  "public_demo_only",
  "deprecated_public_clone",
  "do_not_use",
] as const;
const SOURCE_OF_TRUTH = ["canonical_private", "do_not_use"] as const;
const ASSET_STATUS = ["active", "planned"] as const;

const optStr = z.string().nullable().optional();
const optBool = z.boolean().optional();

const RepoData = z.object({
  productName: z.string().min(1).max(120),
  productSlug: z.string().min(1).max(120),
  canonicalPrivateRepo: optStr,
  publicRepo: optStr,
  websitePath: optStr,
  sourceOfTruth: z.enum(SOURCE_OF_TRUTH).optional(),
  publicRepoStatus: z.enum(PUBLIC_REPO_STATUS).optional(),
  crawlPrivateRepo: optBool,
  crawlPublicRepo: optBool,
  allowAgentRead: optBool,
  allowAgentPR: optBool,
  notes: optStr,
});

const AssetData = z.object({
  domain: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  status: z.enum(ASSET_STATUS).optional(),
  canCrawl: optBool,
  canAudit: optBool,
  canDraft: optBool,
  canCreatePR: optBool,
  canPublishDirectly: optBool,
  requiresHumanApproval: optBool,
  notes: optStr,
});

const PostBody = z.object({
  resource: z.enum(["repo", "asset"]),
  data: z.unknown(),
});
const PatchBody = z.object({
  resource: z.enum(["repo", "asset"]),
  key: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
});
const DeleteBody = z.object({
  resource: z.enum(["repo", "asset"]),
  key: z.string().min(1),
});

/** snake_case column map for a repo write (camelCase patch → DB columns). */
const REPO_COLS: Record<string, string> = {
  productName: "product_name",
  productSlug: "product_slug",
  canonicalPrivateRepo: "canonical_private_repo",
  publicRepo: "public_repo",
  websitePath: "website_path",
  sourceOfTruth: "source_of_truth",
  publicRepoStatus: "public_repo_status",
  crawlPrivateRepo: "crawl_private_repo",
  crawlPublicRepo: "crawl_public_repo",
  allowAgentRead: "allow_agent_read",
  allowAgentPR: "allow_agent_pr",
  notes: "notes",
};
const ASSET_COLS: Record<string, string> = {
  domain: "domain",
  name: "name",
  status: "status",
  canCrawl: "can_crawl",
  canAudit: "can_audit",
  canDraft: "can_draft",
  canCreatePR: "can_create_pr",
  canPublishDirectly: "can_publish_directly",
  requiresHumanApproval: "requires_human_approval",
  notes: "notes",
};

function mapCols(patch: Record<string, unknown>, cols: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = cols[k];
    if (col) out[col] = v;
  }
  return out;
}

async function audit(adminId: string, action: string, scope: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  // Postgrest builders are PromiseLike (.then) but NOT Promises — .catch throws
  // synchronously; use .then(onFulfilled, onRejected) for the best-effort swallow.
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope, detail })
    .then(() => undefined, () => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    // Authed edit surface: return FULL rows (incl. canonicalPrivateRepo, so the
    // founder can edit private-repo links) + source/editor_locked/verify cols.
    // This is runtime data behind requireAdmin — never baked into the static
    // bundle. Falls back to the JSON seed (no source/lock/verify) when the DB
    // or the migration is absent.
    if (supabaseAdmin) {
      const [reposRes, assetsRes] = await Promise.all([
        supabaseAdmin.from("growth_repo_registry").select("*"),
        supabaseAdmin.from("growth_authorized_assets").select("*"),
      ]);
      if (!reposRes.error && !assetsRes.error) {
        const repos = (reposRes.data ?? []).map((row: Record<string, unknown>) =>
          adminRepoView(mapRepoRow(row), {
            source: (row.source as "seed" | "ui") ?? "seed",
            editorLocked: Boolean(row.editor_locked),
            lastCommitSha: (row.last_commit_sha as string | null) ?? null,
            lastCommitAt: (row.last_commit_at as string | null) ?? null,
            lastPrState: (row.last_pr_state as string | null) ?? null,
            lastCheckedAt: (row.last_checked_at as string | null) ?? null,
          }),
        );
        const assets = (assetsRes.data ?? []).map((row: Record<string, unknown>) =>
          adminAssetView(mapAssetRow(row), {
            source: (row.source as "seed" | "ui") ?? "seed",
            editorLocked: Boolean(row.editor_locked),
          }),
        );
        return res.status(200).json({ ok: true, requestId, repos, assets });
      }
    }
    // DB absent / not migrated → seed (read-only view, no lock/verify cols).
    await ensureRegistryLoaded();
    return res.status(200).json({
      ok: true,
      requestId,
      repos: getRepoRegistry().map((r) => adminRepoView(r)),
      assets: getAuthorizedAssets().map((a) => adminAssetView(a)),
      note: "DB not configured — showing seed (read-only).",
    });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured — registry edits require the DB.", requestId });
  }

  if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { resource, data } = parsed.data;

    if (resource === "repo") {
      const r = RepoData.safeParse(data);
      if (!r.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid repo data", requestId });
      // Hard guard: a freshly-created repo may be marked do_not_use (a deny record),
      // but it may NOT be created with allowAgentRead=true AND status do_not_use.
      if (r.data.publicRepoStatus === "do_not_use" && r.data.allowAgentRead === true) {
        void logDeniedAttempt({ allowed: false, reason: "refuse to grant read on a do_not_use repo", action: "createPR", scope: r.data.productSlug });
        return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Cannot grant agent read on a do_not_use repo.", requestId });
      }
      const row = mapCols(r.data as Record<string, unknown>, REPO_COLS);
      row.source = "ui";
      const { error } = await supabaseAdmin.from("growth_repo_registry").insert(row);
      if (error) {
        if (String(error.code) === "23505") return res.status(409).json({ ok: false, code: "CONFLICT", error: "A repo with that slug already exists.", requestId });
        return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB insert failed", requestId });
      }
      bustRegistryCache();
      await audit(admin.userId, "registry-repo-create", r.data.productSlug, JSON.stringify({ publicRepoStatus: r.data.publicRepoStatus, allowAgentRead: r.data.allowAgentRead }));
      return res.status(201).json({ ok: true, requestId });
    }

    // asset
    const a = AssetData.safeParse(data);
    if (!a.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid asset data", requestId });
    if (a.data.canPublishDirectly === true || a.data.requiresHumanApproval === false) {
      void logDeniedAttempt({ allowed: false, reason: "refuse to enable direct publish / disable human approval", action: "publish", scope: a.data.domain });
      return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Direct publish is never allowed; human approval is always required.", requestId });
    }
    const row = mapCols(a.data as Record<string, unknown>, ASSET_COLS);
    row.source = "ui";
    const { error } = await supabaseAdmin.from("growth_authorized_assets").insert(row);
    if (error) {
      if (String(error.code) === "23505") return res.status(409).json({ ok: false, code: "CONFLICT", error: "An asset with that domain already exists.", requestId });
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB insert failed", requestId });
    }
    bustRegistryCache();
    await audit(admin.userId, "registry-asset-create", a.data.domain, JSON.stringify({ status: a.data.status }));
    return res.status(201).json({ ok: true, requestId });
  }

  if (req.method === "PATCH") {
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { resource, key, patch } = parsed.data;

    const table = resource === "repo" ? "growth_repo_registry" : "growth_authorized_assets";
    const keyCol = resource === "repo" ? "product_slug" : "domain";
    const cols = resource === "repo" ? REPO_COLS : ASSET_COLS;

    // Fetch existing row (for editor_locked + deny guards).
    const { data: existing, error: feErr } = await supabaseAdmin.from(table).select("*").eq(keyCol, key).maybeSingle();
    if (feErr) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB lookup failed", requestId });
    if (!existing) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: `${resource} not found`, requestId });
    if (existing.editor_locked) {
      return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Row is editor-locked.", requestId });
    }

    // Hard guards (repo).
    if (resource === "repo") {
      const isDeny = existing.public_repo_status === "do_not_use";
      if (isDeny && patch.allowAgentRead === true) {
        void logDeniedAttempt({ allowed: false, reason: "refuse to re-grant read on do_not_use repo", action: "createPR", scope: key });
        return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Cannot grant agent read on a do_not_use repo.", requestId });
      }
      // Don't allow un-marking a deny record as no-longer-do_not_use via this UI
      // (the founder would need to do that deliberately via SQL/seed).
      if (isDeny && patch.publicRepoStatus && patch.publicRepoStatus !== "do_not_use") {
        return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Cannot un-mark a do_not_use repo from the UI.", requestId });
      }
    }
    // Hard guards (asset).
    if (resource === "asset") {
      if (patch.canPublishDirectly === true || patch.requiresHumanApproval === false) {
        void logDeniedAttempt({ allowed: false, reason: "refuse to enable direct publish / disable human approval", action: "publish", scope: key });
        return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Direct publish is never allowed; human approval is always required.", requestId });
      }
    }

    const row = mapCols(patch, cols);
    if (Object.keys(row).length === 0) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "No valid fields to update", requestId });
    row.source = "ui";

    const { error } = await supabaseAdmin.from(table).update(row).eq(keyCol, key);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
    bustRegistryCache();
    await audit(admin.userId, `registry-${resource}-update`, key, JSON.stringify(patch));
    return res.status(200).json({ ok: true, requestId });
  }

  if (req.method === "DELETE") {
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { resource, key } = parsed.data;

    const table = resource === "repo" ? "growth_repo_registry" : "growth_authorized_assets";
    const keyCol = resource === "repo" ? "product_slug" : "domain";

    const { data: existing, error: feErr } = await supabaseAdmin.from(table).select("*").eq(keyCol, key).maybeSingle();
    if (feErr) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB lookup failed", requestId });
    if (!existing) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: `${resource} not found`, requestId });
    if (existing.editor_locked) {
      return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Row is editor-locked.", requestId });
    }
    // Hard guard: the do_not_use deny record (Sahayaak-Seva former name) can never be deleted.
    if (resource === "repo" && existing.public_repo_status === "do_not_use") {
      void logDeniedAttempt({ allowed: false, reason: "refuse to delete do_not_use repo", action: "publish", scope: key });
      void logInfo("registry-repo-delete-denied", key, "attempted to delete a do_not_use repo");
      return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Cannot delete a do_not_use repo (deny record must persist).", requestId });
    }

    const { error } = await supabaseAdmin.from(table).delete().eq(keyCol, key);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB delete failed", requestId });
    bustRegistryCache();
    await audit(admin.userId, `registry-${resource}-delete`, key, "deleted");
    return res.status(200).json({ ok: true, requestId });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}