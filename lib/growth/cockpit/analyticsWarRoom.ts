/**
 * Pure "Analytics War Room" derivation — turns a single GA4 + GSC snapshot into a
 * ranked, actionable opportunities table. React-free so scripts/test-growth.ts can
 * drive it with fixtures (no DOM, no lucide). The Performance page attaches chips
 * + links; this module only computes.
 *
 * HONESTY CONTRACT: a single snapshot cannot show rising/falling trends (that needs
 * a historical comparison between two syncs, which we do not persist as time-series).
 * So we only surface signals derivable from ONE window:
 *   • low_ctr            — ≥200 impressions, <2% CTR (title/meta is the lever)
 *   • high_impr_low_click— ≥500 impressions, ≤1 click (almost no uptake)
 *   • page1_low_ctr      — avg position ≤10 (page 1) but <1% CTR (ranking, not earning clicks)
 * Each row carries a concrete recommended action. No fabricated deltas.
 */

export type OpportunitySignal =
  | "low_ctr"
  | "high_impr_low_click"
  | "page1_low_ctr";

export type Priority = "high" | "medium" | "low";

export interface OpportunityRow {
  id: string;
  signal: OpportunitySignal;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number | null;
  action: string;
  priority: Priority;
}

/** Minimal snapshot slice the derivation needs. Keeps the module React-free and
 *  decoupled from the page's full Snapshot interface. */
export interface WarRoomSnapshot {
  gsc?: {
    topPages: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  } | null;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const ACTION_BY_SIGNAL: Record<OpportunitySignal, string> = {
  low_ctr: "Rewrite title + meta description to lift CTR",
  high_impr_low_click: "Rework title/meta + add internal links — near-zero uptake",
  page1_low_ctr: "You rank on page 1 but earn few clicks — rewrite title + meta",
};

const LABEL_BY_SIGNAL: Record<OpportunitySignal, string> = {
  low_ctr: "Low CTR",
  high_impr_low_click: "High impressions, ~0 clicks",
  page1_low_ctr: "Page-1, low CTR",
};

export function signalLabel(s: OpportunitySignal): string {
  return LABEL_BY_SIGNAL[s];
}

/** Normalize a GSC page URL to its slug tail for display (falls back to the raw
 *  URL when it isn't a /learn-ai-with-reeturaj/ path). Pure + testable. */
export function pageSlug(url: string): string {
  const m = url.match(/\/learn-ai-with-reeturaj\/([^?#]+)/i);
  return m ? m[1].replace(/\/+$/, "") : url;
}

/** Derive a ranked opportunities list from a single snapshot. Pure + testable.
 *  A page can match more than one signal — we emit the highest-priority match only
 *  (page1_low_ctr > high_impr_low_click > low_ctr) to avoid duplicate rows. */
export function deriveOpportunities(snap: WarRoomSnapshot | null | undefined): OpportunityRow[] {
  const pages = snap?.gsc?.topPages ?? [];
  const out: OpportunityRow[] = [];
  const seen = new Set<string>();
  for (const r of pages) {
    const page = pageSlug(r.keys[0] ?? "");
    const ctr = r.ctr;
    const pos = r.position;
    let signal: OpportunitySignal | null = null;
    let priority: Priority = "low";
    if (pos != null && pos <= 10 && ctr < 0.01 && r.impressions >= 100) {
      signal = "page1_low_ctr";
      priority = "high";
    } else if (r.impressions >= 500 && r.clicks <= 1) {
      signal = "high_impr_low_click";
      priority = "high";
    } else if (r.impressions >= 200 && ctr < 0.02) {
      signal = "low_ctr";
      priority = "medium";
    }
    if (!signal) continue;
    const key = `${signal}:${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      signal,
      page,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr,
      position: pos ?? null,
      action: ACTION_BY_SIGNAL[signal],
      priority,
    });
  }
  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** Audience (country/device/source) rows are already in the snapshot; this just
 *  normalizes + truncates so the page renders one table per dimension uniformly. */
export interface AudienceRow { key: string; sessions: number; }
export function topAudience(rows: { key: string; sessions: number }[] | null | undefined, limit = 10): AudienceRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .slice()
    .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0))
    .slice(0, limit)
    .map((r) => ({ key: r.key || "(unset)", sessions: r.sessions ?? 0 }));
}