/**
 * InBharat Growth Agent — client-side admin gate.
 *
 * UI-ONLY gating. Real enforcement is server-side in api/lib/requireAdmin.ts.
 * If a non-admin reaches /admin/growth we render a "not authorized" notice
 * instead of the admin UI — but the API still rejects them. Defense in depth.
 *
 * Additive: imports useAuth (unmodified) + VITE_GROWTH_ADMIN_USER_IDS env.
 */
import React from "react";
import { useAuth } from "../auth";

function adminIds(): Set<string> {
  // Match the project convention (no vite/client types in tsconfig).
  const raw = ((import.meta as any).env?.VITE_GROWTH_ADMIN_USER_IDS as string | undefined) || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function isLocalDev(): boolean {
  const env = (import.meta as any).env;
  return env?.DEV === true || env?.MODE === "development";
}

export function isAdmin(user: { id?: string } | null): boolean {
  if (!user?.id) return false;
  return adminIds().has(user.id);
}

interface RequireAdminProps {
  children: React.ReactNode;
}

export function RequireAdmin({ children }: RequireAdminProps): React.ReactElement {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
        Checking access…
      </div>
    );
  }

  if (isAdmin(user)) return <>{children}</>;

  // Local dev convenience: allow when no admin ids are configured at all, so
  // a developer can poke around without wiring Supabase. The API still gates.
  if (isLocalDev() && adminIds().size === 0) return <>{children}</>;

  return (
    <div style={{ maxWidth: 560, margin: "4rem auto", padding: "2rem", color: "#cbd5e1" }}>
      <h1 style={{ fontSize: "1.4rem", color: "#f87171", marginBottom: "0.5rem" }}>Not authorized</h1>
      <p style={{ lineHeight: 1.6 }}>
        The InBharat Growth Agent admin area is restricted. Your account is not on the admin
        allow-list. If you believe this is an error, contact the site owner.
      </p>
    </div>
  );
}