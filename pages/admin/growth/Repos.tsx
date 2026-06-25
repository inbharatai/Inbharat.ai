import React, { useEffect, useState } from "react";

interface Repo {
  productName: string;
  productSlug: string;
  publicRepo: string | null;
  websitePath: string | null;
  sourceOfTruth: string;
  publicRepoStatus: string;
  allowAgentRead: boolean;
  allowAgentPR: boolean;
  notes?: string;
  hasPrivateRepo: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  canonical_private: "bg-sky-500/15 text-sky-300",
  public_mirror_current: "bg-emerald-500/15 text-emerald-300",
  public_mirror_outdated: "bg-amber-500/15 text-amber-300",
  public_demo_only: "bg-violet-500/15 text-violet-300",
  deprecated_public_clone: "bg-slate-500/15 text-slate-300",
  do_not_use: "bg-rose-500/15 text-rose-300",
};

const Repos: React.FC = () => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/growth/status", { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = await r.json();
        setRepos(data.repos || []);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;
  if (error) return <p className="text-[13px] text-rose-300">Failed to load: {error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Repository registry</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Read-only view. Private canonical repos are the source of truth and their names are never
        surfaced here; only public mirrors and demo repos are linked.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-[#7a9ab8]">
              <th className="py-2 pr-4 font-semibold">Product</th>
              <th className="py-2 pr-4 font-semibold">Public repo</th>
              <th className="py-2 pr-4 font-semibold">Status</th>
              <th className="py-2 pr-4 font-semibold">Agent read</th>
              <th className="py-2 font-semibold">Agent PR</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((r) => (
              <tr key={r.productSlug} className="border-b border-white/[0.04]">
                <td className="py-3 pr-4">
                  <p className="font-semibold text-white">{r.productName}</p>
                  {r.notes && <p className="mt-0.5 max-w-xs text-[11px] text-[#5f7c98]">{r.notes}</p>}
                </td>
                <td className="py-3 pr-4 align-top">
                  {r.publicRepo ? (
                    <a href={`https://github.com/${r.publicRepo}`} target="_blank" rel="noopener noreferrer" className="text-[#f59f4f] hover:underline">
                      {r.publicRepo}
                    </a>
                  ) : (
                    <span className="text-[#5f7c98]">private-only{r.hasPrivateRepo ? " ✓" : ""}</span>
                  )}
                </td>
                <td className="py-3 pr-4 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[r.publicRepoStatus] || "bg-slate-500/15 text-slate-300"}`}>
                    {r.publicRepoStatus}
                  </span>
                </td>
                <td className="py-3 pr-4 align-top text-[#9fb2c6]">{r.allowAgentRead ? "✓" : "✗"}</td>
                <td className="py-3 align-top text-[#9fb2c6]">{r.allowAgentPR ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Repos;