import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface StatusResp {
  ok: boolean;
  assets?: { domain: string; name: string; status: string }[];
}

const Overview: React.FC = () => {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/growth/status", { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) {
          setError("Not authorized — this admin area is restricted.");
          return;
        }
        setStatus(await r.json());
      })
      .catch(() => !cancelled && setError("Could not reach the growth API."));
    return () => {
      cancelled = true;
    };
  }, []);

  const liveSites = (status?.assets || []).filter((a) => a.status !== "planned");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Overview</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        The InBharat Growth Agent audits SEO + GEO (AI-search readiness) for authorized sites only.
        This phase is <span className="text-[#f59f4f] font-semibold">audit-only</span>: it crawls and
        scores pages — it never writes content or publishes without a human approving a pull request.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Authorized sites" value={liveSites.length} hint={`${(status?.assets || []).length} total in registry`} />
        <Stat label="Mode" value={"Audit-only"} hint="No auto-publish" />
        <Stat label="Human approval" value={"Required"} hint="PR-only workflow" />
      </div>

      <div className="mt-8">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Live authorized sites</h2>
        {error && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}
        {!error && !status && <p className="mt-3 text-[13px] text-[#7a9ab8]">Loading…</p>}
        {status && (
          <ul className="mt-3 space-y-2">
            {liveSites.map((a) => (
              <li key={a.domain} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div>
                  <p className="text-[14px] font-semibold text-white">{a.name}</p>
                  <p className="text-[12px] text-[#7a9ab8]">{a.domain}</p>
                </div>
                <Link to={`/admin/growth/sites`} className="text-[12px] font-semibold text-[#f59f4f] hover:underline">
                  Audit →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <p className="text-[11px] uppercase tracking-[0.15em] text-[#7a9ab8]">{label}</p>
    <p className="mt-1.5 text-lg font-bold text-white">{value}</p>
    <p className="mt-1 text-[11px] text-[#5f7c98]">{hint}</p>
  </div>
);

export default Overview;