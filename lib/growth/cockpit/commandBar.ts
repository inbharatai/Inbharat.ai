/**
 * Pure "Command Bar" logic — builds the static command index (navigation +
 * action shortcuts) and filters/ranks it by query. React-free so
 * scripts/test-growth.ts can drive it with fixtures (no DOM, no lucide, no router).
 *
 * The command bar is Jervis-style Cmd+K over the admin console. To stay cheap and
 * side-effect-free at build time, the index is STATIC: every admin child route
 * (derived from ADMIN_GROWTH_CHILDREN, the single source of truth) becomes a
 * "Go to <label>" navigation command, plus a handful of action shortcuts that
 * fire existing POST endpoints (Sync analytics, Run daily audit). Dynamic search
 * over live drafts/KB rows would require fetching on open — kept out of the pure
 * layer; the component can layer that on later without changing this module.
 *
 * HONESTY CONTRACT: filterCommands never fabricates commands. An empty query
 * returns the canonical order; a non-empty query returns only label/keyword
 * matches, ranked by prefix > substring > token-contains.
 */

import { ADMIN_GROWTH_CHILDREN, type AdminGrowthChild } from "../adminRoutes.js";

export type CommandGroup = "navigate" | "action";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  /** icon key the component maps to a lucide icon (kept out of the pure layer). */
  iconKey: string;
  group: CommandGroup;
  /** navigate commands carry a router `to`; action commands carry an `action` key. */
  to?: string;
  action?: string;
  /** extra keywords for matching (lowercased). */
  keywords?: string[];
}

/** Action shortcuts — fire existing read/mutate endpoints. The component handles
 *  the actual fetch; this is just the index entry. */
const ACTION_COMMANDS: Command[] = [
  { id: "act:sync-analytics", label: "Sync analytics (28d)", hint: "POST /api/growth/performance", iconKey: "bar", group: "action", action: "sync-analytics", keywords: ["ga4", "gsc", "performance", "sync"] },
  { id: "act:run-audit", label: "Run daily audit", hint: "POST /api/growth/cron/daily", iconKey: "refresh", group: "action", action: "run-audit", keywords: ["cron", "seo", "geo", "audit"] },
  { id: "act:refresh", label: "Refresh current view", hint: "Reload the page", iconKey: "refresh", group: "action", action: "refresh", keywords: ["reload"] },
];

/** Build navigation commands from the single source of truth. The index route
 *  (segment "") maps to "/admin/growth". Pure + testable. */
export function buildNavCommands(children: AdminGrowthChild[] = ADMIN_GROWTH_CHILDREN): Command[] {
  return children.map((c) => ({
    id: `nav:${c.segment || "index"}`,
    label: `Go to ${c.label}`,
    iconKey: "nav",
    group: "navigate",
    to: c.segment ? `/admin/growth/${c.segment}` : "/admin/growth",
    keywords: [c.label.toLowerCase(), c.segment],
  }));
}

/** The full static index: navigation + actions. Pure + testable. */
export function buildCommandIndex(children: AdminGrowthChild[] = ADMIN_GROWTH_CHILDREN): Command[] {
  return [...buildNavCommands(children), ...ACTION_COMMANDS];
}

/** Normalize a query for matching. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Score a command against a query: 3 = label prefix, 2 = label substring,
 *  1 = keyword contains. 0 = no match. Pure + testable. */
export function scoreCommand(cmd: Command, q: string): number {
  if (!q) return 0;
  const label = cmd.label.toLowerCase();
  const kw = (cmd.keywords ?? []).join(" ");
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  if (kw.includes(q)) return 1;
  return 0;
}

/** Filter + rank the index by query. Empty query → canonical order (navigate then
 *  action). Non-empty → only matches, sorted by score desc then label asc. */
export function filterCommands(index: Command[], query: string): Command[] {
  const q = norm(query);
  if (!q) return index;
  return index
    .map((cmd) => ({ cmd, score: scoreCommand(cmd, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label))
    .map((x) => x.cmd);
}