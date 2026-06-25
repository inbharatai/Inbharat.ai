/**
 * InBharat Growth Agent — Module 12: Performance Tracker (GA4 + GSC).
 *
 * Reads Google Analytics 4 (Data API) and Google Search Console via a
 * service account, signing the OAuth JWT with Node's crypto (no new dep).
 * Every function is graceful: if the relevant env credentials are absent
 * it returns { configured: false } instead of throwing — so the admin
 * Performance page renders a "connect credentials" state.
 *
 * Server-only. Never touches the chat backend.
 */
import crypto from "node:crypto";

export interface MetricsResult {
  configured: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
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
  const clientEmail = env("GA4_CLIENT_EMAIL");
  const privateKey = fmtKey(env("GA4_PRIVATE_KEY"));
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
  const clientEmail = env("GSC_CLIENT_EMAIL");
  const privateKey = fmtKey(env("GSC_PRIVATE_KEY"));
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