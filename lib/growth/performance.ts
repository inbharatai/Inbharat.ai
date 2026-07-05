/**
 * InBharat Growth Agent — Module 12: Performance Tracker (GA4 + GSC).
 *
 * Reads Google Analytics 4 (Data API) and Google Search Console via a
 * service account, signing the OAuth JWT with Node's crypto (no new dep).
 * Every function is graceful: if the relevant env credentials are absent
 * it returns { configured: false } instead of throwing — so the admin
 * Performance page renders a "connect credentials" state.
 *
 * Credentials: GA4_* / GSC_* are read first, then fall back to the shared
 * GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY so a single service account can
 * back both panels (the founder's prompt's preferred pattern). GA4_PROPERTY_ID
 * and GSC_SITE_URL are always required for their respective panels.
 *
 * Server-only. Never touches the chat backend. Credentials never reach any
 * AI model — the service-account key is used only to mint an OAuth token for
 * the Google APIs; it is never logged, never sent to Gemini/OpenAI.
 */
import crypto from "node:crypto";
import { insertKnowledge } from "./knowledge.js";
import { logError } from "./authorization.js";
import {
  generateInsights,
  insightToKnowledge,
  summarizeSnapshot,
  type AnalyticsSnapshot,
  type Ga4Report,
  type GscReport,
  type GscRow,
  type Insight,
} from "./analyticsInsights.js";

export interface MetricsResult {
  configured: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Service-account email: GA4_CLIENT_EMAIL → GSC_CLIENT_EMAIL → GOOGLE_CLIENT_EMAIL. */
function googleClientEmail(): string | undefined {
  return env("GA4_CLIENT_EMAIL") ?? env("GSC_CLIENT_EMAIL") ?? env("GOOGLE_CLIENT_EMAIL");
}
/** Service-account private key: GA4_PRIVATE_KEY → GSC_PRIVATE_KEY → GOOGLE_PRIVATE_KEY. */
function googlePrivateKey(): string | undefined {
  const k = env("GA4_PRIVATE_KEY") ?? env("GSC_PRIVATE_KEY") ?? env("GOOGLE_PRIVATE_KEY");
  return k ? fmtKey(k) : undefined;
}

function fmtKey(k?: string): string {
  return (k || "").replace(/\\n/g, "\n").trim();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** Mint a Google OAuth access token from a service account. */
async function getServiceAccountToken(clientEmail: string, privateKeyPem: string, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: clientEmail, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(privateKeyPem, "base64url");
  const assertion = `${unsigned}.${signature}`;
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token endpoint ${res.status}: ${txt}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in Google token response");
  return json.access_token;
}

/** GA4 Data API: sessions, users, pageviews over the last N days. */
export async function getGa4Metrics(days = 28): Promise<MetricsResult> {
  const propertyId = env("GA4_PROPERTY_ID");
  const clientEmail = googleClientEmail();
  const privateKey = googlePrivateKey();
  if (!propertyId || !clientEmail || !privateKey) return { configured: false };
  try {
    const token = await getServiceAccountToken(clientEmail, privateKey, "https://www.googleapis.com/auth/analytics.readonly");
    const start = isoDaysAgo(days);
    const end = isoDaysAgo(1);
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }],
      }),
    });
    if (!res.ok) {
      return { configured: true, error: `GA4 ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as any;
    const totals: Record<string, number> = {};
    const names: string[] = (json?.metricHeaders || []).map((h: any) => h.name);
    const row = json?.rows?.[0]?.metricValues || [];
    names.forEach((n, i) => { totals[n] = Number(row[i]?.value ?? 0); });
    return { configured: true, data: { range: `${start}…${end}`, ...totals } };
  } catch (e) {
    return { configured: true, error: String(e) };
  }
}

/** Google Search Console: clicks, impressions, ctr, position over the last N days. */
export async function getGscMetrics(days = 28): Promise<MetricsResult> {
  const siteUrl = env("GSC_SITE_URL");
  const clientEmail = googleClientEmail();
  const privateKey = googlePrivateKey();
  if (!siteUrl || !clientEmail || !privateKey) return { configured: false };
  try {
    const token = await getServiceAccountToken(clientEmail, privateKey, "https://www.googleapis.com/auth/webmasters.readonly");
    const start = isoDaysAgo(days);
    const end = isoDaysAgo(1);
    const encoded = encodeURIComponent(siteUrl);
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        dimensions: [],
        rowLimit: 1,
      }),
    });
    if (!res.ok) {
      return { configured: true, error: `GSC ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as any;
    const r = json?.rows?.[0];
    const metrics = {
      range: `${start}…${end}`,
      clicks: r ? Number(r.clicks ?? 0) : 0,
      impressions: r ? Number(r.impressions ?? 0) : 0,
      ctr: r ? Number(r.ctr ?? 0) : 0,
      position: r ? Number(r.position ?? 0) : 0,
    };
    return { configured: true, data: metrics };
  } catch (e) {
    return { configured: true, error: String(e) };
  }
}

/** Per-URL GSC: clicks/impressions/ctr/position broken down by page, over the
 *  last N days. Same auth path as getGscMetrics but with dimensions:["page"]
 *  + a higher rowLimit. Used by the outcome loop (real ranking/CTR ground
 *  truth per published article) when GSC env is provisioned. */
export interface GscPageRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
export async function getGscPageMetrics(
  days = 28,
  rowLimit = 50,
): Promise<MetricsResult & { pages?: GscPageRow[] }> {
  const siteUrl = env("GSC_SITE_URL");
  const clientEmail = googleClientEmail();
  const privateKey = googlePrivateKey();
  if (!siteUrl || !clientEmail || !privateKey) return { configured: false };
  try {
    const token = await getServiceAccountToken(clientEmail, privateKey, "https://www.googleapis.com/auth/webmasters.readonly");
    const start = isoDaysAgo(days);
    const end = isoDaysAgo(1);
    const encoded = encodeURIComponent(siteUrl);
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        dimensions: ["page"],
        rowLimit,
      }),
    });
    if (!res.ok) {
      return { configured: true, error: `GSC ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as any;
    const rows: any[] = json?.rows ?? [];
    const pages: GscPageRow[] = rows.map((r) => ({
      url: String(r.keys?.[0] ?? ""),
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    }));
    return { configured: true, data: { range: `${start}…${end}`, pages }, pages };
  } catch (e) {
    return { configured: true, error: String(e) };
  }
}

// ─── richer fetchers for the Growth Analytics Inbox ─────────────────────────

/** GA4 Data API: a report broken down by a single dimension (e.g. pagePath,
 *  country, deviceCategory, sessionMedium) + the core metrics. Returns rows
 *  sorted by the first metric desc. Used by getAnalyticsSnapshot for top pages
 *  / country / device / source splits. Throws on non-2xx so the caller can
 *  Promise.allSettled it without taking down the whole snapshot. */
async function ga4DimensionReport(
  token: string,
  propertyId: string,
  days: number,
  dimension: string,
  metrics: Array<{ name: string }>,
  rowLimit = 25,
): Promise<{ rows: Array<{ key: string; metrics: Record<string, number> }>; keys: string[] }> {
  const start = isoDaysAgo(days);
  const end = isoDaysAgo(1);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: dimension }],
      metrics,
      orderBys: [{ metric: { metricType: "metricTypeUnspecified", name: metrics[0].name }, desc: true }],
      limit: rowLimit,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GA4 ${dimension} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const rawRows: any[] = json?.rows ?? [];
  const metricNames: string[] = (json?.metricHeaders || []).map((h: any) => h.name);
  const rows = rawRows.map((r) => {
    const metrics: Record<string, number> = {};
    metricNames.forEach((n, i) => { metrics[n] = Number(r.metricValues?.[i]?.value ?? 0); });
    return { key: String(r.dimensionValues?.[0]?.value ?? ""), metrics };
  });
  return { rows, keys: metricNames };
}

/** Pull the full GA4 + GSC snapshot for the Growth Analytics Inbox. One token
 *  each (reused across dimension fetches). Never throws — surfaces errors in
 *  `error`. Returns configured:false when no credentials are present so the UI
 *  can render the "connect credentials" state. */
export async function getAnalyticsSnapshot(days = 28): Promise<AnalyticsSnapshot> {
  const propertyId = env("GA4_PROPERTY_ID");
  const siteUrl = env("GSC_SITE_URL");
  const clientEmail = googleClientEmail();
  const privateKey = googlePrivateKey();
  const hasGa4 = !!(propertyId && clientEmail && privateKey);
  const hasGsc = !!(siteUrl && clientEmail && privateKey);
  if (!hasGa4 && !hasGsc) return { configured: false, range: { days, start: isoDaysAgo(days), end: isoDaysAgo(1) } };
  const start = isoDaysAgo(days);
  const end = isoDaysAgo(1);
  const snapshot: AnalyticsSnapshot = { configured: true, range: { days, start, end } };
  const errors: string[] = [];

  // GA4 report (totals + top pages + country/device/source splits).
  if (hasGa4) {
    try {
      const token = await getServiceAccountToken(clientEmail!, privateKey!, "https://www.googleapis.com/auth/analytics.readonly");
      const baseMetrics = [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }];
      // Totals (no dimension).
      const totalsRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], metrics: baseMetrics }),
      });
      const totals = { sessions: 0, totalUsers: 0, screenPageViews: 0, averageSessionDuration: 0 };
      if (totalsRes.ok) {
        const tj = (await totalsRes.json()) as any;
        const names: string[] = (tj?.metricHeaders || []).map((h: any) => h.name);
        const row = tj?.rows?.[0]?.metricValues || [];
        names.forEach((n, i) => { (totals as any)[n] = Number(row[i]?.value ?? 0); });
      } else {
        errors.push(`GA4 totals ${totalsRes.status}`);
      }
      const [pagesR, countryR, deviceR, sourceR] = await Promise.allSettled([
        ga4DimensionReport(token, propertyId!, days, "pagePath", [{ name: "screenPageViews" }, { name: "sessions" }, { name: "totalUsers" }], 25),
        ga4DimensionReport(token, propertyId!, days, "country", [{ name: "sessions" }], 15),
        ga4DimensionReport(token, propertyId!, days, "deviceCategory", [{ name: "sessions" }], 10),
        ga4DimensionReport(token, propertyId!, days, "sessionMedium", [{ name: "sessions" }], 12),
      ]);
      const ok = <T>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);
      const ga4: Ga4Report = {
        totals,
        topPages: ok(pagesR)?.rows.map((r) => ({ path: r.key, screenPageViews: r.metrics.screenPageViews ?? 0, sessions: r.metrics.sessions, users: r.metrics.totalUsers })) ?? [],
        byCountry: ok(countryR)?.rows.map((r) => ({ key: r.key, sessions: r.metrics.sessions ?? 0 })) ?? [],
        byDevice: ok(deviceR)?.rows.map((r) => ({ key: r.key, sessions: r.metrics.sessions ?? 0 })) ?? [],
        bySource: ok(sourceR)?.rows.map((r) => ({ key: r.key, sessions: r.metrics.sessions ?? 0 })) ?? [],
      };
      snapshot.ga4 = ga4;
      for (const r of [pagesR, countryR, deviceR, sourceR]) if (r.status === "rejected") errors.push(`GA4 dim: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 120)}`);
    } catch (e) {
      errors.push(`GA4: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
  }

  // GSC report (totals + top queries + top pages + query-by-page).
  if (hasGsc) {
    try {
      const token = await getServiceAccountToken(clientEmail!, privateKey!, "https://www.googleapis.com/auth/webmasters.readonly");
      const encoded = encodeURIComponent(siteUrl!);
      const q = (body: Record<string, unknown>) =>
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const [totRes, qRes, pRes, qpRes] = await Promise.all([
        q({ startDate: start, endDate: end, dimensions: [], rowLimit: 1 }),
        q({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 25 }),
        q({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 25 }),
        q({ startDate: start, endDate: end, dimensions: ["page", "query"], rowLimit: 50 }),
      ]);
      const toRows = async (res: Response): Promise<GscRow[]> => {
        if (!res.ok) { errors.push(`GSC ${res.status}`); return []; }
        const j = (await res.json()) as any;
        return (j?.rows ?? []).map((r: any) => ({ keys: Array.isArray(r.keys) ? r.keys.map(String) : [], clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0) }));
      };
      const [totRows, topQueries, topPages, queryByPage] = await Promise.all([toRows(totRes), toRows(qRes), toRows(pRes), toRows(qpRes)]);
      const t = totRows[0];
      const gsc: GscReport = {
        totals: { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t?.ctr ?? 0, position: t?.position ?? 0 },
        topQueries: topQueries.sort((a, b) => b.impressions - a.impressions),
        topPages: topPages.sort((a, b) => b.clicks - a.clicks),
        queryByPage,
      };
      snapshot.gsc = gsc;
    } catch (e) {
      errors.push(`GSC: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
  }

  if (errors.length && !snapshot.ga4 && !snapshot.gsc) snapshot.error = errors.join("; ");
  else if (errors.length) snapshot.error = errors.join("; "); // partial — surface but still return data
  return snapshot;
}

// ─── KB sync ────────────────────────────────────────────────────────────────

export interface AnalyticsSyncResult {
  ok: boolean;
  configured: boolean;
  synced: number;
  insights: number;
  errors: number;
  summary: string;
  /** Insights are returned so the API/UI can show what was stored without a
   *  second DB read. */
  top: Insight[];
  snapshot: AnalyticsSnapshot;
  error?: string;
}

/**
 * Pull the GA4+GSC snapshot, generate insights, and store each as a knowledge-
 * base row (type 'performance' / 'keyword', sourceType 'analytics' /
 * 'search_console'). The founder reviews them in the Knowledge UI and the agent
 * retrieves them before drafting (so the next article is data-driven).
 *
 * Also fetches the PREVIOUS period (days..2*days) for GSC page rows so
 * rising/falling insights are real (not guessed from a single window). Never
 * throws — errors are counted and surfaced. Idempotent per sync via KB
 * content_hash (re-syncing the same insight summary is a no-op).
 */
export async function syncAnalyticsToKB(days = 28): Promise<AnalyticsSyncResult> {
  const snapshot = await getAnalyticsSnapshot(days);
  if (!snapshot.configured) {
    return { ok: false, configured: false, synced: 0, insights: 0, errors: 0, summary: summarizeSnapshot(snapshot), top: [], snapshot };
  }
  // Previous-period GSC page rows for rising/falling. Best-effort — when this
  // fails we simply don't emit trend insights (honest, not guessed).
  let previousGscPages: GscRow[] | undefined;
  try {
    const prev = await getGscPageMetricsDays(days, days); // offset=days → window [2*days, days)
    if (prev.configured && prev.pages) {
      previousGscPages = prev.pages.map((p) => ({ keys: [p.url], clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.position }));
    }
  } catch (e) {
    void logError("analytics-sync-prev-fail", "gsc", (e as Error).message).catch(() => undefined);
  }

  const insights = generateInsights({ snapshot, previousGscPages, now: Date.now() });
  let synced = 0;
  let errors = 0;
  for (const ins of insights) {
    try {
      const row = insightToKnowledge(ins);
      const r = await insertKnowledge(row);
      if (r) synced++;
    } catch (e) {
      errors++;
      void logError("analytics-sync-insight-fail", ins.type, (e as Error).message).catch(() => undefined);
    }
  }
  return {
    ok: true,
    configured: true,
    synced,
    insights: insights.length,
    errors,
    summary: summarizeSnapshot(snapshot),
    top: insights.slice(0, 10),
    snapshot,
    error: snapshot.error,
  };
}

/** GSC page metrics for a window OFFSET days ago (length `days`). Used by the
 *  sync to fetch the previous period for rising/falling comparisons without
 *  changing the public getGscPageMetrics signature (outcomes.ts depends on it). */
async function getGscPageMetricsDays(days: number, offset: number): Promise<MetricsResult & { pages?: GscPageRow[] }> {
  const siteUrl = env("GSC_SITE_URL");
  const clientEmail = googleClientEmail();
  const privateKey = googlePrivateKey();
  if (!siteUrl || !clientEmail || !privateKey) return { configured: false };
  try {
    const token = await getServiceAccountToken(clientEmail, privateKey, "https://www.googleapis.com/auth/webmasters.readonly");
    const start = isoDaysAgo(days + offset);
    const end = isoDaysAgo(offset + 1);
    const encoded = encodeURIComponent(siteUrl);
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 50 }),
    });
    if (!res.ok) return { configured: true, error: `GSC ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const json = (await res.json()) as any;
    const rows: any[] = json?.rows ?? [];
    const pages: GscPageRow[] = rows.map((r) => ({ url: String(r.keys?.[0] ?? ""), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0) }));
    return { configured: true, data: { range: `${start}…${end}`, pages }, pages };
  } catch (e) {
    return { configured: true, error: String(e) };
  }
}