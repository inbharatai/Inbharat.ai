import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const postSchema = z.object({
  draftId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).optional(),
});

interface DraftRow {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  body_md: string | null;
  schema_json: { internalLinks?: string[]; note?: string | null } | null;
  status: string;
  created_at: string;
}

/**
 * /api/growth/approvals — the human approval gate for Growth Agent drafts.
 *
 * GET  — list recent drafts (pending first) so the admin can review them.
 * POST — record an approve/reject decision: flips growth_drafts.status and
 *        writes a growth_approvals row (with the reviewer's user id). Nothing
 *        auto-publishes — approval only marks the draft; a human still posts
 *        the LinkedIn caption manually.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    return listDrafts(res, admin.requestId);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  let parsed: z.infer<typeof postSchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = postSchema.parse({
      draftId: typeof raw?.draftId === "string" ? raw.draftId.trim() : "",
      decision: typeof raw?.decision === "string" ? raw.decision : "",
      note: typeof raw?.note === "string" ? raw.note.trim() : undefined,
    });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request", requestId: admin.requestId });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Database not configured", requestId: admin.requestId });
  }

  try {
    // Flip the draft status. status flows: pending → approved|rejected.
    const { error: updErr } = await supabaseAdmin
      .from("growth_drafts")
      .update({ status: parsed.decision })
      .eq("id", parsed.draftId);
    if (updErr) {
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to update draft", requestId: admin.requestId });
    }

    // Audit trail row.
    await supabaseAdmin.from("growth_approvals").insert({
      draft_id: parsed.draftId,
      reviewer: admin.userId,
      decision: parsed.decision,
      note: parsed.note || null,
    });

    return res.status(200).json({ ok: true, requestId: admin.requestId, draftId: parsed.draftId, decision: parsed.decision });
  } catch {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Approval failed", requestId: admin.requestId });
  }
}

async function listDrafts(res: VercelResponse, requestId: string): Promise<void> {
  if (!supabaseAdmin) {
    return void res.status(200).json({ ok: true, requestId, drafts: [] });
  }
  try {
    // Pending drafts first, then the most recent decided ones (review history).
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id, kind, url, title, body_md, schema_json, status, created_at")
      .order("status", { ascending: true }) // 'pending' < 'approved'/'rejected' alphabetically-ish
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      return void res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to load drafts", requestId });
    }
    const drafts = (data || []) as DraftRow[];
    return void res.status(200).json({ ok: true, requestId, drafts });
  } catch {
    return void res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to load drafts", requestId });
  }
}