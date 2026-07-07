import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

/**
 * /api/growth/leads — lead capture (public POST) + lead list (admin GET).
 *
 *   POST  (public) — capture one lead into growth_leads with full attribution.
 *   GET   (admin)  — list recent leads (filters: ?site= ?status= ?limit=).
 *
 * This is the capture + attribution layer of the Lead Generation design
 * (docs/LEAD_GENERATION.md). The Growth Agent PROPOSES lead-gen actions as
 * human-gated drafts; this endpoint only stores the leads the agent later
 * reasons about. It never sends email, never messages anyone, never publishes.
 *
 * Security (public surface):
 *   - Honeypot: a hidden `website` field; if a bot fills it, we silently return
 *     200 and store nothing. Real users never see the field.
 *   - Consent required: `consent: true` + a non-empty `consentText` the user
 *     agreed to. No consent → 400, no row.
 *   - Soft rate limit: in-memory per-ip_hash token bucket (max 5 / 60s). Vercel
 *     serverless instances don't share memory, so this is a best-effort guard
 *     against a single-instance flood — Turnstile / Edge rate-limiting is the
 *     hard guard for Phase 2.
 *   - Email validated + lowercased + capped. ip_hash is a salted SHA-256 (raw IP
 *     is NEVER stored); used for rate-limit dedupe only.
 *   - No PII in logs: the audit row records only kind/source_site/source_slug.
 *
 * No-DB → POST returns 503 (the form shows an "email us instead" fallback);
 * GET returns empty arrays. Never throws out of the handler.
 */
const PostBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  kind: z.string().trim().min(1).max(80),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  sourceSite: z.string().trim().min(1).max(120).optional(),
  sourcePath: z.string().trim().max(500).optional(),
  sourceSlug: z.string().trim().max(120).optional(),
  utmSource: z.string().trim().max(160).optional(),
  utmMedium: z.string().trim().max(160).optional(),
  utmCampaign: z.string().trim().max(160).optional(),
  utmContent: z.string().trim().max(160).optional(),
  utmTerm: z.string().trim().max(160).optional(),
  referrer: z.string().trim().max(500).optional(),
  consent: z.boolean().refine((v) => v === true, { message: "consent required" }),
  consentText: z.string().trim().min(1).max(400),
  website: z.string().max(500).optional(), // honeypot — must stay empty
});

const ALLOWED_KIND = /^(newsletter|contact|demo-request|waitlist:[a-z0-9-]{1,60}|lead-magnet:[a-z0-9-]{1,60})$/i;

// In-memory soft rate limit: ip_hash -> {count, windowStart}. Vercel instances
// are independent, so this only guards a single instance — noted above.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const rateMap = new Map<string, { count: number; windowStart: number }>();

function clientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0]!.trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function ipHash(ip: string): string {
  const salt = process.env.GROWTH_LEAD_SALT ?? "inbharat-growth-leads-v1";
  return createHash("sha256").update(salt + ":" + ip).digest("hex");
}

function rateAllow(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

// Best-effort audit — no PII. .then(onFulfilled,onRejected) (Postgrest builders
// are PromiseLike, not Promises — .catch throws synchronously after the write).
async function audit(action: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope: "leads", detail })
    .then(() => undefined, () => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  // ─── GET (admin): list recent leads ──────────────────────────────────────
  if (req.method === "GET") {
    const admin = await requireAdmin(req);
    if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);
    if (!supabaseAdmin) return res.status(200).json({ ok: true, requestId, leads: [] });
    const site = typeof req.query.site === "string" ? req.query.site.trim() : null;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    let q = supabaseAdmin.from("growth_leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (site) q = q.eq("source_site", site);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB read failed", requestId });
    return res.status(200).json({ ok: true, requestId, leads: data ?? [] });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  // ─── POST (public): capture ───────────────────────────────────────────────
  const parsed = PostBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
  }
  const b = parsed.data;

  // Honeypot: a filled `website` field means a bot. Silently succeed so the bot
  // can't tell it was rejected, but store nothing.
  if (b.website && b.website.trim().length > 0) {
    return res.status(200).json({ ok: true, requestId, accepted: true });
  }
  if (!ALLOWED_KIND.test(b.kind)) {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid kind", requestId });
  }

  if (!rateAllow(ipHash(clientIp(req)))) {
    return res.status(429).json({ ok: false, code: "RATE_LIMITED", error: "Too many submissions. Please try again shortly.", requestId });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Capture backend not configured. Please email info@inbharat.ai instead.", requestId });
  }

  const row = {
    email: b.email,
    name: b.name ?? null,
    company: b.company ?? null,
    kind: b.kind,
    source_site: b.sourceSite ?? "inbharat.ai",
    source_path: b.sourcePath ?? null,
    source_slug: b.sourceSlug ?? null,
    utm_source: b.utmSource ?? null,
    utm_medium: b.utmMedium ?? null,
    utm_campaign: b.utmCampaign ?? null,
    utm_content: b.utmContent ?? null,
    utm_term: b.utmTerm ?? null,
    referrer: b.referrer ?? null,
    consent_at: new Date().toISOString(),
    consent_text: b.consentText,
    status: "new",
    ip_hash: ipHash(clientIp(req)),
  };

  // upsert on (email, kind, source_site) via the unique index — a re-submit of
  // the same newsletter signup is a no-op, not a duplicate.
  const { error } = await supabaseAdmin
    .from("growth_leads")
    .upsert(row, { onConflict: "email,kind,source_site" })
    .then(() => ({ error: null as unknown }), (e: unknown) => ({ error: e }));

  if (error) {
    await audit("lead-capture-fail", `kind=${b.kind} site=${row.source_site} slug=${b.sourceSlug ?? "-"}`);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Could not save your details. Please email info@inbharat.ai.", requestId });
  }
  await audit("lead-captured", `kind=${b.kind} site=${row.source_site} slug=${b.sourceSlug ?? "-"}`);
  return res.status(200).json({ ok: true, requestId, accepted: true });
}