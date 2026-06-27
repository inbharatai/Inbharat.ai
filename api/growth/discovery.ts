import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { discoverSitePages } from "../../lib/growth/discovery.js";
import { AuthorizationError } from "../../lib/growth/authorization.js";

/**
 * /api/growth/discovery — full-site (sitemap-driven) discovery with change +
 * orphan detection. Admin-only.
 *   GET  ?domain=inbharat.ai    → run + return { discovered, new, changed, orphaned }
 *   POST { domain }             → run + persist (new/changed re-audited) + return same
 *
 * Deny-by-default: discoverSitePages asserts crawl authorization and throws
 * AuthorizationError on an unauthorized domain → 403 FORBIDDEN. Never publishes.
 */
const PostBody = z.object({ domain: z.string().min(1).max(200) });

async function audit(userId: string, action: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  // Postgrest builders are PromiseLike (.then) but NOT Promises — .catch is
  // undefined and throws synchronously, surfacing a 500 AFTER a successful write.
  // .then(onFulfilled, onRejected) is the correct non-throwing best-effort swallow.
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope: userId, detail })
    .then(() => undefined, () => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  let domain: string;
  if (req.method === "GET") {
    const q = (req.query?.domain as string | undefined) ?? "";
    if (!q.trim()) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "domain query param required", requestId });
    domain = q.trim();
  } else if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    domain = parsed.data.domain.trim();
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  try {
    const diff = await discoverSitePages(domain);
    await audit(admin.userId, "discovery-run", `${domain}: new=${diff.new.length} changed=${diff.changed.length} orphaned=${diff.orphaned.length}`);
    return res.status(200).json({ ok: true, requestId, domain, ...diff });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN", error: e.message, requestId });
    }
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Discovery failed", requestId });
  }
}