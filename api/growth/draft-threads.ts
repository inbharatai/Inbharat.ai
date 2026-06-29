import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export const bodySchema = z.object({
  draftIds: z.array(z.string().uuid()).max(200).optional().default([]),
});

/** A row from growth_agent_messages (role='tool') carrying the tool_result that
 *  holds the draftId the tool returned. */
interface ToolMessageRow {
  thread_id: string;
  tool_result: { draftId?: unknown } | null;
}

/** Pure core of the reverse-lookup: given recent tool messages (ordered newest
 *  first by the caller) + the set of draft ids the caller cares about, build a
 *  draftId → thread_id map. First match wins (newest, since the query is desc).
 *  Exported so the hermetic test can drive it with fixture rows — no DB needed. */
export function buildDraftThreadMap(rows: ToolMessageRow[], wanted: Set<string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const draftId = typeof row.tool_result?.draftId === "string" ? row.tool_result.draftId : null;
    if (draftId && wanted.has(draftId) && !(draftId in map)) {
      map[draftId] = row.thread_id;
    }
  }
  return map;
}

/**
 * POST /api/growth/draft-threads — batched reverse-lookup: given a set of
 * draft ids, return the agent thread that created each one. This lets an Issues
 * card deep-link back to the Agent conversation that produced it ("View in Agent").
 *
 * Why reverse-lookup: growth_drafts has no thread column and no executor stores
 * one (dispatchTool gets only the model's args, no thread context — and the
 * draft writers are also called from cron paths with no thread). But every
 * agent tool call persists its full ToolResult (including `draftId`) on the
 * growth_agent_messages row for that thread (role='tool'). So we scan the
 * recent tool messages once and map draftId → thread_id. Works retroactively
 * for all existing drafts, needs no migration, no write-path change. One batched
 * read on Issues load. Admin-only; degrades to an empty map when Supabase is
 * absent or the query fails (Issues cards simply omit the link).
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse({ draftIds: Array.isArray(raw?.draftIds) ? raw.draftIds : [] });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request", requestId: admin.requestId });
  }

  const wanted = new Set(parsed.draftIds);
  if (wanted.size === 0 || !supabaseAdmin) {
    return res.status(200).json({ ok: true, requestId: admin.requestId, map: {} });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("growth_agent_messages")
      .select("thread_id,tool_result")
      .eq("role", "tool")
      .order("created_at", { ascending: false })
      .limit(800);
    if (error || !Array.isArray(data)) {
      return res.status(200).json({ ok: true, requestId: admin.requestId, map: {} });
    }
    const map = buildDraftThreadMap(data as ToolMessageRow[], wanted);
    return res.status(200).json({ ok: true, requestId: admin.requestId, map });
  } catch {
    return res.status(200).json({ ok: true, requestId: admin.requestId, map: {} });
  }
}