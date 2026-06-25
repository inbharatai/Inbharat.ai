import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { getAuthorizedAssets, getRepoRegistry } from "../../lib/growth/authorization.js";

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
    assets: getAuthorizedAssets().map((a) => ({
      domain: a.domain,
      name: a.name,
      status: a.status,
      canCrawl: a.canCrawl,
      canAudit: a.canAudit,
      canDraft: a.canDraft,
      canCreatePR: a.canCreatePR,
      requiresHumanApproval: a.requiresHumanApproval,
    })),
    repos: getRepoRegistry().map((r) => ({
      productName: r.productName,
      productSlug: r.productSlug,
      publicRepo: r.publicRepo,
      websitePath: r.websitePath,
      sourceOfTruth: r.sourceOfTruth,
      publicRepoStatus: r.publicRepoStatus,
      allowAgentRead: r.allowAgentRead,
      allowAgentPR: r.allowAgentPR,
      notes: r.notes,
      // Never expose canonical private repo names via this endpoint.
      hasPrivateRepo: !!r.canonicalPrivateRepo,
    })),
  });
}