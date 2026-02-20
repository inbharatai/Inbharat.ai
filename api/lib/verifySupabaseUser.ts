import type { VercelRequest } from "@vercel/node";
import { supabaseAdmin } from "./supabaseAdmin";

export type VerifyOk = { ok: true; userId: string };
export type VerifyGuest = { ok: true; userId: null };
export type VerifyErr = { ok: false; status: number; body: { ok: false; code: "UNAUTHORIZED" | "SERVER_ERROR" } };

export function isVerifyErr(v: VerifyOk | VerifyErr | VerifyGuest): v is VerifyErr {
  return v.ok === false;
}

function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers?.authorization || (req.headers as any)?.Authorization;
  if (typeof raw !== "string") return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Requires a valid Supabase user; returns 401 if no token or invalid. */
export async function verifySupabaseUser(req: VercelRequest): Promise<VerifyOk | VerifyErr> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_ERROR" } };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED" } };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED" } };
  }

  return { ok: true, userId: data.user.id };
}

/** Optional auth: valid user, or guest (no token). When Supabase is not configured, treat as guest. */
export async function verifySupabaseUserOptional(
  req: VercelRequest
): Promise<VerifyOk | VerifyGuest | VerifyErr> {
  if (!supabaseAdmin) {
    return { ok: true, userId: null };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { ok: true, userId: null };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED" } };
  }

  return { ok: true, userId: data.user.id };
}

