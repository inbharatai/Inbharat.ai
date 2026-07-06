import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getPipelineBoard } from "../../lib/growth/cockpit/pipelineBoard.js";
import { PIPELINE_STAGE_ORDER } from "../../lib/growth/cockpit/stageChip.js";

/**
 * GET /api/growth/pipeline-board — read-only 9-stage cockpit board.
 *
 * Admin-only. Aggregates 9 stages (Idea → Measured) from the existing growth_*
 * tables at view time — no new writes, no new statuses. Per stage: count + up
 * to 50 compact cards + overflow flag. Filters (status + platform only) are
 * applied best-effort to the stages where they're meaningful.
 *
 * Query: ?status=pending|approved|published|rejected  &platform=devto|hashnode|medium|linkedin|inbharat  &cap=1..200
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const status = typeof req.query.status === "string" ? req.query.status : null;
  const platform = typeof req.query.platform === "string" ? req.query.platform : null;
  const capRaw = typeof req.query.cap === "string" ? Number(req.query.cap) : NaN;
  const cap = Number.isFinite(capRaw) ? Math.max(1, Math.min(Math.round(capRaw), 200)) : undefined;

  const { stages, configured } = await getPipelineBoard({ status, platform, cap });
  // Order stages by the canonical pipeline order (the aggregator already
  // pushes in order, but this guarantees it regardless of future refactors).
  const byStage = new Map(stages.map((s) => [s.stage, s]));
  const ordered = PIPELINE_STAGE_ORDER.map((id) => byStage.get(id) ?? { stage: id, count: 0, items: [], overflow: false });

  return res.status(200).json({ ok: true, requestId, configured, stages: ordered });
}