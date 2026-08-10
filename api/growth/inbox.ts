import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { INBOX_BUCKET, MAX_BYTES, isAllowedExt, inboxPath, sanitizeFolder, markFolderFedToAgent, unmarkFolderFedToAgent, setPostOrder, setAltText } from "../../lib/growth/inbox.js";

/**
 * /api/growth/inbox — content drop-folder. Admin-only.
 *   POST /sign    { filename, contentType, size, sha256, folder? } → { uploadUrl, path }
 *   POST /confirm { path, sha256, kind, originalName, folder? }    → { ok, itemId, duplicate? }
 *   POST /feed    { folder }   → mark folder (+sub-folders) fed-to-agent (context)
 *   POST /unfeed  { folder }   → un-feed a folder
 *   GET                                             → { items: [...] }  (+ signed preview URLs)
 *   DELETE { itemId }                               → delete object + row (blocks if ingested)
 *
 * The browser never sees the Supabase service key — it gets a short-lived signed
 * upload URL from /sign and PUTs the file directly to Supabase Storage. `folder`
 * groups drops (folder upload); dedup is scoped to (sha256, folder).
 */
const SignBody = z.object({
  filename: z.string().min(1).max(120),
  contentType: z.string().max(120).optional(),
  size: z.number().int().min(1).max(MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  folder: z.string().max(160).optional(),
});
const ConfirmBody = z.object({
  path: z.string().min(1).max(200),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.string().min(1).max(20),
  originalName: z.string().max(120).optional(),
  folder: z.string().max(160).optional(),
});
const FeedBody = z.object({ folder: z.string().min(1).max(160) });
const DeleteBody = z.object({ itemId: z.string().min(1) });
// Social publishing (migration 20260810000002): order a folder's media for a
// carousel/post, and annotate an item with alt text. Additive — pre-existing
// actions are untouched.
const ReorderBody = z.object({
  order: z.array(z.object({ itemId: z.string().min(1), postOrder: z.number().int().min(0).max(10000) })).min(1).max(50),
});
const AnnotateBody = z.object({ itemId: z.string().min(1), altText: z.string().max(1000) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured.", requestId });
  }

  if (req.method === "POST" && req.query?.action === "sign") {
    const parsed = SignBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need filename/size/sha256, ≤50MB, allowed ext).", requestId });
    if (!isAllowedExt(parsed.data.filename)) {
      return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "File type not allowed.", requestId });
    }
    const folder = sanitizeFolder(parsed.data.folder ?? "");
    const path = inboxPath(parsed.data.sha256, parsed.data.filename, folder);
    const { data, error } = await supabaseAdmin.storage.from(INBOX_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `signed URL failed: ${error?.message ?? "unknown"}`, requestId });
    }
    return res.status(200).json({ ok: true, requestId, uploadUrl: (data as { signedUrl?: string; signedUploadUrl?: string }).signedUploadUrl ?? (data as { signedUrl?: string }).signedUrl, path, contentType: parsed.data.contentType });
  }

  if (req.method === "POST" && req.query?.action === "confirm") {
    const parsed = ConfirmBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body.", requestId });
    const folder = sanitizeFolder(parsed.data.folder ?? "");
    // Dedup on (sha256, folder) — same content may live in two folders. If the
    // `folder` column isn't on the live DB yet (migration 20260627000001 pending),
    // the folder-scoped query errors; fall back to dedup on sha256 only so uploads
    // still work pre-migration (folder just isn't recorded until applied).
    const dedupWithFolder = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id")
      .eq("sha256", parsed.data.sha256)
      .eq("folder", folder)
      .maybeSingle();
    if (dedupWithFolder.error) {
      const { data: existingLegacy } = await supabaseAdmin
        .from("growth_inbox_items")
        .select("id")
        .eq("sha256", parsed.data.sha256)
        .maybeSingle();
      if (existingLegacy?.id) return res.status(200).json({ ok: true, requestId, duplicate: true, itemId: existingLegacy.id });
    } else if (dedupWithFolder.data?.id) {
      return res.status(200).json({ ok: true, requestId, duplicate: true, itemId: dedupWithFolder.data.id });
    }
    const insert = await supabaseAdmin
      .from("growth_inbox_items")
      .insert({
        storage_path: parsed.data.path,
        kind: parsed.data.kind,
        original_name: parsed.data.originalName ?? null,
        status: "pending",
        sha256: parsed.data.sha256,
        folder,
      })
      .select("id")
      .single();
    if (insert.error || !insert.data) {
      // folder column missing → retry without it (legacy schema).
      if (folder) {
        const legacy = await supabaseAdmin
          .from("growth_inbox_items")
          .insert({
            storage_path: parsed.data.path,
            kind: parsed.data.kind,
            original_name: parsed.data.originalName ?? null,
            status: "pending",
            sha256: parsed.data.sha256,
          })
          .select("id")
          .single();
        if (legacy.error || !legacy.data) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `DB insert failed: ${legacy.error?.message ?? "unknown"}`, requestId });
        return res.status(201).json({ ok: true, requestId, itemId: legacy.data.id, note: "folder not recorded — apply migration 20260627000001 to enable folders." });
      }
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `DB insert failed: ${insert.error?.message ?? "unknown"}`, requestId });
    }
    return res.status(201).json({ ok: true, requestId, itemId: insert.data.id });
  }

  if (req.method === "POST" && (req.query?.action === "feed" || req.query?.action === "unfeed")) {
    const parsed = FeedBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need folder).", requestId });
    const folder = sanitizeFolder(parsed.data.folder);
    if (!folder) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid folder.", requestId });
    // The feed feature needs the Phase B columns (folder, fed_to_agent). Probe
    // once; if the live DB hasn't had migration 20260627000001 applied yet, tell
    // the founder clearly instead of silently returning count 0.
    const probe = await supabaseAdmin.from("growth_inbox_items").select("folder").limit(1);
    if (probe.error && /folder|column|schema/i.test(probe.error.message)) {
      return res.status(503).json({ ok: false, code: "MIGRATION_PENDING", error: "Inbox folders aren't live yet — apply migration 20260627000001 (supabase db push) to enable Feed-to-agent.", requestId });
    }
    const count = req.query.action === "feed" ? await markFolderFedToAgent(folder) : await unmarkFolderFedToAgent(folder);
    return res.status(200).json({ ok: true, requestId, folder, count });
  }

  if (req.method === "POST" && req.query?.action === "reorder") {
    const parsed = ReorderBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need order:[{itemId,postOrder}]).", requestId });
    // The post_order column arrives in migration 20260810000002. Probe once so a
    // pre-migration DB gets a clear message instead of a silent count 0.
    const probe = await supabaseAdmin.from("growth_inbox_items").select("post_order").limit(1);
    if (probe.error && /post_order|column|schema/i.test(probe.error.message)) {
      return res.status(503).json({ ok: false, code: "MIGRATION_PENDING", error: "Media ordering isn't live yet — apply migration 20260810000002 (supabase db push).", requestId });
    }
    const count = await setPostOrder(parsed.data.order);
    return res.status(200).json({ ok: true, requestId, count });
  }

  if (req.method === "POST" && req.query?.action === "annotate") {
    const parsed = AnnotateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need itemId, altText).", requestId });
    const probe = await supabaseAdmin.from("growth_inbox_items").select("alt_text").limit(1);
    if (probe.error && /alt_text|column|schema/i.test(probe.error.message)) {
      return res.status(503).json({ ok: false, code: "MIGRATION_PENDING", error: "Alt text isn't live yet — apply migration 20260810000002 (supabase db push).", requestId });
    }
    const ok = await setAltText(parsed.data.itemId, parsed.data.altText);
    if (!ok) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "item not found", requestId });
    return res.status(200).json({ ok: true, requestId });
  }

  if (req.method === "GET") {
    // Try the full column set (Phase B: folder, fed_to_agent). If the live DB
    // hasn't had migration 20260627000001 applied yet, PostgREST rejects the
    // unknown columns — fall back to the legacy column set so the UI degrades
    // (folder="" / fed_to_agent=null) instead of hard-erroring "DB read failed".
    // post_order + alt_text (migration 20260810000002) ride in the full set; the
    // legacy fallback (folder/fed_to_agent absent) also lacks them, so map nulls.
    const FULL_COLS = "id,storage_path,kind,original_name,status,sha256,folder,fed_to_agent,post_order,alt_text,linked_draft_id,error,created_at,ingested_at";
    // Phase B set: folder/fed_to_agent live (20260627000001) but post_order/alt_text
    // not yet (20260810000002) — so a middle tier keeps folders working when only
    // the social migration is pending. Legacy: neither applied.
    const PHASE_B_COLS = "id,storage_path,kind,original_name,status,sha256,folder,fed_to_agent,linked_draft_id,error,created_at,ingested_at";
    const LEGACY_COLS = "id,storage_path,kind,original_name,status,sha256,linked_draft_id,error,created_at,ingested_at";
    let rows: Record<string, unknown>[] | null = null;
    const full = await supabaseAdmin
      .from("growth_inbox_items")
      .select(FULL_COLS)
      .order("created_at", { ascending: false })
      .limit(100);
    if (full.error) {
      const phaseB = await supabaseAdmin
        .from("growth_inbox_items")
        .select(PHASE_B_COLS)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!phaseB.error) {
        rows = (phaseB.data ?? []).map((r) => ({ ...(r as Record<string, unknown>), post_order: null, alt_text: null }));
      } else {
        const legacy = await supabaseAdmin
          .from("growth_inbox_items")
          .select(LEGACY_COLS)
          .order("created_at", { ascending: false })
          .limit(100);
        if (legacy.error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: `DB read failed: ${legacy.error.message}`, requestId });
        rows = (legacy.data ?? []) as Record<string, unknown>[];
        rows = rows.map((r) => ({ ...r, folder: "", fed_to_agent: null, post_order: null, alt_text: null }));
      }
    } else {
      rows = (full.data ?? []) as Record<string, unknown>[];
    }
    // Attach a short-lived signed download URL per item for preview.
    const items = await Promise.all(
      (rows ?? []).map(async (r: Record<string, unknown>) => {
        let previewUrl: string | null = null;
        try {
          const { data: url } = await supabaseAdmin.storage.from(INBOX_BUCKET).createSignedUrl(String(r.storage_path), 300);
          previewUrl = (url as { signedUrl?: string } | null)?.signedUrl ?? null;
        } catch {
          // leave null
        }
        return { ...r, previewUrl };
      }),
    );
    return res.status(200).json({ ok: true, requestId, items });
  }

  if (req.method === "DELETE") {
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { data: row, error: qErr } = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id,storage_path,status")
      .eq("id", parsed.data.itemId)
      .maybeSingle();
    if (qErr || !row) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "item not found", requestId });
    if (row.status === "ingested") {
      return res.status(409).json({ ok: false, code: "FORBIDDEN", error: "Cannot delete an ingested item (it produced a draft).", requestId });
    }
    await supabaseAdmin.storage.from(INBOX_BUCKET).remove([String(row.storage_path)]).catch(() => undefined);
    const { error } = await supabaseAdmin.from("growth_inbox_items").delete().eq("id", parsed.data.itemId);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB delete failed", requestId });
    return res.status(200).json({ ok: true, requestId });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}