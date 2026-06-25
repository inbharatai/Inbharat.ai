import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { auditDomain } from "../../lib/growth/audit-runner.js";
import { AuthorizationError } from "../../lib/growth/authorization.js";

const bodySchema = z.object({ domain: z.string().min(3).max(200) });

/** POST /api/growth/audit — run a full audit over an authorized domain. Body: { domain }. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse({ domain: typeof raw?.domain === "string" ? raw.domain.trim() : "" });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request", requestId: admin.requestId });
  }

  try {
    const run = await auditDomain(parsed.domain);
    return res.status(200).json({ ok: true, requestId: admin.requestId, run });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN", error: e.message, requestId: admin.requestId });
    }
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Audit failed", requestId: admin.requestId });
  }
}