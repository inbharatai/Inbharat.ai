import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin, isCronAuthErr, authorizeCron } from "../lib/requireAdmin.js";
import { loadAutoMode, saveAutoMode, runAutoLoop } from "../../lib/growth/autoMode.js";

/**
 * /api/growth/auto — Auto Mode (Phase C5).
 *   GET                         → { mode }  current Auto Mode state (admin).
 *   POST { enabled?, autoApprove?, cadenceMinutes?, maxTasksPerRun? }
 *        → update the Auto Mode settings (admin). Audited.
 *   POST ?action=run            → run one work cycle. Cron-secret-guarded
 *        (Vercel scheduled cron / external scheduler with CRON_SECRET) OR an
 *        authenticated admin hitting "Run now". When Auto Mode is off, the loop
 *        no-ops. Budget-guarded; never publishes.
 */
const UpdateBody = z.object({
  enabled: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  cadenceMinutes: z.number().int().min(5).max(1440).optional(),
  maxTasksPerRun: z.number().int().min(1).max(20).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  // Run-now path: Vercel's scheduled cron sends GET ?action=run (vercel.json
  // schedules this every 30 min). authorizeCron accepts the vercel-cron
  // signature, a CRON_SECRET, or an authenticated admin (the dashboard "Run
  // now" button). Must be checked BEFORE the admin-gated GET-mode fetch below,
  // or Vercel cron 401s every run (it sends no bearer token).
  if (req.query?.action === "run") {
    const cron = await authorizeCron(req);
    if (isCronAuthErr(cron)) return res.status(cron.status).json(cron.body);
    const result = await runAutoLoop();
    return res.status(200).json({ ok: true, requestId: cron.requestId, trigger: cron.source, ...result });
  }

  if (req.method === "GET") {
    const admin = await requireAdmin(req);
    if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);
    const mode = await loadAutoMode();
    return res.status(200).json({ ok: true, requestId, mode });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  // Settings update path: admin only.
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId: admin.requestId });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "No fields to update", requestId: admin.requestId });
  }
  try {
    const mode = await saveAutoMode(admin.userId, parsed.data);
    return res.status(200).json({ ok: true, requestId: admin.requestId, mode });
  } catch (e) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: (e as Error).message, requestId: admin.requestId });
  }
}