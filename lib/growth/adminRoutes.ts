/**
 * Single source of truth for the /admin/growth child routes.
 *
 * Three surfaces must agree on this set or the live site breaks:
 *   1. index.tsx           — the react-router <Route> children (SPA routing)
 *   2. AdminGrowthLayout   — the left nav rail
 *   3. seo.config.ts       — ADMIN_GROWTH_PATHS → prebuilt noindex shells
 *
 * Before this module existed, all three were hand-maintained and a new route
 * added to the router without an entry in seo.config's ADMIN_GROWTH_PATHS would
 * 404 in production (the catch-all rewrite does not serve the SPA for shell-less
 * admin routes). The router + nav + SEO shells now all derive from this list, so
 * adding a child means adding one entry here. scripts/test-growth.ts asserts the
 * list is non-empty, unique, and well-formed so drift fails CI.
 *
 * The index route ("") maps to /admin/growth itself — the Jervis Cockpit
 * launchpad (pages/admin/growth/Cockpit.tsx), whose default tab is the live
 * "Today Command" (see Phase 1 of the command-center upgrade).
 *
 * Pure module: no React, no Supabase, no env — safe to import from build
 * scripts, the SPA, and the API alike.
 */

export interface AdminGrowthChild {
  /** "" for the index route, else the URL segment after /admin/growth/ */
  segment: string;
  /** nav label (the rail attaches the icon separately) */
  label: string;
}

export const ADMIN_GROWTH_CHILDREN: AdminGrowthChild[] = [
  { segment: "", label: "Cockpit" },
  { segment: "overview", label: "Overview" },
  { segment: "usage", label: "Usage" },
  { segment: "sites", label: "Sites" },
  { segment: "repos", label: "Repos" },
  { segment: "rules", label: "Rules" },
  { segment: "strategy", label: "Strategy" },
  { segment: "inbox", label: "Inbox" },
  { segment: "intelligence", label: "Intelligence" },
  { segment: "knowledge", label: "Knowledge" },
  { segment: "agent", label: "Agent" },
  { segment: "learning", label: "Learning" },
  { segment: "issues", label: "Issues" },
  { segment: "performance", label: "Performance" },
  { segment: "settings", label: "Settings" },
];

/** Full noindex admin paths, derived — never hand-maintained. */
export const ADMIN_GROWTH_PATHS: string[] = ADMIN_GROWTH_CHILDREN.map((c) =>
  c.segment ? `/admin/growth/${c.segment}` : "/admin/growth",
);

/** True for any path under the private admin console (used for noindex forcing). */
export function isAdminGrowthPath(pathname: string): boolean {
  return pathname === "/admin/growth" || pathname.startsWith("/admin/growth/");
}