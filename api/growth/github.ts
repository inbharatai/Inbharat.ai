import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { verifyRepo, fetchReadme } from "../../lib/growth/github.js";

/**
 * /api/growth/github — verify a linked repo + read its README. Admin-only.
 *   POST /verify { repo } → { ok, defaultBranch, lastCommitSha, ... } | denied
 *   POST /readme { repo } → { ok, readme } | denied
 *
 * The per-repo deny gate (RHCF-Seva, any do_not_use row) is enforced inside
 * verifyRepo/fetchReadme BEFORE the GitHub call — a denied repo returns
 * { ok:false, denied:true } and is never contacted.
 */
const Body = z.object({ repo: z.string().min(1).max(120) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });

  const path = req.query?.path;
  if (path === "readme") {
    const result = await fetchReadme(parsed.data.repo);
    return res.status(result.denied ? 403 : result.ok ? 200 : 400).json({ ok: result.ok, requestId, ...result });
  }
  // default: verify
  const result = await verifyRepo(parsed.data.repo);
  return res.status(result.denied ? 403 : result.ok ? 200 : 400).json({ ok: result.ok, requestId, ...result });
}