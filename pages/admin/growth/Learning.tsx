import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface OutcomeView {
  id: string;
  draftId: string | null;
  url: string;
  kind: string;
  publishedAt: string;
  title: string | null;
  baseline: { seo: number | null; geo: number | null };
  measured: { seo: number | null; geo: number | null; measuredAt: string | null };
  gsc: { clicks: number | null; impressions: number | null; ctr: number | null; position: number | null };
  linkedinEngagement: { impressions?: number | null; reactions?: number | null; comments?: number | null } | null;
  seoDelta: number | null;
  geoDelta: number | null;
  issuesResolved: number;
  critiqueStatus: string | null;
}

interface ProposedRule {
  id: string;
  scope: string;
  scopeKey: string | null;
  kind: string;
  ruleText: string;
  evidence: unknown;
  createdAt: string;
}

interface OutcomesResp {
  ok: boolean;
  outcomes?: OutcomeView[];
  proposed?: ProposedRule[];
  error?: string;
}

const KIND_COLOR: Record<string, string> = {
  do: "bg-emerald-500/15 text-emerald-300",
  dont: "bg-rose-500/15 text-rose-300",
  voice: "bg-violet-500/15 text-violet-300",
  schedule: "bg-sky-500/15 text-sky-300",
};
const CRITIQUE_COLOR: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  skipped: "bg-white/5 text-[#9fb2c6]",
  redacted: "bg-amber-500/15 text-amber-300",
  parse_failed: "bg-amber-500/15 text-amber-300",
  model_error: "bg-rose-500/15 text-rose-300",
};

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";

function deltaCls(d: number | null): string {
  if (d == null) return "text-[#7a9ab8]";
  if (d > 0) return "text-emerald-300";
  if (d < 0) return "text-rose-300";
  return "text-[#c0cfe0]";
}
function fmtDelta(d: number | null): string {
  if (d == null) return "—";
  return `${d > 0 ? "+" : ""}${d}`;
}

const Learning: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [outcomes, setOutcomes] = useState<OutcomeView[]>([]);
  const [proposed, setProposed] = useState<ProposedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // manual LinkedIn engagement inputs per draftId
  const [eng, setEng] = useState<Record<string, { impressions: string; reactions: string; comments: string }>>({});
  const [engSaving, setEngSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<OutcomesResp>("/api/growth/outcomes");
    if (error) setError(error);
    else {
      setOutcomes(data?.outcomes || []);
      setProposed(data?.proposed || []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableRule(id: string) {
    const { error } = await fetchJson("/api/growth/rules", {
      method: "PATCH",
      body: JSON.stringify({ id, patch: { enabled: true } }),
    });
    if (error) setError(error);
    else await load();
  }

  async function dismissRule(id: string) {
    if (!confirm("Dismiss this learned rule? It will be deleted.")) return;
    const { error } = await fetchJson("/api/growth/rules", { method: "DELETE", body: JSON.stringify({ id }) });
    if (error) setError(error);
    else await load();
  }

  async function saveEngagement(draftId: string) {
    const e = eng[draftId] ?? { impressions: "", reactions: "", comments: "" };
    setEngSaving(draftId);
    const { error } = await fetchJson("/api/growth/outcomes", {
      method: "POST",
      body: JSON.stringify({
        draftId,
        impressions: e.impressions.trim() ? Number(e.impressions) : undefined,
        reactions: e.reactions.trim() ? Number(e.reactions) : undefined,
        comments: e.comments.trim() ? Number(e.comments) : undefined,
      }),
    });
    setEngSaving(null);
    if (error) setError(error);
    else {
      // Clear the saved draftId's local input so the next render re-seeds from the
      // freshly-loaded server values (otherwise the stale local input shadows them).
      setEng((prev) => {
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
      await load();
    }
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Learning</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        The agent measures the SEO/GEO impact of every published LinkedIn draft, distills the lessons into proposed rules, and
        asks you to approve them. Approved rules shape future drafts — the agent gets smarter, you stay in control. Nothing
        auto-publishes.
      </p>

      {error && <p className="mt-4 text-[13px] text-rose-300">{error}</p>}

      {/* Proposed learned rules */}
      <section className="mt-6 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
        <h2 className="text-[15px] font-bold text-white">Proposed rules awaiting approval ({proposed.length})</h2>
        <p className="mt-1 text-[12px] text-[#9fb2c6]">
          Distilled weekly from recent outcomes. Enable to apply to future drafts; dismiss to delete.
        </p>
        <div className="mt-3 space-y-2">
          {proposed.length === 0 && <p className="text-[12px] text-[#7a9ab8]">No proposed rules yet — the weekly distill pass will surface them here once outcomes are measured.</p>}
          {proposed.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_COLOR[r.kind] || "bg-white/5 text-[#9fb2c6]"}`}>{r.kind}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-[#9fb2c6]">{r.scope}</span>
                {r.scopeKey && <span className="text-[11px] text-[#f59f4f]">{r.scopeKey}</span>}
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300">learned</span>
              </div>
              <p className="text-[13px] leading-relaxed text-white">{r.ruleText}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => enableRule(r.id)} className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-[11px] font-semibold text-[#06120c] hover:bg-emerald-400">
                  Enable
                </button>
                <button onClick={() => dismissRule(r.id)} className="rounded-md border border-rose-500/20 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Published drafts → outcome deltas */}
      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Published draft outcomes</h2>
        <div className="mt-3 space-y-3">
          {outcomes.length === 0 && <p className="text-[13px] text-[#7a9ab8]">No published drafts measured yet. Publish a draft from the Issues tab — the daily cron re-audits it and records the delta here.</p>}
          {outcomes.map((o) => {
            const e = eng[o.draftId ?? ""] ?? {
              impressions: o.linkedinEngagement?.impressions?.toString() ?? "",
              reactions: o.linkedinEngagement?.reactions?.toString() ?? "",
              comments: o.linkedinEngagement?.comments?.toString() ?? "",
            };
            return (
              <div key={o.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-white">{o.title || o.url}</p>
                    <p className="truncate text-[12px] text-[#7a9ab8]">{o.url}</p>
                    <p className="mt-0.5 text-[11px] text-[#5f7c98]">published {new Date(o.publishedAt).toLocaleDateString()} · measured {o.measured.measuredAt ? new Date(o.measured.measuredAt).toLocaleDateString() : "pending"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-wide text-[#7a9ab8]">SEO</p>
                      <p className="text-[13px] font-bold text-white">{o.measured.seo ?? "—"}<span className="text-[11px] text-[#7a9ab8]"> ← {o.baseline.seo ?? "—"}</span></p>
                      <p className={`text-[11px] font-semibold ${deltaCls(o.seoDelta)}`}>{fmtDelta(o.seoDelta)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-wide text-[#7a9ab8]">GEO</p>
                      <p className="text-[13px] font-bold text-white">{o.measured.geo ?? "—"}<span className="text-[11px] text-[#7a9ab8]"> ← {o.baseline.geo ?? "—"}</span></p>
                      <p className={`text-[11px] font-semibold ${deltaCls(o.geoDelta)}`}>{fmtDelta(o.geoDelta)}</p>
                    </div>
                    {o.critiqueStatus && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CRITIQUE_COLOR[o.critiqueStatus] || "bg-white/5 text-[#9fb2c6]"}`} title="Self-critique pass status">critique:{o.critiqueStatus}</span>
                    )}
                    {o.issuesResolved > 0 && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300" title="SEO/GEO audit issues fixed between baseline and measured">
                        ✓ {o.issuesResolved} resolved
                      </span>
                    )}
                  </div>
                </div>

                {(o.gsc.clicks != null || o.gsc.impressions != null || o.gsc.position != null) && (
                  <p className="mt-2 text-[11px] text-[#7ab9e6]">
                    GSC: {o.gsc.clicks ?? "—"} clicks · {o.gsc.impressions ?? "—"} impressions · position {o.gsc.position ?? "—"} · CTR {o.gsc.ctr != null ? (o.gsc.ctr * 100).toFixed(2) + "%" : "—"}
                  </p>
                )}

                {/* Manual LinkedIn engagement input */}
                <div className="mt-3 rounded-lg border border-white/10 bg-[#0a0f18] p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]">LinkedIn engagement (manual)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={inputCls} inputMode="numeric" placeholder="impressions" value={e.impressions}
                      onChange={(ev) => setEng({ ...eng, [o.draftId ?? ""]: { ...e, impressions: ev.target.value } })} />
                    <input className={inputCls} inputMode="numeric" placeholder="reactions" value={e.reactions}
                      onChange={(ev) => setEng({ ...eng, [o.draftId ?? ""]: { ...e, reactions: ev.target.value } })} />
                    <input className={inputCls} inputMode="numeric" placeholder="comments" value={e.comments}
                      onChange={(ev) => setEng({ ...eng, [o.draftId ?? ""]: { ...e, comments: ev.target.value } })} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => saveEngagement(o.draftId ?? "")} disabled={!o.draftId || engSaving === o.draftId}
                      className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0a66c2]/90 disabled:opacity-40">
                      {engSaving === o.draftId ? "Saving…" : "Save engagement"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Learning;