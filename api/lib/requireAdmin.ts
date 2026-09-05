/**
 * InBharat Growth Agent — server-side admin enforcement.
 *
 * Real enforcement lives here (the client RequireAdmin in lib/growth/adminGuard.tsx
 * is UI-only). Two paths to admin:
 *   1. user.id is in GROWTH_ADMIN_USER_IDS (comma-separated, server env).
 *   2. user.app_metadata.role === "admin" (Supabase role).
 * In local dev with no admin ids configured, allow through so developers can
 * exercise the endpoints without wiring Supabase admin ids. Never weakens the
 * public production path: when GROWTH_ADMIN_USER_IDS is set, it's authoritative.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { isVerifyErr, verifySupabaseUser } from "./verifySupabaseUser.js";

export function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function adminIds(): string[] {
  const raw = process.env.GROWTH_ADMIN_USER_IDS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isLocalDev(): boolean {
  return process.env.NODE_ENV !== "production" && !!process.env.LOCAL_API_PORT;
}

export type AdminOk = { ok: true; userId: string; requestId: string };
export type AdminErr = { ok: false; status: number; requestId: string; body: Record<string, unknown> };

/** Explicit type guard — required because this project has no strictNullChecks,
 *  so truthiness narrowing (`!admin.ok`) would not narrow the discriminated union.
 *  Mirrors the existing isVerifyErr pattern in verifySupabaseUser.ts. */
export function isAdminErr(a: AdminOk | AdminErr): a is AdminErr {
  return a.ok === false;
}

/** Verify a Supabase user AND that they are an admin. Returns 401/403 on failure. */
export async function requireAdmin(req: VercelRequest): Promise<AdminOk | AdminErr> {
  const requestId = getRequestId(req);

  if (!supabaseAdmin) {
    // No Supabase configured. Allow only in local dev (defense in depth); reject in prod.
    // 503 (not 500): the database is a downstream dependency the operator can fix,
    // not a server bug. Callers that 503-before-mutations rely on this to surface
    // "DB not configured" cleanly; a 500 here previously made their 503 branches
    // unreachable in prod.
    if (isLocalDev()) return { ok: true, userId: "local-dev", requestId };
    return { ok: false, status: 503, requestId, body: { ok: false, code: "SERVER_ERROR", error: "Database not configured", requestId } };
  }

  const verified = await verifySupabaseUser(req);
  if (isVerifyErr(verified)) {
    return { ok: false, status: verified.status, requestId, body: { ...verified.body, requestId } };
  }

  const userId = verified.userId;

  // Path 2: Supabase role metadata.
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
  const role = (userData?.user?.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role === "admin") return { ok: true, userId, requestId };

  // Path 1: allow-list.
  const ids = adminIds();
  if (ids.length > 0) {
    if (ids.includes(userId)) return { ok: true, userId, requestId };
    return { ok: false, status: 403, requestId, body: { ok: false, code: "FORBIDDEN", requestId } };
  }

  // No allow-list configured and no role: allow only in local dev.
  if (isLocalDev()) return { ok: true, userId, requestId };
  return { ok: false, status: 403, requestId, body: { ok: false, code: "FORBIDDEN", requestId } };
}

/** Send a 405 with Allow header. */
export function methodNotAllowed(res: VercelResponse, requestId: string, allowed: string): void {
  res.setHeader("Allow", allowed);
  res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}

// ─── Cron auth ────────────────────────────────────────────────────────────
//
// Vercel's scheduled cron invokes the endpoint with an HTTP GET and identifies
// itself via `user-agent: vercel-cron/1.0` + an `x-vercel-cron-schedule` header
// (it can NOT send a shared secret header). So a cron invocation is authorized
// by that Vercel signature. Two more paths: an external scheduler carrying a
// CRON_SECRET, and an authenticated admin (the dashboard "Run now" button).

export type CronAuthOk = {
  ok: true;
  requestId: string;
  source: "vercel-cron" | "cron-secret" | "admin" | "local-dev";
  userId?: string;
};
export type CronAuthResult = CronAuthOk | AdminErr;

export function isCronAuthErr(a: CronAuthResult): a is AdminErr {
  return a.ok === false;
}

/** Authenticate a daily-cron invocation. Order: Vercel signature → CRON_SECRET → admin. */
export async function authorizeCron(req: VercelRequest): Promise<CronAuthResult> {
  const requestId = getRequestId(req);

  // 1. Vercel's scheduled cron (GET). Vercel sends BOTH the `vercel-cron` user-
  // agent AND the `x-vercel-cron-schedule` header on every cron invocation. We
  // require BOTH (not either alone) so a single spoofed client header isn't
  // enough — an attacker must know to set both. This path is inherently UA-based
  // (Vercel cron cannot send a custom secret), so for true security set
  // CRON_SECRET and drive these endpoints from an external scheduler (path 2).
  // In production, log a warning so the spoofable path is visible in logs.
  const ua = (req.headers?.["user-agent"] as string | undefined) || "";
  const hasSchedule = !!req.headers?.["x-vercel-cron-schedule"];
  if (/vercel-cron/i.test(ua) && hasSchedule) {
    if (!isLocalDev() && process.env.NODE_ENV === "production") {
      console.warn("[cron] endpoint authed via vercel-cron UA (spoofable); set CRON_SECRET + external scheduler for true security");
    }
    return { ok: true, requestId, source: "vercel-cron" };
  }

  // 2. External scheduler with a shared secret (x-cron-secret or Bearer).
  const secret = process.env.CRON_SECRET;
  const provided =
    (req.headers?.["x-cron-secret"] as string | undefined) ||
    (req.headers?.["authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "");
  if (secret && provided && provided === secret) {
    return { ok: true, requestId, source: "cron-secret" };
  }

  // 3. Authenticated admin (dashboard "Run now"). Returns the admin's userId.
  const admin = await requireAdmin(req);
  if (admin.ok) return { ok: true, requestId, source: "admin", userId: admin.userId };

  // No path matched. Allow in local dev so cron tests work without secrets.
  if (isLocalDev()) return { ok: true, requestId, source: "local-dev" };
  return isAdminErr(admin) ? admin : { ok: true, requestId, source: "admin", userId: admin.userId };
}