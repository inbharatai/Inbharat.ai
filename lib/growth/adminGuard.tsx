/**
 * InBharat Growth Agent — client-side admin gate.
 *
 * UI-ONLY gating. Real enforcement is server-side in api/lib/requireAdmin.ts
 * (GROWTH_ADMIN_USER_IDS env OR Supabase app_metadata.role==='admin'). This
 * component asks the server "am I an admin?" via GET /api/growth/whoami and
 * renders the admin UI only on a 200 — so the SERVER is the single source of
 * truth, not a build-time client allowlist. A non-admin gets a "not authorized"
 * notice; the API still rejects them regardless. Defense in depth.
 *
 * Additive: imports useAuth (unmodified, read-only) only to carry the bearer
 * token. Never touches the chat backend.
 */
import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useAdminApi } from "./adminApi";

type GateState = "checking" | "authorized" | "denied" | "signed-out";

interface WhoamiResponse {
  ok: boolean;
  admin?: boolean;
  userId?: string;
  email?: string;
}

interface RequireAdminProps {
  children: React.ReactNode;
}

export function RequireAdmin({ children }: RequireAdminProps): React.ReactElement | null {
  const { loading } = useAuth();
  const { fetchJson } = useAdminApi();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    if (loading) return; // wait until auth resolves so the bearer token is ready
    let cancelled = false;
    (async () => {
      const { res, error } = await fetchJson<WhoamiResponse>("/api/growth/whoami");
      if (cancelled) return;
      if (res.ok) setState("authorized");
      else if (res.status === 401) setState("signed-out");
      else if (res.status === 403) setState("denied");
      else setState("denied"); // 500 (Supabase unset in prod) → treat as denied
      // error is surfaced via the state; no console noise for expected 401/403.
      void error;
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, fetchJson]);

  if (state === "checking" || loading) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
        Checking access…
      </div>
    );
  }

  if (state === "authorized") return <>{children}</>;

  const signedOut = state === "signed-out";
  return (
    <div style={{ maxWidth: 560, margin: "4rem auto", padding: "2rem", color: "#cbd5e1" }}>
      <h1 style={{ fontSize: "1.4rem", color: signedOut ? "#f59f4f" : "#f87171", marginBottom: "0.5rem" }}>
        {signedOut ? "Sign in required" : "Not authorized"}
      </h1>
      <p style={{ lineHeight: 1.6 }}>
        {signedOut ? (
          <>
            The InBharat Growth Agent admin area is restricted. Sign in to the InBharat console
            first (use the sign-in button on the main app), then return to this page.
          </>
        ) : (
          <>
            The InBharat Growth Agent admin area is restricted. Your account is not recognized as
            an admin. If you believe this is an error, contact the site owner.
          </>
        )}
      </p>
    </div>
  );
}