import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * Settings — live configuration summary.
 *
 * Pulls real configured-booleans from /api/growth/insights (no more always-false
 * client `hasFlag`) and the confirmed admin identity from /api/growth/whoami.
 * Shows the live monthly cap with a link to edit it on the Usage tab. Secret
 * values live in Vercel env and are never exposed to the client or sent to any
 * AI model — this surface is booleans + identities only.
 */
interface InsightsResp {
  ok: boolean;
  integrations?: { gemini: boolean; supabase: boolean; cronSecret: boolean; ga4: boolean; gsc: boolean; instagram: boolean; linkedinApi: boolean };
  spend?: { spentUsd: number; capUsd: number; projectedUsd: number; remainingUsd: number; source: string };
  error?: string;
}
interface WhoamiResp {
  ok: boolean;
  admin?: boolean;
  userId?: string;
  email?: string;
}

const Settings: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [insights, setInsights] = useState<InsightsResp | null>(null);
  const [whoami, setWhoami] = useState<WhoamiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whoamiError, setWhoamiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [i, w] = await Promise.all([
      fetchJson<InsightsResp>("/api/growth/insights"),
      fetchJson<WhoamiResp>("/api/growth/whoami"),
    ]);
    if (i.error && !i.data) setError(i.error);
    else setError(null);
    setInsights(i.data);
    setWhoami(w.data);
    // Surface a whoami failure separately — otherwise a fetch error renders as
    // "Not authorized", which is misleading (the founder may actually be admin).
    setWhoamiError(w.error && !w.data ? w.error : null);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  const integ = insights?.integrations;
  const cap = insights?.spend?.capUsd;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Configuration summary. Secret values live in Vercel env and are never exposed to the client or sent to any AI
        model. Toggle status by setting the corresponding env var and redeploying.
      </p>

      {loading && <p className="mt-6 text-[13px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-rose-300">Failed to load: {error}</p>}

      <div className="mt-6 space-y-4">
        <Section title="Admin identity (server-verified)">
          {whoamiError ? (
            <p className="text-[13px] text-rose-300">Could not verify admin identity: {whoamiError}. The status below is unreliable until this resolves.</p>
          ) : (
            <>
              <Row label="Status" value={whoami?.admin ? "Authorized" : "Not authorized"} ok={!!whoami?.admin} />
              <Row label="User ID" value={whoami?.userId ?? "—"} />
              <Row label="Email" value={whoami?.email ?? "—"} />
            </>
          )}
          <p className="text-[11px] leading-relaxed text-[#7a9ab8]">
            The server is the single source of truth: you are an admin if your Supabase user id is in{" "}
            <code className="text-[#f59f4f]">GROWTH_ADMIN_USER_IDS</code> or your{" "}
            <code className="text-[#f59f4f]">app_metadata.role</code> is <code className="text-[#f59f4f]">admin</code>.
            No client allowlist, no redeploy to change admins.
          </p>
        </Section>

        <Section title="Monthly budget">
          <Row label="Current cap" value={cap != null ? `$${cap}` : "—"} />
          <p className="text-[11px] text-[#7a9ab8]">
            Edit the live cap on the{" "}
            <Link to="/admin/growth/usage" className="text-[#f59f4f] hover:underline">Usage tab</Link>{" "}
            — changes take effect on the next budget check immediately, no redeploy.
          </p>
        </Section>

        <Section title="Audit engine">
          <Row label="Crawler + SEO/GEO auditors" value="Enabled (audit-only)" ok />
          <Row label="Max pages per domain audit" value="25" />
          <Row label="Daily audit cron" value="/api/growth/cron/daily (06:17 UTC)" />
          <Row label="Morning plan cron" value="/api/growth/cron/morning (02:30 UTC = 8am IST)" />
        </Section>

        <Section title="Authorization & safety">
          <Row label="Default mode" value="Deny by default" ok />
          <Row label="Human approval required" value="Yes — founder approves every draft" ok />
          <Row label="Publish path" value="One-click commit to GitHub main (Vercel auto-rebuilds)" ok />
          <Row label="Auto-publish" value="Never — Auto Mode only drafts, never ships" ok />
          <Row label="Secret redaction before model calls" value="On (every iteration)" ok />
        </Section>

        <Section title="Integrations (configured server-side)">
          <IntegrationRow label="Gemini (growth model router)" ok={integ?.gemini} />
          <IntegrationRow label="Supabase (service role)" ok={integ?.supabase} />
          <IntegrationRow label="Cron secret (external schedulers)" ok={integ?.cronSecret} />
          <IntegrationRow label="Google Analytics 4" ok={integ?.ga4} />
          <IntegrationRow label="Google Search Console" ok={integ?.gsc} />
          <IntegrationRow label="Instagram (IG_USER_ID + META_ACCESS_TOKEN)" ok={integ?.instagram} />
          <IntegrationRow label="LinkedIn API (LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN)" ok={integ?.linkedinApi} />
          <p className="mt-1 text-[11px] text-[#7a9ab8]">
            The Vercel scheduled cron authenticates via its <code className="text-[#f59f4f]">vercel-cron</code> signature,
            so the cron secret is optional (only for external schedulers). GA4/GSC need a service-account key in env.
            The Growth Engine is Gemini-only — <code className="text-[#f59f4f]">GEMINI_API_KEY</code> is the only model key needed.
            See <code className="text-[#f59f4f]">docs/social-publishing.md</code> for Instagram and LinkedIn API setup.
          </p>
        </Section>

        <Section title="Env template">
          <p className="text-[12px] leading-relaxed text-[#7a9ab8]">
            See <code className="text-[#f59f4f]">.env.example</code> for the full additive list:
            <code className="ml-1 text-[#f59f4f]">GROWTH_ADMIN_USER_IDS</code>,
            <code className="ml-1 text-[#f59f4f]">CRON_SECRET</code>,
            <code className="ml-1 text-[#f59f4f]">GROWTH_MONTHLY_BUDGET_USD</code>,
            <code className="ml-1 text-[#f59f4f]">GEMINI_API_KEY</code>,
            <code className="ml-1 text-[#f59f4f]">GROWTH_MODEL_*</code>,
            <code className="ml-1 text-[#f59f4f]">GITHUB_TOKEN</code>,
            <code className="ml-1 text-[#f59f4f]">GA4_*</code>,
            <code className="ml-1 text-[#f59f4f]">GSC_*</code>.
          </p>
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">{title}</h2>
    <div className="space-y-2">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string; ok?: boolean }> = ({ label, value, ok }) => (
  <div className="flex items-center justify-between gap-4 text-[13px]">
    <span className="text-[#9fb2c6]">{label}</span>
    <span className={ok ? "font-semibold text-emerald-300" : "font-semibold text-white"}>{value}</span>
  </div>
);

const IntegrationRow: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <div className="flex items-center justify-between gap-4 text-[13px]">
    <span className="text-[#9fb2c6]">{label}</span>
    <span className={`flex items-center gap-2 font-semibold ${ok ? "text-emerald-300" : "text-rose-300"}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-500/70"}`} />
      {ok ? "configured" : "not set"}
    </span>
  </div>
);

export default Settings;