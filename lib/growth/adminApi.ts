/**
 * InBharat Growth Agent — authenticated admin fetch helper.
 *
 * The admin API endpoints (api/growth/*) all call `requireAdmin`, which reads
 * the `Authorization: Bearer <supabase access_token>` header (NOT a cookie). The
 * admin pages used to `fetch("/api/growth/...")` with no bearer, so every call
 * 401'd. `useAdminApi` injects the signed-in user's access token from useAuth()
 * (read-only reuse — auth.tsx is never modified) on every request.
 *
 * Real enforcement is server-side (api/lib/requireAdmin.ts). This is a convenience
 * layer; it does not grant anything the server wouldn't already allow.
 */
import { useCallback } from "react";
import { useAuth } from "../auth";

export interface AdminFetchResult<T> {
  res: Response;
  data: T | null;
  /** Human-readable error string when res.ok is false (or the fetch threw). */
  error: string | null;
}

export interface AdminApi {
  /**
   * Fetch an admin endpoint with the bearer token injected. Returns parsed JSON
   * plus an `error` string on failure — never throws, so callers can render
   * inline errors without try/catch boilerplate.
   */
  fetchJson: <T = unknown>(path: string, init?: RequestInit) => Promise<AdminFetchResult<T>>;
  /** Raw fetch with the bearer + accept headers injected. */
  fetchRaw: (path: string, init?: RequestInit) => Promise<Response>;
  /** The signed-in user's access token, or null when not signed in. */
  accessToken: string | null;
  isSignedIn: boolean;
}

export function useAdminApi(): AdminApi {
  const { accessToken, isSignedIn } = useAuth();

  const withAuth = useCallback(
    function withAuth(init?: RequestInit): RequestInit {
      const headers = new Headers(init?.headers);
      headers.set("accept", "application/json");
      if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
      if (init?.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return { ...init, headers };
    },
    [accessToken],
  );

  // Memoized so consumers' useCallback/useEffect deps stay stable across renders
  // (a fresh function reference here would cause those effects to re-fire every
  // render and loop). Identity only changes when the access token changes.
  const fetchRaw = useCallback(
    async function fetchRaw(path: string, init?: RequestInit): Promise<Response> {
      return fetch(path, withAuth(init));
    },
    [withAuth],
  );

  const fetchJson = useCallback(
    async function fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<AdminFetchResult<T>> {
    try {
      const res = await fetchRaw(path, init);
      let data: T | null = null;
      try {
        data = (await res.json()) as T;
      } catch {
        // Non-JSON response (e.g. 204); leave data null.
      }
      if (!res.ok) {
        const err = (data as { error?: string } | null)?.error || `HTTP ${res.status}`;
        return { res, data, error: err };
      }
      return { res, data, error: null };
    } catch (e) {
      return { res: new Response(null, { status: 0 }), data: null, error: (e as Error).message };
    }
  },
    [fetchRaw],
  );

  return { fetchJson, fetchRaw, accessToken, isSignedIn };
}