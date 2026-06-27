import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * /admin/growth/strategy — founder CMO strategy (Phase D). Edit the positioning /
 * ICP / audience / voice / competitive-diff / goals that the Growth Agent injects
 * into every draft + critique prompt (the thing that makes it an expert CMO).
 * "Generate draft from recent learnings" drafts the fields from recent measured
 * outcomes — but does NOT save them; the founder reviews, edits, then saves.
 */
interface Strategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
}

interface DraftedStrategy extends Strategy {
  note?: string;
}

const FIELDS: { key: keyof Strategy; label: string; hint: string }[] = [
  { key: "positioning", label: "Positioning", hint: "One-line category claim — what InBharat IS in the market." },
  { key: "icp", label: "ICP (ideal customer profile)", hint: "Who you sell to — titles, companies, stage." },
  { key: "audience", label: "Audience (content readers)", hint: "Who you write for — may differ from buyers." },
  { key: "voice", label: "Voice / tone", hint: "How InBharat sounds — concise, practical, hype-free, etc." },
  { key: "competitiveDiff", label: "Competitive difference", hint: "Why InBharat over alternatives — concrete, not vague." },
  { key: "goals", label: "GTM goals", hint: "Near-term goals the agent's content should serve." },
];

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]";

const EMPTY: Strategy = { positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null };

const StrategyPage: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [strategy, setStrategy] = useState<Strategy>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<{ ok: boolean; strategy?: Strategy; error?: string }>("/api/growth/strategy");
    if (error) setError(error);
    else if (data?.strategy) setStrategy({ ...EMPTY, ...data.strategy });
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: keyof Strategy, value: string) {
    setStrategy((s) => ({ ...s, [key]: value || null }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    const { data, error } = await fetchJson<{ ok: boolean; strategy?: Strategy; error?: string }>("/api/growth/strategy", {
      method: "POST",
      body: JSON.stringify(strategy),
    });
    setSaving(false);
    if (error || !data?.ok) setError(error || data?.error || "save failed");
    else {
      if (data.strategy) setStrategy({ ...EMPTY, ...data.strategy });
      setMsg("Strategy saved — the next draft + critique will use it.");
    }
  }

  async function generateDraft() {
    setDrafting(true);
    setMsg(null);
    setError(null);
    const { data, error } = await fetchJson<{ ok: boolean; drafted?: DraftedStrategy; note?: string; error?: string }>(
      "/api/growth/strategy?action=draft",
      { method: "POST", body: JSON.stringify({}) },
    );
    setDrafting(false);
    if (error || !data?.ok) {
      setError(error || data?.error || "draft failed");
      return;
    }
    if (data.drafted) {
      // Pre-fill the form with the drafted fields — NOT saved. Founder reviews + edits + Save.
      setStrategy({ ...EMPTY, ...data.drafted });
      setMsg(data.note ?? "Drafted from recent learnings — review, edit, then Save to apply.");
    } else {
      setMsg(data.note ?? "Nothing drafted yet.");
    }
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading strategy…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">CMO Strategy</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        The positioning, ICP, audience, voice, and competitive difference the Growth Agent obeys in every draft and
        critique — this is what turns it into an expert CMO, not a generic copy drafter. Empty fields are omitted from
        prompts, so fill what matters; you don&apos;t need all of them.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={generateDraft}
          disabled={drafting}
          className="rounded-lg border border-[#f59f4f]/40 px-4 py-2 text-[13px] font-semibold text-[#f59f4f] hover:bg-[#f59f4f]/10 disabled:opacity-40"
        >
          {drafting ? "Drafting…" : "Generate draft from recent learnings"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[13px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save strategy"}
        </button>
      </div>

      {msg && <p className="mt-3 text-[12px] text-emerald-300">{msg}</p>}
      {error && <p className="mt-3 text-[12px] text-rose-300">{error}</p>}

      <div className="mt-6 space-y-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className={labelCls}>{f.label}</label>
            <textarea
              value={strategy[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.hint}
              rows={3}
              className={inputCls}
            />
            <p className="mt-1 text-[10px] text-[#5f7c98]">{f.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategyPage;