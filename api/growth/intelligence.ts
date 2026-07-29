import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { listKnowledge } from "../../lib/growth/knowledge.js";
import { feedCounts } from "../../lib/growth/cockpit/intelligenceFeed.js";

/**
 * GET /api/growth/intelligence — the unified "Intelligence Inbox" feed.
 *
 * The knowledge base is the single store for intelligence: analytics syncs write
 * rows with source_type 'analytics'/'search_console', and the agent saves
 * discovered topics, competitor gaps, founder sources, and decisions there too.
 * So this endpoint is a thin read over listKnowledge (capped) — the feed tagging,
 * filtering, and sorting happen client-side via the pure
 * lib/growth/cockpit/intelligenceFeed.ts module (hermetically tested).
 *
 * Read-only and admin-only. Never throws; degrades to empty when Supabase is
 * absent. Nothing here publishes or mutates.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  // Cap at 200 newest rows — enough for the founder's signal window without
  // pulling the whole table. Client-side filtering narrows further.
  const items = await listKnowledge({ limit: 200 });

  return res.status(200).json({
    ok: true,
    requestId: admin.requestId,
    items,
    counts: feedCounts(items),
  });
}