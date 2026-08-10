import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";

/**
 * /api/growth/syndicate — REMOVED (410 Gone).
 *
 * The DEV.to, Hashnode, and Medium syndication channels have been removed.
 * LinkedIn publishing continues via /api/growth/publish (unchanged).
 *
 * Auth guard is retained so this route does not become an unauthenticated
 * surface — a non-admin caller still receives 401/403.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  return res.status(410).json({
    ok: false,
    code: "GONE",
    error: "The DEV.to, Hashnode, and Medium syndication channels have been removed. LinkedIn publishing is available via /api/growth/publish.",
    requestId,
  });
}
