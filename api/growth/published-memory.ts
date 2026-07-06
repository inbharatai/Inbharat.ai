import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { listPublishedMemory } from "../../lib/growth/publishedMemory.js";

/**
 * GET /api/growth/published-memory — the cockpit's "what's published where" table.
 *
 * Admin-only. One row per published article, joined across published_articles +
 * growth_syndication + growth_drafts (kind='linkedin', status='published') by slug
 * via the read-only growth_published_memory view (migration 20260706100000).
 *
 * HONEST: LinkedIn platform URL is never persisted (share-template → manual post),
 * so the LinkedIn column shows "posted manually", never a fake URL. measured_at is
 * LinkedIn outcomes only (growth_outcomes.kind CHECK = linkedin|inbox-outline);
 * article SEO lives in growth_pages via the audit runner, surfaced separately.
 *
 * Query: ?platform=devto|hashnode|medium|linkedin  &status=published|not_configured|...
 *        &since=YYYY-MM-DD  &until=YYYY-MM-DD  &limit=1..500
 */
const PLATFORMS = new Set(["devto", "hashnode", "medium", "linkedin"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const platform = typeof req.query.platform === "string" ? req.query.platform : null;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  const until = typeof req.query.until === "string" ? req.query.until : undefined;
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.round(limitRaw), 500)) : undefined;

  const items = await listPublishedMemory({
    platform: platform && PLATFORMS.has(platform) ? (platform as "devto" | "hashnode" | "medium" | "linkedin") : undefined,
    status,
    since,
    until,
    limit,
  });

  return res.status(200).json({ ok: true, requestId, configured: Boolean(supabaseAdmin), items });
}