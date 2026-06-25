import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { promoteArticle } from "../../lib/growth/promoter.js";
import { assertAuthorized } from "../../lib/growth/authorization.js";
import { AuthorizationError } from "../../lib/growth/authorization.js";

const bodySchema = z.object({
  url: z.string().url().max(500),
  title: z.string().max(300).optional(),
  description: z.string().max(600).optional(),
});

/**
 * POST /api/growth/promote — generate a human-gated LinkedIn syndication draft
 * for a "Build AI with Reeturaj" article. Admin-only. The domain must be
 * authorized for 'draft' (inbharat.ai is). Nothing publishes automatically —
 * the draft is saved with status 'pending' for human approval via
 * /api/growth/approvals.
 */
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
    parsed = bodySchema.parse({
      url: typeof raw?.url === "string" ? raw.url.trim() : "",
      title: typeof raw?.title === "string" ? raw.title.trim() : undefined,
      description: typeof raw?.description === "string" ? raw.description.trim() : undefined,
    });
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid request", requestId: admin.requestId });
  }

  // Hard authorization guard (deny-by-default). 403 if the domain can't draft.
  try {
    assertAuthorized("draft", parsed.url);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN", error: e.message, requestId: admin.requestId });
    }
    throw e;
  }

  try {
    const draft = await promoteArticle(parsed.url, { title: parsed.title, description: parsed.description });
    return res.status(200).json({ ok: true, requestId: admin.requestId, draft });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN", error: e.message, requestId: admin.requestId });
    }
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Promotion failed", requestId: admin.requestId });
  }
}