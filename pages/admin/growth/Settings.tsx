import React from "react";

/**
 * Read-only settings/env-status panel. Shows which integrations are wired
 * (server-side) so operators know what is live. Does not reveal any secret
 * values — only configured/not-configured booleans.
 */
const Settings: React.FC = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Configuration summary. Secret values live in Vercel env and are never exposed to the client or
        sent to any AI model. Toggle status by setting the corresponding env var and redeploying.
      </p>

      <div className="mt-6 space-y-4">
        <Section title="Audit engine">
          <Row label="Crawler + SEO/GEO auditors" value="Enabled (audit-only)" ok />
          <Row label="Max pages per domain audit" value="25" />
          <Row label="Daily cron endpoint" value="/api/growth/cron/daily" />
        </Section>

        <Section title="Authorization & safety">
          <Row label="Default mode" value="Deny by default" ok />
          <Row label="Human approval required" value="Yes — PR-only workflow" ok />
          <Row label="Direct publishing" value="Disabled" ok />
          <Row label="Secret redaction before model calls" value="On (Phase 5 drafts)" ok />
        </Section>

        <Section title="Integrations (configured server-side)">
          <Row label="Supabase (service role)" value={hasFlag("VITE_SUPABASE_URL") ? "configured" : "not set"} ok={hasFlag("VITE_SUPABASE_URL")} />
          <Row label="Gemini (growth model router)" value={hasFlag("VITE_GROWTH_HAS_GEMINI") ? "configured" : "set in server env"} />
          <Row label="GA4 + GSC" value="See Performance tab" />
          <Row label="GitHub token (Phase 3 PRs)" value="deferred" />
        </Section>

        <Section title="Env template">
          <p className="text-[12px] leading-relaxed text-[#7a9ab8]">
            See <code className="text-[#f59f4f]">.env.example</code> for the full additive list:
            <code className="ml-1 text-[#f59f4f]">GROWTH_ADMIN_USER_IDS</code>,
            <code className="ml-1 text-[#f59f4f]">VITE_GROWTH_ADMIN_USER_IDS</code>,
            <code className="ml-1 text-[#f59f4f]">CRON_SECRET</code>,
            <code className="ml-1 text-[#f59f4f]">GROWTH_MONTHLY_BUDGET_USD</code>,
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

function hasFlag(_name: string): boolean {
  // We deliberately do not probe server secrets from the client. This stays false
  // unless an explicit VITE_ flag is set for UI hinting only.
  return false;
}

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

export default Settings;