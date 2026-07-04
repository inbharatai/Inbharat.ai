import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { ShieldAlert } from "lucide-react";

/**
 * /admin/growth/sites — authorized-sites registry. The founder can now add,
 * edit, and remove sites here (mirroring the Repos tab), in addition to the
 * existing Run audit / Run discovery actions. CRUD is backed by
 * /api/growth/registry with resource:"asset" (server hard-guards enforce:
 * canPublishDirectly is never true, requiresHumanApproval is never false,
 * editor_locked rows can't be mutated).
 *
 * Data source is the registry GET (admin view: source + editorLocked + full
 * flags), not the redacted /status GET used by Overview/Issues.
 */
interface Asset {
  domain: string;
  name: string;
  status: string;
  canCrawl: boolean;
  canAudit: boolean;
  canDraft: boolean;
  canCreatePR: boolean;
  canPublishDirectly: boolean;
  requiresHumanApproval: boolean;
  notes?: string;
  source: "seed" | "ui";
  editorLocked: boolean;
}

interface RegistryResp {
  ok: boolean;
  assets?: Asset[];
  repos?: unknown[];
  note?: string;
  error?: string;
}

const STATUS_OPTS = ["active", "planned"] as const;
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-amber-500/15 text-amber-300",
};

/** Editable fields. Domain is the key (not editable after create, like repo slug).
 *  canPublishDirectly + requiresHumanApproval are server-hard-guarded and NOT
 *  in the draft — they render as fixed read-only lines. */
type Draft = Omit<Asset, "source" | "editorLocked" | "canPublishDirectly" | "requiresHumanApproval">;

function emptyDraft(): Draft {
  return {
    domain: "",
    name: "",
    status: "active",
    canCrawl: true,
    canAudit: true,
    canDraft: true,
    canCreatePR: true,
    notes: undefined,
  };
}

function fromAsset(a: Asset): Draft {
  const { source: _s, editorLocked: _l, canPublishDirectly: _p, requiresHumanApproval: _r, ...rest } = a;
  void _s; void _l; void _p; void _r;
  return rest;
}

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]";

const Sites: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Audit + discovery per-domain action state (kept from the prior read-only page).
  const [busy, setBusy] = useState<string | null>(null);
  const [auditMsg, setAuditMsg] = useState<Record<string, string>>({});
  const [discovery, setDiscovery] = useState<Record<string, { discovered: number; new: number; changed: number; orphaned: number }>>({});
  const [discoveryMsg, setDiscoveryMsg] = useState<Record<string, string>>({});
  const [discoveryBusy, setDiscoveryBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<RegistryResp>("/api/growth/registry");
    if (error) setError(error);
    else {
      setAssets(data?.assets || []);
      setNote(data?.note || null);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(a: Asset) {
    setEditing(fromAsset(a));
    setIsNew(false);
    setFormError(null);
  }
  function openNew() {
    setEditing(emptyDraft());
    setIsNew(true);
    setFormError(null);
  }

  async function save() {
    if (!editing) return;
    if (!editing.domain.trim() || !editing.name.trim()) {
      setFormError("Domain and name are required.");
      return;
    }
    // Normalize the domain to a bare host (strip scheme / path / www) so the
    // unique key stays stable across edits.
    const normalized = editing.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const draft = { ...editing, domain: normalized };
    setSaving(true);
    setFormError(null);
    const body = isNew
      ? { resource: "asset", data: draft }
      : { resource: "asset", key: editing.domain, patch: draft };
    const { error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/registry", {
      method: isNew ? "POST" : "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (error) {
      setFormError(error);
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(domain: string) {
    if (!confirm(`Delete site '${domain}'? It will no longer be crawlable/auditable by the agent. This cannot be undone.`)) return;
    const { error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/registry", {
      method: "DELETE",
      body: JSON.stringify({ resource: "asset", key: domain }),
    });
    if (error) {
      setError(error);
      return;
    }
    await load();
  }

  async function runAudit(domain: string) {
    setBusy(domain);
    setAuditMsg((m) => ({ ...m, [domain]: "Auditing…" }));
    const { data, error } = await fetchJson<{ run?: { pagesCount?: number; avgSeoScore?: number; avgGeoScore?: number } }>(
      "/api/growth/audit",
      { method: "POST", body: JSON.stringify({ domain }) },
    );
    const run = data?.run;
    setAuditMsg((m) => ({
      ...m,
      [domain]: error
        ? `Failed: ${error}`
        : `Done — ${run?.pagesCount ?? 0} pages · avg SEO ${run?.avgSeoScore ?? "—"} · avg GEO ${run?.avgGeoScore ?? "—"}`,
    }));
    setBusy(null);
  }

  async function runDiscovery(domain: string) {
    setDiscoveryBusy(domain);
    setDiscoveryMsg((m) => ({ ...m, [domain]: "Discovering…" }));
    const { data, error } = await fetchJson<{
      discovered?: string[];
      new?: string[];
      changed?: { url: string; field: string; before: unknown; after: unknown }[];
      orphaned?: { url: string; reason: string }[];
    }>("/api/growth/discovery", { method: "POST", body: JSON.stringify({ domain }) });
    if (error) {
      setDiscoveryMsg((m) => ({ ...m, [domain]: `Failed: ${error}` }));
    } else {
      const d = {
        discovered: data?.discovered?.length ?? 0,
        new: data?.new?.length ?? 0,
        changed: data?.changed?.length ?? 0,
        orphaned: data?.orphaned?.length ?? 0,
      };
      setDiscovery((s) => ({ ...s, [domain]: d }));
      setDiscoveryMsg((m) => ({
        ...m,
        [domain]: `Done — ${d.new} new · ${d.changed} changed · ${d.orphaned} orphaned (of ${d.discovered} in sitemap)`,
      }));
    }
    setDiscoveryBusy(null);
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;
  if (error && assets.length === 0) return <p className="text-[13px] text-rose-300">Failed to load: {error}</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Authorized sites</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            Only these domains may be crawled and audited. Add or remove sites here — changes save to the DB live (no
            redeploy). Publishing is never automatic; every site always requires human approval (server-enforced).
          </p>
        </div>
        <button
          onClick={openNew}
          className="shrink-0 rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-4 py-2 text-[12.5px] font-semibold text-[#f59f4f] transition-colors hover:bg-[#f59f4f]/20"
        >
          + Add site
        </button>
      </div>

      {note && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300">{note}</p>
      )}
      {error && <p className="mt-4 text-[13px] text-rose-300">{error}</p>}

      <div className="mt-6 space-y-3">
        {assets.map((a) => (
          <div key={a.domain} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold text-white">{a.name}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_COLOR[a.status] || "bg-slate-500/15 text-slate-300"}`}>
                    {a.status}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#7a9ab8]">{a.source}</span>
                  {a.editorLocked && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-rose-300">
                      <ShieldAlert size={11} /> locked
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#7a9ab8]">{a.domain}</p>
                <p className="mt-2 text-[11px] text-[#5f7c98]">
                  crawl:{a.canCrawl ? "✓" : "✗"} · audit:{a.canAudit ? "✓" : "✗"} · draft:{a.canDraft ? "✓" : "✗"} · PR:{a.canCreatePR ? "✓" : "✗"} · human-approve:{a.requiresHumanApproval ? "✓" : "✗"}
                </p>
                <p className="mt-1 text-[10px] text-[#5f7c98]">Publish: never auto · Human approval: always required (server-enforced, not editable)</p>
                {a.notes && <p className="mt-1.5 max-w-xl text-[11px] text-[#7a9ab8]">{a.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    disabled={a.editorLocked}
                    onClick={() => openEdit(a)}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#c0cfe0] hover:border-white/25 disabled:opacity-30"
                  >
                    Edit
                  </button>
                  <button
                    disabled={a.editorLocked}
                    onClick={() => remove(a.domain)}
                    className="rounded-md border border-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => runAudit(a.domain)}
                    disabled={!a.canAudit || busy === a.domain}
                    className="rounded-lg bg-[#f59f4f] px-3 py-1.5 text-[11px] font-semibold text-[#0a0c10] transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === a.domain ? "Running…" : "Run audit"}
                  </button>
                  <button
                    onClick={() => runDiscovery(a.domain)}
                    disabled={!a.canCrawl || discoveryBusy === a.domain}
                    className="rounded-md border border-[#f59f4f]/40 px-3 py-1.5 text-[11px] font-semibold text-[#f59f4f] transition-colors hover:bg-[#f59f4f]/10 disabled:opacity-40"
                  >
                    {discoveryBusy === a.domain ? "Running…" : "Run discovery"}
                  </button>
                </div>
              </div>
            </div>
            {auditMsg[a.domain] && (
              <p className="mt-3 text-[12px] text-[#9fb2c6]">{auditMsg[a.domain]}</p>
            )}

            {/* Full-site discovery panel */}
            <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Full-site discovery</p>
                  <p className="text-[11px] text-[#5f7c98]">Sitemap-driven: finds new, changed, and orphaned pages vs. last audit.</p>
                </div>
              </div>
              {discovery[a.domain] && (
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "in sitemap", val: discovery[a.domain].discovered, cls: "text-white" },
                    { label: "new", val: discovery[a.domain].new, cls: "text-emerald-300" },
                    { label: "changed", val: discovery[a.domain].changed, cls: "text-amber-300" },
                    { label: "orphaned", val: discovery[a.domain].orphaned, cls: "text-rose-300" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md border border-white/10 bg-[#0a0f18] py-1.5">
                      <p className={`text-[15px] font-bold ${s.cls}`}>{s.val}</p>
                      <p className="text-[9px] uppercase tracking-wide text-[#5f7c98]">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {discoveryMsg[a.domain] && (
                <p className="mt-2 text-[11px] text-[#9fb2c6]">{discoveryMsg[a.domain]}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#070b12] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-white">{isNew ? "Add site" : `Edit · ${editing.name}`}</h2>
            {formError && <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">{formError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Domain (key {isNew ? "— set once" : "— not editable"})</label>
                <input
                  className={inputCls}
                  placeholder="example.com"
                  value={editing.domain}
                  disabled={!isNew}
                  onChange={(e) => setEditing({ ...editing, domain: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {STATUS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2 grid grid-cols-4 gap-2">
                {([
                  ["canCrawl", "Crawl"],
                  ["canAudit", "Audit"],
                  ["canDraft", "Draft"],
                  ["canCreatePR", "Create PR"],
                ] as const).map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-[12px] text-[#c0cfe0]">
                    <input type="checkbox" checked={editing[k] as boolean} onChange={(e) => setEditing({ ...editing, [k]: e.target.checked })} />
                    {lbl}
                  </label>
                ))}
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notes</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value.trim() || undefined })}
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#5f7c98]">Publish is never automatic and human approval is always required — these are server-enforced and not editable here.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-4 py-2 text-[12.5px] text-[#c0cfe0] hover:border-white/25">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[12.5px] font-semibold text-black transition-colors hover:bg-[#f59f4f]/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sites;