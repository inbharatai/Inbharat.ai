import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getAuthorizedAssets, getRepoRegistry } from "../../lib/growth/authorization.js";
import { redactAsset, redactRepo } from "../../lib/growth/redactRegistry.js";

/** GET /api/growth/status — admin-only summary of authorized assets + repos. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  return res.status(200).json({
    ok: true,
    requestId: admin.requestId,
    // Canonical private repo names are stripped to a boolean by redactRepo/redactAsset —
    // they never reach the client bundle, sitemap, or SEO shells via this endpoint.
    assets: getAuthorizedAssets().map(redactAsset),
    repos: getRepoRegistry().map((r) => redactRepo(r)),
  });
}