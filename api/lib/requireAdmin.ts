import { timingSafeEqual } from 'node:crypto';
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
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1" && process.env.VERCEL_ENV !== "production" && !!process.env.LOCAL_API_PORT;
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
// Scheduling metadata is not authentication. Vercel scheduled requests use
// Authorization: Bearer CRON_SECRET when that server-only setting is configured.
// External schedulers may also use x-cron-secret; dashboard actions need admin auth.

export type CronAuthOk = {
  ok: true;
  requestId: string;
  source: "cron-secret" | "admin" | "local-dev";
  userId?: string;
};
export type CronAuthResult = CronAuthOk | AdminErr;

export function isCronAuthErr(a: CronAuthResult): a is AdminErr {
  return a.ok === false;
}

/** Authenticate scheduled/admin work; never trust caller-supplied UA/schedule headers. */
export async function authorizeCron(req: VercelRequest): Promise<CronAuthResult> {
  const requestId = getRequestId(req);

  const secret = process.env.CRON_SECRET;
  const rawHeader = req.headers?.["x-cron-secret"];
  const authorization = req.headers?.authorization;
  const provided = typeof rawHeader === 'string' ? rawHeader
    : typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization)?.[1] : undefined;
  if (secret && provided) {
    const expected = Buffer.from(secret);
    const actual = Buffer.from(provided);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return { ok: true, requestId, source: "cron-secret" };
    }
  }

  // 3. Authenticated admin (dashboard "Run now"). Returns the admin's userId.
  const admin = await requireAdmin(req);
  if (admin.ok) return { ok: true, requestId, source: "admin", userId: admin.userId };

  // No path matched. Allow in local dev so cron tests work without secrets.
  if (isLocalDev()) return { ok: true, requestId, source: "local-dev" };
  return isAdminErr(admin) ? admin : { ok: true, requestId, source: "admin", userId: admin.userId };
}