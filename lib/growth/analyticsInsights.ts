/**
 * InBharat Growth Agent — Growth Analytics insights (pure recommendation engine).
 *
 * Pure functions that turn a GA4 + Search Console snapshot into actionable,
 * founder-voice content recommendations — the "data-driven, not guess-driven"
 * layer. No DB, no fetch, no model calls. Hermetically testable.
 *
 * Insight taxonomy (mapped to KB rows by syncAnalyticsToKB):
 *   low_ctr_page       — page getting impressions but few clicks → improve title/meta.
 *   rising_page        — clicks/impressions up vs previous period → update + syndicate.
 *   falling_page       — clicks dropped vs previous period → refresh or archive.
 *   no_traffic_page    — published article, 0 impressions in 28d → refresh or archive.
 *   top_query          — high-impression query → create a follow-up article.
 *   follow_up_article  — article getting traffic for a query → write the follow-up.
 *   product_traffic    — a product page getting search traffic → create LinkedIn post.
 *   country_angle      — a country sending visitors → investor/customer angle.
 *   device_angle       — device split skews mobile/desktop → UX angle.
 *   source_angle       — traffic source insight (e.g. referral spike).
 *
 * Honesty rules:
 *   - No fabricated numbers. Every metric in an insight comes from the snapshot.
 *   - "rising"/"falling" require BOTH current + previous period rows; when the
 *     previous period is absent, those insight types are NOT emitted (we don't
 *     guess a trend from a single window).
 *   - "no_traffic_page" requires a known published article (ARTICLES manifest)
 *     that is ≥30 days old AND absent from GSC rows — not just any URL.
 *   - Insights are bounded (capInsights) so a noisy snapshot can't flood the KB.
 *
 * Server-only import of ARTICLES is safe (pure data). No side effects here.
 */
import { ARTICLES } from "../../content/articles.meta.js";
import type { KnowledgeType } from "./knowledge.js";

// ─── shared shapes ──────────────────────────────────────────────────────────

export interface Ga4Totals {
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  averageSessionDuration: number;
}
export interface Ga4PageRow {
  path: string;
  screenPageViews: number;
  sessions?: number;
  users?: number;
}
export interface Ga4DimRow {
  key: string;
  sessions: number;
  users?: number;
  screenPageViews?: number;
}
export interface Ga4Report {
  totals: Ga4Totals;
  topPages: Ga4PageRow[];
  byCountry: Ga4DimRow[];
  byDevice: Ga4DimRow[];
  bySource: Ga4DimRow[];
  /** True when the GA4 totals report returned HTTP 200. False on a 403/failure —
   *  `totals` is then zeros NOT because there were 0 users, but because the
   *  report never loaded. The UI must show "unavailable" then, not "0 users". */
  totalsOk?: boolean;
}
export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
export interface GscReport {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: GscRow[];
  topPages: GscRow[];
  queryByPage: GscRow[];
  /** True when the pages report returned HTTP 200 (empty is still true). False
   *  when the fetch FAILED (403/network/parse) — `topPages` is then an empty
   *  array NOT because no pages have traffic, but because the data never
   *  loaded. Absence-as-signal insights (no_traffic / rising / falling) must
   *  NOT fire then, or every published article is falsely flagged. */
  pagesOk?: boolean;
  /** True when the queries report returned HTTP 200. */
  queriesOk?: boolean;
}
export interface AnalyticsSnapshot {
  configured: boolean;
  range: { days: number; start: string; end: string };
  ga4?: Ga4Report;
  gsc?: GscReport;
  error?: string;
}

export type InsightType =
  | "low_ctr_page" | "rising_page" | "falling_page" | "no_traffic_page"
  | "top_query" | "follow_up_article" | "product_traffic"
  | "country_angle" | "device_angle" | "source_angle";

export interface Insight {
  type: InsightType;
  source: "GA4" | "Search Console";
  page?: string;
  query?: string;
  country?: string;
  device?: string;
  metrics: Record<string, number>;
  summary: string;
  recommendedAction: string;
  linkedArticleSlug?: string;
  relatedProduct?: string;
  /** 0–100 priority. Higher = more actionable now. */
  priority: number;
}

// ─── product / article mapping ──────────────────────────────────────────────

export type ProductId =
  | "inbharat" | "sahayaak-seva" | "jak-shield"
  | "unoone" | "uniassist" | "kathakitaab" | "testsprep";

const PRODUCT_HINTS: Array<{ id: ProductId; re: RegExp }> = [
  { id: "jak-shield", re: /jak[-_ ]?shield|scam|deepfake|risk|governance/i },
  { id: "sahayaak-seva", re: /sahayaak|healthcare|rural|clinic|doctor|patient/i },
  { id: "unoone", re: /unoone|leaf|agi|offline|edge|indic/i },
  { id: "uniassist", re: /uniassist|study[-_ ]?abroad|university|admission|student/i },
  { id: "kathakitaab", re: /katha|kitaab|storybook|reader/i },
  { id: "testsprep", re: /tests?[-_ ]?prep|exam|mock|cat|gate|jee/i },
  { id: "inbharat", re: /inbharat|bharat|dpiit|startup|agent|ai[-_ ]?foundations?/i },
];

/** Infer the InBharat product a URL/query relates to, or undefined. Pure. */
export function inferProduct(text: string): ProductId | undefined {
  for (const { id, re } of PRODUCT_HINTS) if (re.test(text)) return id;
  return undefined;
}

const ARTICLE_HUB = "/learn-ai-with-reeturaj/";

/** Extract the article slug from a path on inbharat.ai, or undefined. Pure. */
export function slugFromPath(path: string): string | undefined {
  if (!path) return undefined;
  const i = path.indexOf(ARTICLE_HUB);
  if (i < 0) return undefined;
  const tail = path.slice(i + ARTICLE_HUB.length);
  const slug = tail.split(/[?#]/)[0].replace(/\/+$/, "").trim();
  return slug || undefined;
}

/** Days since an ISO date string (datePublished). Pure (uses a caller-supplied
 *  `now` so it stays hermetic — the sync layer passes Date.now()). */
export function daysSince(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, Math.round((now - t) / 86400000));
}

// ─── thresholds (tunable, honest defaults) ──────────────────────────────────

const LOW_CTR_IMPRESSIONS_MIN = 200;   // below this, CTR noise dominates
const LOW_CTR_THRESHOLD = 0.02;        // <2% CTR with ≥200 impressions → fix title
const NO_TRAFFIC_DAYS_MIN = 30;        // article must be ≥30 days published
const RISING_DELTA_MIN = 5;            // +5 clicks vs previous period
const FALLING_DELTA_MIN = 5;           // −5 clicks vs previous period
const TOP_QUERY_IMPRESSIONS_MIN = 100;
const COUNTRY_SHARE_MIN = 0.15;        // ≥15% of sessions → worth an angle
const DEVICE_SKEW_MIN = 0.7;           // ≥70% one device → UX angle
const SOURCE_SHARE_MIN = 0.25;         // ≥25% one source → channel angle
const MAX_INSIGHTS = 30;

// ─── insight generators (each pure) ─────────────────────────────────────────

function lowCtrPages(gsc: GscReport): Insight[] {
  const out: Insight[] = [];
  for (const r of gsc.topPages) {
    if (r.impressions < LOW_CTR_IMPRESSIONS_MIN) continue;
    if (r.ctr >= LOW_CTR_THRESHOLD) continue;
    const page = r.keys[0] ?? "";
    const slug = slugFromPath(page);
    out.push({
      type: "low_ctr_page",
      source: "Search Console",
      page,
      linkedArticleSlug: slug,
      relatedProduct: inferProduct(page),
      metrics: { impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position },
      summary: `Page "${page}" gets ${r.impressions} impressions but only ${(r.ctr * 100).toFixed(1)}% CTR (rank ~${r.position.toFixed(1)}).`,
      recommendedAction: slug
        ? `Improve the title + meta description for the "${slug}" article so more searchers click through.`
        : "Improve the title + meta description for this page so more searchers click through.",
      priority: clamp(Math.round(40 + Math.min(r.impressions / 50, 40) + (LOW_CTR_THRESHOLD - r.ctr) * 500)),
    });
  }
  return out;
}

function risingPages(current: GscRow[], previous: GscRow[]): Insight[] {
  const prevMap = new Map<string, GscRow>();
  for (const r of previous) prevMap.set(r.keys[0] ?? "", r);
  const out: Insight[] = [];
  for (const r of current) {
    const page = r.keys[0] ?? "";
    if (!page) continue;
    const prev = prevMap.get(page);
    const prevClicks = prev?.clicks ?? 0;
    const delta = r.clicks - prevClicks;
    if (delta < RISING_DELTA_MIN) continue;
    const slug = slugFromPath(page);
    out.push({
      type: "rising_page",
      source: "Search Console",
      page,
      linkedArticleSlug: slug,
      relatedProduct: inferProduct(page),
      metrics: { clicks: r.clicks, impressions: r.impressions, prevClicks, delta },
      summary: `Page "${page}" is rising: ${r.clicks} clicks vs ${prevClicks} last period (+${delta}).`,
      recommendedAction: slug
        ? `Update the "${slug}" article while it's climbing — refresh examples, add an internal link, and promote on LinkedIn.`
        : "Update this page while it's climbing — refresh examples and add internal links.",
      priority: clamp(Math.round(50 + Math.min(delta * 2, 40))),
    });
  }
  return out;
}

function fallingPages(current: GscRow[], previous: GscRow[]): Insight[] {
  const prevMap = new Map<string, GscRow>();
  for (const r of previous) prevMap.set(r.keys[0] ?? "", r);
  const out: Insight[] = [];
  for (const r of current) {
    const page = r.keys[0] ?? "";
    if (!page) continue;
    const prev = prevMap.get(page);
    const prevClicks = prev?.clicks ?? 0;
    if (prevClicks === 0) continue; // can't fall from zero — not a trend
    const delta = r.clicks - prevClicks;
    if (delta > -FALLING_DELTA_MIN) continue;
    const slug = slugFromPath(page);
    out.push({
      type: "falling_page",
      source: "Search Console",
      page,
      linkedArticleSlug: slug,
      relatedProduct: inferProduct(page),
      metrics: { clicks: r.clicks, impressions: r.impressions, prevClicks, delta },
      summary: `Page "${page}" is falling: ${r.clicks} clicks vs ${prevClicks} last period (${delta}).`,
      recommendedAction: slug
        ? `Refresh or archive the "${slug}" article — update stale facts, tighten the intro, or retire it if the topic has moved on.`
        : "Refresh or archive this page — update stale facts or retire it if the topic has moved on.",
      priority: clamp(Math.round(45 + Math.min(Math.abs(delta) * 2, 35))),
    });
  }
  return out;
}

function noTrafficPages(gsc: GscReport, now: number, days: number): Insight[] {
  const seen = new Set<string>();
  for (const r of gsc.topPages) {
    const slug = slugFromPath(r.keys[0] ?? "");
    if (slug) seen.add(slug);
  }
  const out: Insight[] = [];
  for (const a of ARTICLES) {
    if (!a.slug || !a.datePublished) continue;
    const age = daysSince(a.datePublished, now);
    if (age < NO_TRAFFIC_DAYS_MIN) continue;
    if (seen.has(a.slug)) continue;
    out.push({
      type: "no_traffic_page",
      source: "Search Console",
      page: `${ARTICLE_HUB}${a.slug}`,
      linkedArticleSlug: a.slug,
      relatedProduct: inferProduct(a.slug + " " + a.title),
      metrics: { impressions: 0, clicks: 0, ageDays: age },
      summary: `Article "${a.slug}" has no Search Console impressions in the last ${days} days (published ${age}d ago).`,
      recommendedAction: `Refresh or archive "${a.slug}" — update the angle, improve on-page SEO, or retire it if the topic no longer fits.`,
      priority: clamp(Math.round(40 + Math.min(age / 5, 30))),
    });
  }
  return out;
}

function topQueryInsights(gsc: GscReport): Insight[] {
  const out: Insight[] = [];
  for (const r of gsc.topQueries) {
    if (r.impressions < TOP_QUERY_IMPRESSIONS_MIN) continue;
    const q = r.keys[0] ?? "";
    if (!q) continue;
    out.push({
      type: "top_query",
      source: "Search Console",
      query: q,
      relatedProduct: inferProduct(q),
      metrics: { impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position },
      summary: `Query "${q}" gets ${r.impressions} impressions, ${r.clicks} clicks (CTR ${(r.ctr * 100).toFixed(1)}%, position ~${r.position.toFixed(1)}).`,
      recommendedAction:
        r.clicks > 0 && r.ctr < LOW_CTR_THRESHOLD
          ? `We rank for "${q}" but CTR is low — write a follow-up article targeting this query with a sharper title.`
          : `Create a follow-up article targeting "${q}" — there's clear demand and we're already surfacing for it.`,
      priority: clamp(Math.round(45 + Math.min(r.impressions / 30, 40) + (r.clicks > 0 ? 5 : 0))),
    });
  }
  return out;
}

function followUpFromQueryByPage(gsc: GscReport): Insight[] {
  // Group queryByPage rows by page; if an article page attracts queries we
  // don't yet have a dedicated article for, suggest the follow-up.
  const byPage = new Map<string, GscRow[]>();
  for (const r of gsc.queryByPage) {
    const page = r.keys[0] ?? "";
    if (!page) continue;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push(r);
  }
  const out: Insight[] = [];
  for (const [page, rows] of byPage) {
    const slug = slugFromPath(page);
    if (!slug) continue; // only suggest follow-ups for article pages
    const totalImp = rows.reduce((n, r) => n + r.impressions, 0);
    if (totalImp < TOP_QUERY_IMPRESSIONS_MIN) continue;
    const top = [...rows].sort((a, b) => b.impressions - a.impressions)[0];
    const q = top.keys[1] ?? "";
    if (!q) continue;
    out.push({
      type: "follow_up_article",
      source: "Search Console",
      page,
      query: q,
      linkedArticleSlug: slug,
      relatedProduct: inferProduct(q + " " + page),
      metrics: { impressions: top.impressions, clicks: top.clicks, ctr: top.ctr, position: top.position },
      summary: `"${slug}" is getting traffic for "${q}" (${top.impressions} impressions).`,
      recommendedAction: `Write a follow-up article targeting "${q}" and link it from the "${slug}" article — the audience is already here.`,
      priority: clamp(Math.round(50 + Math.min(top.impressions / 30, 35))),
    });
  }
  return out;
}

function productTraffic(gsc: GscReport, days: number): Insight[] {
  const out: Insight[] = [];
  const byProduct = new Map<string, number>();
  for (const r of gsc.topPages) {
    const page = r.keys[0] ?? "";
    const p = inferProduct(page);
    if (!p) continue;
    byProduct.set(p, (byProduct.get(p) ?? 0) + r.clicks);
  }
  for (const [p, clicks] of byProduct) {
    if (clicks < 5) continue;
    out.push({
      type: "product_traffic",
      source: "Search Console",
      relatedProduct: p as ProductId,
      metrics: { clicks },
      summary: `The ${p} pages got ${clicks} clicks from search in the last ${days} days.`,
      recommendedAction: `Create a LinkedIn post about ${p} — search demand is real, so amplify it on social and link back to the product page.`,
      priority: clamp(Math.round(45 + Math.min(clicks * 2, 35))),
    });
  }
  return out;
}

function countryAngles(ga4: Ga4Report): Insight[] {
  const out: Insight[] = [];
  const totalSessions = ga4.totals.sessions || 1;
  for (const r of ga4.byCountry) {
    const share = r.sessions / totalSessions;
    if (share < COUNTRY_SHARE_MIN) continue;
    if (r.key === "(other)") continue;
    out.push({
      type: "country_angle",
      source: "GA4",
      country: r.key,
      metrics: { sessions: r.sessions, share: Number(share.toFixed(2)) },
      summary: `${r.key} sends ${r.sessions} sessions (${Math.round(share * 100)}% of total).`,
      recommendedAction:
        /us|united states|uae|singapore|uk|united kingdom/i.test(r.key)
          ? `Create an investor/customer angle for ${r.key} — frame the next article for that audience and syndicate it.`
          : `${r.key} is a strong audience — write a region-aware follow-up that references local context.`,
      priority: clamp(Math.round(40 + Math.min(share * 60, 40))),
    });
  }
  return out;
}

function deviceAngles(ga4: Ga4Report): Insight[] {
  const out: Insight[] = [];
  const totalSessions = ga4.totals.sessions || 1;
  for (const r of ga4.byDevice) {
    const share = r.sessions / totalSessions;
    if (share < DEVICE_SKEW_MIN) continue;
    if (r.key === "(other)") continue;
    out.push({
      type: "device_angle",
      source: "GA4",
      device: r.key,
      metrics: { sessions: r.sessions, share: Number(share.toFixed(2)) },
      summary: `${Math.round(share * 100)}% of sessions are on ${r.key} (${r.sessions} sessions).`,
      recommendedAction:
        /mobile/i.test(r.key)
          ? "Mobile dominates — keep articles short-paragraph, fast, and check the article template on a real phone."
          : "Desktop dominates — longer deep-dives with code blocks will land well.",
      priority: clamp(Math.round(35 + Math.min(share * 30, 30))),
    });
  }
  return out;
}

function sourceAngles(ga4: Ga4Report): Insight[] {
  const out: Insight[] = [];
  const totalSessions = ga4.totals.sessions || 1;
  for (const r of ga4.bySource) {
    const share = r.sessions / totalSessions;
    if (share < SOURCE_SHARE_MIN) continue;
    out.push({
      type: "source_angle",
      source: "GA4",
      metrics: { sessions: r.sessions, share: Number(share.toFixed(2)) },
      summary: `Traffic source "${r.key}" sends ${r.sessions} sessions (${Math.round(share * 100)}%).`,
      recommendedAction:
        /organic|google/i.test(r.key)
          ? "Organic search is the main channel — keep investing in SEO/GEO and don't over-rely on social."
          : /linkedin|referral|social/i.test(r.key)
            ? "Referral/social is meaningful — double down on the LinkedIn + syndication loop."
            : `"${r.key}" is a meaningful channel — understand what's driving it and feed it more.`,
      priority: clamp(Math.round(30 + Math.min(share * 40, 30))),
    });
  }
  return out;
}

// ─── public entry ───────────────────────────────────────────────────────────

export interface GenerateInsightsInput {
  snapshot: AnalyticsSnapshot;
  /** Previous-period GSC page rows (same length window, just before `range`).
   *  Optional — when absent, rising/falling insights are NOT emitted. */
  previousGscPages?: GscRow[];
  /** Caller-supplied now (Date.now()) so this stays hermetic in tests. */
  now: number;
}

/** Turn a snapshot into a bounded, prioritized list of actionable insights.
 *  Pure. Returns [] when the snapshot has no usable data. */
export function generateInsights(input: GenerateInsightsInput): Insight[] {
  const { snapshot, previousGscPages, now } = input;
  const out: Insight[] = [];
  if (snapshot.gsc) {
    out.push(...lowCtrPages(snapshot.gsc));
    out.push(...topQueryInsights(snapshot.gsc));
    out.push(...followUpFromQueryByPage(snapshot.gsc));
    out.push(...productTraffic(snapshot.gsc, snapshot.range.days));
    // Absence-as-signal insights are ONLY valid when the pages report actually
    // succeeded (HTTP 200). When it failed, topPages is empty-from-failure and
    // "not in GSC" means nothing — flagging every published article as
    // no_traffic / falling / rising off a 403 is a false-positive flood.
    // Guard with `pagesOk !== false` so a snapshot built before the flag existed
    // (treated as undefined → allowed) still works, but an explicit failure stops it.
    if (snapshot.gsc.pagesOk !== false) {
      out.push(...noTrafficPages(snapshot.gsc, now, snapshot.range.days));
      if (previousGscPages && previousGscPages.length > 0) {
        out.push(...risingPages(snapshot.gsc.topPages, previousGscPages));
        out.push(...fallingPages(snapshot.gsc.topPages, previousGscPages));
      }
    }
  }
  if (snapshot.ga4) {
    out.push(...countryAngles(snapshot.ga4));
    out.push(...deviceAngles(snapshot.ga4));
    out.push(...sourceAngles(snapshot.ga4));
  }
  // Sort by priority desc, then dedupe by (type+page/query), then cap.
  out.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const deduped: Insight[] = [];
  for (const ins of out) {
    const k = `${ins.type}|${ins.page ?? ""}|${ins.query ?? ""}|${ins.country ?? ""}|${ins.device ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(ins);
  }
  return deduped.slice(0, MAX_INSIGHTS);
}

/** Clamp to [0,100]. */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ─── KB mapping (pure) ──────────────────────────────────────────────────────

/** Map an insight to the KB row shape syncAnalyticsToKB inserts. Pure. */
export function insightToKnowledge(ins: Insight): {
  type: KnowledgeType;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceType: string;
  relatedProduct: string | null;
  keywords: string[];
  intentScore: number;
  status: "discovered";
  linkedArticleId: string | null;
} {
  return {
    type: ins.type === "top_query" || ins.type === "follow_up_article" ? "keyword" : "performance",
    title: ins.summary.slice(0, 240),
    summary: ins.recommendedAction.slice(0, 600),
    sourceUrl: ins.page ?? null,
    sourceType: ins.source === "GA4" ? "analytics" : "search_console",
    relatedProduct: ins.relatedProduct ?? null,
    keywords: ins.query ? [ins.query.toLowerCase()] : [],
    intentScore: ins.priority,
    status: "discovered",
    linkedArticleId: ins.linkedArticleSlug ?? null,
  };
}

/** A founder-facing summary line for the Performance page + agent narration.
 *  Honest about partial syncs: when some Google calls failed, the real numbers
 *  we DID get are reported AND the error is appended — never hidden behind a
 *  generic "error" line that makes it look like nothing was fetched. */
export function summarizeSnapshot(snapshot: AnalyticsSnapshot): string {
  if (!snapshot.configured) return "Analytics not configured — add the Google service-account credentials in Vercel env.";
  const bits: string[] = [];
  if (snapshot.gsc) {
    const g = snapshot.gsc.totals;
    bits.push(`${g.clicks} clicks / ${g.impressions} impressions (CTR ${(g.ctr * 100).toFixed(1)}%, pos ~${g.position.toFixed(1)})`);
    if (snapshot.gsc.topQueries[0]) bits.push(`top query: "${snapshot.gsc.topQueries[0].keys[0]}"`);
  }
  if (snapshot.ga4) {
    const t = snapshot.ga4.totals;
    bits.push(`${t.totalUsers} users / ${t.sessions} sessions / ${t.screenPageViews} pageviews`);
  }
  const base = bits.length ? `Last ${snapshot.range.days}d — ${bits.join(" · ")}.` : `No analytics data returned for the last ${snapshot.range.days}d.`;
  // Partial: surface the error ALONGSIDE the data we did get, so a GA4-ok /
  // GSC-403 sync (the live state today) reports the real GA4 numbers AND notes
  // the GSC failure — instead of narrating "Analytics sync error" and hiding
  // the GA4 data the agent could otherwise draft from.
  return snapshot.error ? `${base} (partial: ${snapshot.error})` : base;
}