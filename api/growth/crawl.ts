import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { auditSingleUrl } from "../../lib/growth/audit-runner.js";
import { AuthorizationError } from "../../lib/growth/authorization.js";

const bodySchema = z.object({ url: z.string().url() });

/** POST /api/growth/crawl — audit a single authorized URL. Body: { url }. */
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
    parsed = bodySchema.parse({ url: typeof raw?.url === "string" ? raw.url.trim() : "" });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request (url required)", requestId: admin.requestId });
  }

  try {
    const page = await auditSingleUrl(parsed.url);
    return res.status(200).json({ ok: true, requestId: admin.requestId, page });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN", error: e.message, requestId: admin.requestId });
    }
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Crawl failed", requestId: admin.requestId });
  }
}