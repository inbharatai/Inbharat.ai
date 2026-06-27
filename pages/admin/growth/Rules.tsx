import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface Rule {
  id: string;
  scope: "repo" | "domain" | "global";
  scopeKey: string | null;
  kind: "do" | "dont" | "voice" | "schedule";
  ruleText: string;
  enabled: boolean;
  source: "founder" | "seed" | "learned";
  evidence?: unknown;
}

interface RulesResp {
  ok: boolean;
  rules?: Rule[];
  error?: string;
}

const SCOPES = ["global", "domain", "repo"] as const;
const KINDS = ["dont", "do", "voice", "schedule"] as const;

const KIND_COLOR: Record<string, string> = {
  do: "bg-emerald-500/15 text-emerald-300",
  dont: "bg-rose-500/15 text-rose-300",
  voice: "bg-violet-500/15 text-violet-300",
  schedule: "bg-sky-500/15 text-sky-300",
};

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]";

const Rules: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ scope: Rule["scope"]; scopeKey: string; kind: Rule["kind"]; ruleText: string }>({
    scope: "global",
    scopeKey: "",
    kind: "dont",
    ruleText: "",
  });
  const [saving, setSaving] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "founder" | "seed" | "learned">("all");

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<RulesResp>("/api/growth/rules");
    if (error) setError(error);
    else {
      setRules(data?.rules || []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    if (!draft.ruleText.trim()) return;
    setSaving(true);
    const { error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/rules", {
      method: "POST",
      body: JSON.stringify({
        scope: draft.scope,
        scopeKey: draft.scope === "global" ? null : draft.scopeKey.trim() || null,
        kind: draft.kind,
        ruleText: draft.ruleText.trim(),
      }),
    });
    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setDraft({ scope: "global", scopeKey: "", kind: "dont", ruleText: "" });
    await load();
  }

  async function toggle(r: Rule) {
    const { error } = await fetchJson("/api/growth/rules", {
      method: "PATCH",
      body: JSON.stringify({ id: r.id, patch: { enabled: !r.enabled } }),
    });
    if (error) setError(error);
    else await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    const { error } = await fetchJson("/api/growth/rules", { method: "DELETE", body: JSON.stringify({ id }) });
    if (error) setError(error);
    else await load();
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Agent rules (memory)</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Tell the Growth Agent what to do, what to avoid, and how to sound. These rules are injected into every draft the
        agent writes. Global rules apply everywhere; domain/repo rules apply to that scope.
      </p>

      {error && <p className="mt-4 text-[13px] text-rose-300">{error}</p>}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Add a rule</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Scope</label>
            <select className={inputCls} value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as Rule["scope"] })}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Kind</label>
            <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Rule["kind"] })}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{draft.scope === "global" ? "Scope key (n/a)" : "Scope key (domain / repo slug)"}</label>
            <input
              className={inputCls}
              disabled={draft.scope === "global"}
              placeholder={draft.scope === "domain" ? "inbharat.ai" : "inbharat-ai"}
              value={draft.scopeKey}
              onChange={(e) => setDraft({ ...draft, scopeKey: e.target.value })}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>Rule text</label>
            <textarea className={inputCls} rows={2} value={draft.ruleText} onChange={(e) => setDraft({ ...draft, ruleText: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={add}
            disabled={saving || !draft.ruleText.trim()}
            className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[12.5px] font-semibold text-black transition-colors hover:bg-[#f59f4f]/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add rule"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">All rules</h2>
        <select
          className="rounded-lg border border-white/10 bg-[#0a0f18] px-2.5 py-1 text-[12px] text-[#c0cfe0] focus:border-[#f59f4f]/50 focus:outline-none"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
        >
          <option value="all">All sources</option>
          <option value="founder">Founder</option>
          <option value="seed">Seed</option>
          <option value="learned">Learned</option>
        </select>
      </div>

      <div className="mt-3 space-y-2">
        {rules.length === 0 && <p className="text-[13px] text-[#7a9ab8]">No rules yet.</p>}
        {rules.filter((r) => sourceFilter === "all" || r.source === sourceFilter).map((r) => (
          <div key={r.id} className={`rounded-lg border p-3 ${r.enabled ? "border-white/10 bg-white/[0.02]" : "border-white/5 bg-transparent opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_COLOR[r.kind]}`}>{r.kind}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-[#9fb2c6]">{r.scope}</span>
                  {r.scopeKey && <span className="text-[11px] text-[#f59f4f]">{r.scopeKey}</span>}
                  {r.source === "learned" && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300" title="Proposed by the agent's weekly learning pass">learned</span>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed text-white">{r.ruleText}</p>
                {r.source === "learned" && r.evidence && (
                  <p className="mt-1 text-[11px] text-[#7a9ab8]">Proposed from outcome evidence · enable to apply it to future drafts.</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => toggle(r)} className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#c0cfe0] hover:border-white/25">
                  {r.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => remove(r.id)} className="rounded-md border border-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Rules;