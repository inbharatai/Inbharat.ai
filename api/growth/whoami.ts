import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

/**
 * GET /api/growth/whoami — admin gate check.
 *
 * Returns the verified admin identity (userId + email, no secrets) on 200;
 * 401/403 for everyone else. Powers the client-side RequireAdmin gate so the
 * SERVER (GROWTH_ADMIN_USER_IDS env or Supabase app_metadata.role) is the
 * single source of truth — no build-time client allowlist.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  let email: string | undefined;
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.auth.admin
      .getUserById(admin.userId)
      .catch(() => ({ data: null }));
    email = data?.user?.email ?? undefined;
  }

  return res.status(200).json({ ok: true, requestId, admin: true, userId: admin.userId, email });
}