import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

/** GET /api/growth/runs — recent crawl runs (optionally ?domain=…). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (!supabaseAdmin) {
    return res.status(200).json({ ok: true, requestId: admin.requestId, runs: [], configured: false });
  }
  try {
    let q = supabaseAdmin.from("growth_crawl_runs").select("*").order("started_at", { ascending: false }).limit(50);
    const domain = typeof req.query?.domain === "string" ? req.query.domain : undefined;
    if (domain) q = q.eq("domain", domain);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB query failed", requestId: admin.requestId });
    return res.status(200).json({ ok: true, requestId: admin.requestId, runs: data ?? [], configured: true });
  } catch {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Unexpected error", requestId: admin.requestId });
  }
}