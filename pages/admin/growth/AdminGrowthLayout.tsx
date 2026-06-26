import React, { useEffect } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { Activity, Globe, GitBranch, AlertTriangle, BarChart3, Settings as SettingsIcon, ShieldAlert, Wallet, Brain } from "lucide-react";
import { RequireAdmin } from "../../../lib/growth/adminGuard";

/**
 * Outlet-based layout for /admin/growth. Gated client-side by <RequireAdmin>
 * (real enforcement is server-side in api/lib/requireAdmin.ts). Forces
 * noindex so the admin surface is never indexed. Intentionally minimal —
 * mirrors the brand shell without landing animations.
 */
const NAV: { to: string; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { to: "", label: "Overview", icon: Activity },
  { to: "usage", label: "Usage", icon: Wallet },
  { to: "sites", label: "Sites", icon: Globe },
  { to: "repos", label: "Repos", icon: GitBranch },
  { to: "rules", label: "Rules", icon: Brain },
  { to: "issues", label: "Issues", icon: AlertTriangle },
  { to: "performance", label: "Performance", icon: BarChart3 },
  { to: "settings", label: "Settings", icon: SettingsIcon },
];

function navClass(isActive: boolean): string {
  return [
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
    isActive
      ? "bg-[#f59f4f]/10 text-[#f59f4f] ring-1 ring-[#f59f4f]/30"
      : "text-[#9fb2c6] hover:bg-white/[0.04] hover:text-white",
  ].join(" ");
}

const AdminGrowthLayout: React.FC = () => {
  useEffect(() => {
    // Force noindex for the entire admin surface.
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", "noindex, nofollow");
    document.title = "InBharat · Growth Agent (admin)";
    return () => {
      // Restore a sane default on unmount.
      if (el) el.setAttribute("content", "index, follow");
    };
  }, []);

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-[#030508] text-white">
        <div className="landing-atmosphere" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-6 lg:px-10">
          <header className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#0a0f18]">
                <ShieldAlert size={18} className="text-[#f59f4f]" />
              </div>
              <div>
                <p className="text-[13px] font-semibold tracking-[0.2em] text-white">INBHARAT GROWTH</p>
                <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">Audit-only · Human-approved</p>
              </div>
            </div>
            <Link
              to="/"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold text-[#c0cfe0] transition-all hover:border-white/20 hover:text-white"
            >
              Back to site
            </Link>
          </header>

          <div className="flex flex-1 flex-col gap-6 sm:flex-row">
            <nav className="flex shrink-0 flex-row gap-1.5 overflow-x-auto sm:w-56 sm:flex-col">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end className={({ isActive }) => navClass(isActive)}>
                  <n.icon size={15} />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </nav>

            <main className="min-w-0 flex-1">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </RequireAdmin>
  );
};

export default AdminGrowthLayout;