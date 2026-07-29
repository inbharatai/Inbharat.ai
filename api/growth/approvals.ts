import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { searchKnowledge, recordDecision } from "../../lib/growth/knowledge.js";
import { overrideNote, type MajorGateFailure } from "../../lib/growth/cockpit/gatePolicy.js";

const postSchema = z.object({
  draftId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).optional(),
  /** Soft-gate override: a typed reason the founder approved despite major gate
   *  failures. Folded into the audit `note` (never blocks — approval proceeds). */
  overrideReason: z.string().max(1000).optional(),
  /** The major gate failures that triggered the override prompt (for the audit). */
  gateFailures: z.array(z.object({ id: z.string(), name: z.string(), summary: z.string() })).max(8).optional(),
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
      overrideReason: typeof raw?.overrideReason === "string" ? raw.overrideReason.trim() : undefined,
      gateFailures: Array.isArray(raw?.gateFailures) ? raw.gateFailures : undefined,
    });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request", requestId: admin.requestId });
  }

  // Compose the audit note. If the founder overrode major gate failures, record
  // the reason + failures (soft-gate audit). Otherwise use any plain note. Never
  // blocks — approval proceeds regardless of the note content.
  const auditNote = parsed.overrideReason
    ? overrideNote(parsed.overrideReason, (parsed.gateFailures ?? []) as MajorGateFailure[])
    : (parsed.note || null);

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Database not configured", requestId: admin.requestId });
  }

  try {
    // Order matters for the never-auto-publish guarantee: insert the audit row
    // FIRST, then flip the draft status. If the audit insert fails we return an
    // error and the draft stays in its prior status (safe to retry) instead of
    // leaving an approved draft with no approval record. A successful 200 means
    // BOTH landed; a failure leaves the draft state unchanged.
    const { error: insErr } = await supabaseAdmin.from("growth_approvals").insert({
      draft_id: parsed.draftId,
      reviewer: admin.userId,
      decision: parsed.decision,
      note: auditNote,
    });
    if (insErr) {
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to record approval", requestId: admin.requestId });
    }

    // Flip the draft status. status flows: pending → approved|rejected.
    const { error: updErr } = await supabaseAdmin
      .from("growth_drafts")
      .update({ status: parsed.decision })
      .eq("id", parsed.draftId);
    if (updErr) {
      // The approval row was inserted but the status flip failed — the draft stays
      // pending so the founder can re-approve. The orphan audit row is harmless.
      return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to update draft (approval recorded; re-approve to retry)", requestId: admin.requestId });
    }

    // Phase 2: KB learning signal — record the founder's decision on KB topic/
    // source rows matching this draft's title (approve → 'approved', reject →
    // 'skipped'). Best-effort, fire-and-forget; never blocks the response.
    void (async () => {
      try {
        const { data: d } = await supabaseAdmin!
          .from("growth_drafts")
          .select("title")
          .eq("id", parsed.draftId)
          .maybeSingle();
        const title = (d as { title: string | null } | null)?.title ?? null;
        if (title) {
          const items = await searchKnowledge(title, { limit: 6 });
          for (const it of items.slice(0, 4)) {
            if (it.type === "topic" || it.type === "source" || it.type === "competitor_gap") {
              await recordDecision(it.id, parsed.decision === "approved").catch(() => null);
            }
          }
        }
      } catch {
        /* best-effort — never fail the approval on a KB write */
      }
    })();

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
    // Approved drafts first (status asc: 'approved' < 'pending' < 'published' <
    // 'rejected'), newest within each status, then the rest as review history.
    // The window is 100 (was 50): Auto Mode runs every 30 min and can create many
    // drafts/day, so a 50-row cap could push an APPROVED-but-unpublished draft from
    // a prior day off the list — and approval ≠ publish (a human still clicks
    // Publish), so approved drafts must stay visible or the founder loses track of
    // them. 100 covers a busy day without making the payload unwieldy.
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id, kind, url, title, body_md, schema_json, status, created_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return void res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to load drafts", requestId });
    }
    const drafts = (data || []) as DraftRow[];
    return void res.status(200).json({ ok: true, requestId, drafts });
  } catch {
    return void res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Failed to load drafts", requestId });
  }
}