import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { INBOX_BUCKET, MAX_BYTES, isAllowedExt, inboxPath, sanitizeFolder, markFolderFedToAgent, unmarkFolderFedToAgent } from "../../lib/growth/inbox.js";

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
    // Dedup on (sha256, folder) — same content may live in two folders.
    const { data: existing } = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id")
      .eq("sha256", parsed.data.sha256)
      .eq("folder", folder)
      .maybeSingle();
    if (existing?.id) return res.status(200).json({ ok: true, requestId, duplicate: true, itemId: existing.id });
    const { data, error } = await supabaseAdmin
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
    if (error || !data) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB insert failed", requestId });
    return res.status(201).json({ ok: true, requestId, itemId: data.id });
  }

  if (req.method === "POST" && (req.query?.action === "feed" || req.query?.action === "unfeed")) {
    const parsed = FeedBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need folder).", requestId });
    const folder = sanitizeFolder(parsed.data.folder);
    if (!folder) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid folder.", requestId });
    const count = req.query.action === "feed" ? await markFolderFedToAgent(folder) : await unmarkFolderFedToAgent(folder);
    return res.status(200).json({ ok: true, requestId, folder, count });
  }

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("growth_inbox_items")
      .select("id,storage_path,kind,original_name,status,sha256,folder,fed_to_agent,linked_draft_id,error,created_at,ingested_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB read failed", requestId });
    // Attach a short-lived signed download URL per item for preview.
    const items = await Promise.all(
      (data ?? []).map(async (r: Record<string, unknown>) => {
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