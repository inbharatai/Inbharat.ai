import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";

/**
 * /admin/growth/strategy — founder CMO operating system (Phase D + C expansion).
 * Seven sections: the six base strategy fields, four structured system fields
 * (pillars / per-product plan / cadence / KPIs), a per-product portfolio helper
 * (read from the registry), and a hands-free Auto Mode execution panel (read +
 * toggle from /api/growth/auto, with a deep link to the full controls on the
 * Agent page). All fields are pre-seeded with world-class InBharat CMO content
 * (DEFAULT_STRATEGY in lib/growth/strategy.ts) so the page is never blank.
 */
interface Strategy {
  positioning: string | null;
  icp: string | null;
  audience: string | null;
  voice: string | null;
  competitiveDiff: string | null;
  goals: string | null;
  pillars: string | null;
  productPlan: string | null;
  cadence: string | null;
  kpis: string | null;
}

interface DraftedStrategy extends Strategy {
  note?: string;
}

interface AutoMode {
  enabled: boolean;
  autoApprove: boolean;
  cadenceMinutes: number;
  maxTasksPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string | null;
}

interface Asset {
  domain: string;
  name: string;
  status: string;
}

const BASE_FIELDS: { key: keyof Strategy; label: string; hint: string }[] = [
  { key: "positioning", label: "Positioning", hint: "One-line category claim — what InBharat IS in the market." },
  { key: "icp", label: "ICP (ideal customer profile)", hint: "Who you sell to — titles, companies, stage." },
  { key: "audience", label: "Audience (content readers)", hint: "Who you write for — may differ from buyers." },
  { key: "voice", label: "Voice / tone", hint: "How InBharat sounds — concise, practical, hype-free, etc." },
  { key: "competitiveDiff", label: "Competitive difference", hint: "Why InBharat over alternatives — concrete, not vague." },
  { key: "goals", label: "GTM goals", hint: "Near-term goals the agent's content should serve." },
];

const SYSTEM_FIELDS: { key: keyof Strategy; label: string; hint: string; rows: number }[] = [
  { key: "pillars", label: "Growth pillars", hint: "The 5 pillars (SEO, content, syndication, LinkedIn, covers) the agent works.", rows: 7 },
  { key: "productPlan", label: "Per-product visibility plan", hint: "One line per portfolio product: ICP hook + primary channel.", rows: 8 },
  { key: "cadence", label: "90-day cadence + weekly theme", hint: "Weekly theme rotation + the 90-day plan.", rows: 7 },
  { key: "kpis", label: "KPIs + targets", hint: "The numbers the agent is trying to move.", rows: 6 },
];

const EMPTY: Strategy = {
  positioning: null, icp: null, audience: null, voice: null, competitiveDiff: null, goals: null,
  pillars: null, productPlan: null, cadence: null, kpis: null,
};

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]";

function fmtTime(s: string | null): string {
  if (!s) return "never";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

const StrategyPage: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [strategy, setStrategy] = useState<Strategy>(EMPTY);
  const [auto, setAuto] = useState<AutoMode | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [stratRes, autoRes, regRes] = await Promise.all([
      fetchJson<{ ok: boolean; strategy?: Strategy; error?: string }>("/api/growth/strategy"),
      fetchJson<{ ok: boolean; mode?: AutoMode }>("/api/growth/auto"),
      fetchJson<{ ok: boolean; assets?: Asset[] }>("/api/growth/registry"),
    ]);
    if (stratRes.error) setError(stratRes.error);
    else if (stratRes.data?.strategy) setStrategy({ ...EMPTY, ...stratRes.data.strategy });
    if (autoRes.data?.mode) setAuto(autoRes.data.mode);
    if (regRes.data?.assets) setAssets(regRes.data.assets);
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
      // Pre-fill the six BASE fields with the drafted content. The four structured
      // system fields (pillars/productPlan/cadence/kpis) are NOT overwritten — the
      // model drafts the base fields; the founder authors the system layer by hand.
      setStrategy((s) => ({ ...s, ...data.drafted! }));
      setMsg(data.note ?? "Drafted from recent learnings — review, edit, then Save to apply.");
    } else {
      setMsg(data.note ?? "Nothing drafted yet.");
    }
  }

  async function toggleAuto() {
    if (!auto) return;
    const next = !auto.enabled;
    setTogglingAuto(true);
    const { data, error } = await fetchJson<{ ok: boolean; mode?: AutoMode; error?: string }>("/api/growth/auto", {
      method: "POST",
      body: JSON.stringify({ enabled: next }),
    });
    setTogglingAuto(false);
    if (error || !data?.ok) { setError(error || data?.error || "auto toggle failed"); return; }
    if (data.mode) setAuto(data.mode);
    setMsg(next ? "Auto Mode ON — the cron loop will draft pending work hands-free." : "Auto Mode OFF — the cron loop is paused.");
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading strategy…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">CMO Strategy</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        The positioning, ICP, audience, voice, competitive difference, growth pillars, per-product plan, cadence, and KPIs
        the Growth Agent obeys in every draft and critique — this is what turns it into an expert CMO, not a generic copy
        drafter. Fields come pre-seeded with world-class InBharat strategy; edit what you want, leave the rest. Empty
        fields are omitted from the agent&apos;s prompt, so you don&apos;t need all of them.
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

      {/* ── Section 1: Base strategy ─────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h2 className="text-[15px] font-bold text-white">1 · Base strategy</h2>
        <p className="mt-1 text-[12px] text-[#9fb2c6]">The six fields injected into every draft + critique prompt.</p>
        <div className="mt-4 space-y-4">
          {BASE_FIELDS.map((f) => (
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
      </section>

      {/* ── Section 2: Growth pillars + structured system ───────────────── */}
      <section className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h2 className="text-[15px] font-bold text-white">2 · Growth system</h2>
        <p className="mt-1 text-[12px] text-[#9fb2c6]">The structured layer — pillars, per-product plan, cadence, KPIs. Also injected into the prompt.</p>
        <div className="mt-4 space-y-4">
          {/* Per-product portfolio helper (read-only reference) — shown above the
              productPlan textarea so the founder can see the portfolio at a glance. */}
          {assets.length > 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-[#0a0f18] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Portfolio (read-only — edit in Sites tab)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {assets.map((a) => (
                  <span key={a.domain} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-[#c8d6e8]" title={a.domain}>
                    <b className="text-white">{a.name}</b> <span className="text-[#5f7c98]">{a.domain}</span> <span className={`ml-1 rounded px-1 text-[9px] font-bold uppercase ${a.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{a.status}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {SYSTEM_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <textarea
                value={strategy[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.hint}
                rows={f.rows}
                className={inputCls}
              />
              <p className="mt-1 text-[10px] text-[#5f7c98]">{f.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: Auto Mode hands-free execution panel ───────────────── */}
      <section className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">3 · Auto Mode — hands-free execution</h2>
            <p className="mt-1 max-w-xl text-[12px] text-[#9fb2c6]">
              When ON, the cron loop drafts pending work (LinkedIn captions, covers, articles) hands-free on the cadence
              below — nothing auto-publishes; the founder approves everything. This is the engine that executes the
              strategy above without you babysitting it.
            </p>
          </div>
          <button
            onClick={toggleAuto}
            disabled={!auto || togglingAuto}
            className={`shrink-0 rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40 ${
              auto?.enabled ? "bg-emerald-500/90 text-[#06120c] hover:bg-emerald-400" : "bg-[#f59f4f] text-[#0a0c10] hover:bg-[#f59f4f]/90"
            }`}
          >
            {togglingAuto ? "…" : auto?.enabled ? "Auto Mode is ON (click to pause)" : "Turn Auto Mode ON"}
          </button>
        </div>
        {auto ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Status", val: auto.enabled ? "ON" : "OFF" },
              { label: "Cadence", val: `${auto.cadenceMinutes} min` },
              { label: "Max tasks / run", val: String(auto.maxTasksPerRun) },
              { label: "Last run", val: fmtTime(auto.lastRunAt) },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-white/10 bg-[#0a0f18] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-[#5f7c98]">{s.label}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-white">{s.val}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-[#7a9ab8]">Auto Mode state unavailable (DB not configured).</p>
        )}
        {auto?.lastRunSummary && (
          <p className="mt-2 text-[11px] text-[#9fb2c6]">Last run summary: {auto.lastRunSummary}</p>
        )}
        <p className="mt-2 text-[11px] text-[#5f7c98]">
          Full controls (auto-approve, cadence, max tasks, run-now) live on the{" "}
          <Link to="/admin/growth/agent" className="text-[#f59f4f] hover:underline">Agent tab ↗</Link>.
        </p>
      </section>
    </div>
  );
};

export default StrategyPage;