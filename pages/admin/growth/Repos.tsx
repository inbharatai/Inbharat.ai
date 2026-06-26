import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { ShieldAlert } from "lucide-react";

interface Repo {
  productName: string;
  productSlug: string;
  canonicalPrivateRepo: string | null;
  publicRepo: string | null;
  websitePath: string | null;
  sourceOfTruth: string;
  publicRepoStatus: string;
  crawlPrivateRepo: boolean;
  crawlPublicRepo: boolean;
  allowAgentRead: boolean;
  allowAgentPR: boolean;
  notes?: string;
  source: "seed" | "ui";
  editorLocked: boolean;
  lastCommitSha: string | null;
  lastCommitAt: string | null;
  lastPrState: string | null;
  lastCheckedAt: string | null;
}

interface RegistryResp {
  ok: boolean;
  repos?: Repo[];
  note?: string;
  error?: string;
}

const STATUS_OPTS = [
  "canonical_private",
  "public_mirror_current",
  "public_mirror_outdated",
  "public_demo_only",
  "deprecated_public_clone",
  "do_not_use",
];
const SOT_OPTS = ["canonical_private", "do_not_use"];

const STATUS_COLOR: Record<string, string> = {
  canonical_private: "bg-sky-500/15 text-sky-300",
  public_mirror_current: "bg-emerald-500/15 text-emerald-300",
  public_mirror_outdated: "bg-amber-500/15 text-amber-300",
  public_demo_only: "bg-violet-500/15 text-violet-300",
  deprecated_public_clone: "bg-slate-500/15 text-slate-300",
  do_not_use: "bg-rose-500/15 text-rose-300",
};

type Draft = Omit<Repo, "source" | "editorLocked" | "lastCommitSha" | "lastCommitAt" | "lastPrState" | "lastCheckedAt">;

function emptyDraft(): Draft {
  return {
    productName: "",
    productSlug: "",
    canonicalPrivateRepo: null,
    publicRepo: null,
    websitePath: null,
    sourceOfTruth: "canonical_private",
    publicRepoStatus: "public_mirror_current",
    crawlPrivateRepo: true,
    crawlPublicRepo: true,
    allowAgentRead: true,
    allowAgentPR: true,
    notes: undefined,
  };
}

function fromRepo(r: Repo): Draft {
  const { source: _s, editorLocked: _l, lastCommitSha: _a, lastCommitAt: _b, lastPrState: _c, lastCheckedAt: _d, ...rest } = r;
  void _s; void _l; void _a; void _b; void _c; void _d;
  return rest;
}

const inputCls = "w-full rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]";

const Repos: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<Record<string, string> | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<RegistryResp>("/api/growth/registry");
    if (error) setError(error);
    else {
      setRepos(data?.repos || []);
      setNote(data?.note || null);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(r: Repo) {
    setEditing(fromRepo(r));
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
    if (!editing.productName.trim() || !editing.productSlug.trim()) {
      setFormError("Product name and slug are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const body = isNew
      ? { resource: "repo", data: editing }
      : { resource: "repo", key: editing.productSlug, patch: editing };
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

  async function remove(slug: string) {
    if (!confirm(`Delete repo '${slug}'? This cannot be undone.`)) return;
    const { error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/registry", {
      method: "DELETE",
      body: JSON.stringify({ resource: "repo", key: slug }),
    });
    if (error) {
      setError(error);
      return;
    }
    await load();
  }

  async function verify(r: Repo) {
    const repo = r.canonicalPrivateRepo || r.publicRepo;
    if (!repo) {
      setVerifyMsg({ [r.productSlug]: "No repo link to verify." });
      return;
    }
    setVerifying(r.productSlug);
    setVerifyMsg(null);
    const { data, error } = await fetchJson<{ ok: boolean; lastCommitSha?: string; openPrCount?: number; error?: string; denied?: boolean }>(
      "/api/growth/github",
      { method: "POST", body: JSON.stringify({ repo }) },
    );
    setVerifying(null);
    if (error) setVerifyMsg({ [r.productSlug]: error });
    else if (data?.denied) setVerifyMsg({ [r.productSlug]: "Denied by gate." });
    else setVerifyMsg({ [r.productSlug]: `✓ ${data?.lastCommitSha?.slice(0, 7) ?? "?"} · ${data?.openPrCount ?? 0} open PRs` });
    await load();
  }

  if (loading) return <p className="text-[13px] text-[#7a9ab8]">Loading…</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Repository registry</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            Edit repos, links, and website paths here — changes save to the DB live (no redeploy). Grant the agent
            private-repo read access by entering the canonical private repo. The Sahayaak-Seva former-name deny record
            is locked and cannot be edited or deleted.
          </p>
        </div>
        <button
          onClick={openNew}
          className="shrink-0 rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-4 py-2 text-[12.5px] font-semibold text-[#f59f4f] transition-colors hover:bg-[#f59f4f]/20"
        >
          + Add repo
        </button>
      </div>

      {note && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300">{note}</p>
      )}
      {error && <p className="mt-4 text-[13px] text-rose-300">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-[#7a9ab8]">
              <th className="py-2 pr-3 font-semibold">Product</th>
              <th className="py-2 pr-3 font-semibold">Website</th>
              <th className="py-2 pr-3 font-semibold">Public repo</th>
              <th className="py-2 pr-3 font-semibold">Private repo</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Read</th>
              <th className="py-2 pr-3 font-semibold">PR</th>
              <th className="py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((r) => (
              <tr key={r.productSlug} className="border-b border-white/[0.04] align-top">
                <td className="py-3 pr-3">
                  <p className="font-semibold text-white">{r.productName}</p>
                  {r.notes && <p className="mt-0.5 max-w-xs text-[11px] text-[#5f7c98]">{r.notes}</p>}
                  {r.editorLocked && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-rose-300">
                      <ShieldAlert size={11} /> locked
                    </span>
                  )}
                  {r.lastCommitSha && (
                    <p className="mt-1 text-[10px] text-[#5f7c98]">
                      {r.lastCommitSha.slice(0, 7)} · {r.lastPrState} · {r.lastCheckedAt?.slice(0, 10)}
                    </p>
                  )}
                </td>
                <td className="py-3 pr-3 text-[#9fb2c6]">
                  {r.websitePath ? (
                    <a href={r.websitePath} target="_blank" rel="noopener noreferrer" className="text-[#f59f4f] hover:underline">
                      {r.websitePath}
                    </a>
                  ) : (
                    <span className="text-[#5f7c98]">—</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {r.publicRepo ? (
                    <a href={`https://github.com/${r.publicRepo}`} target="_blank" rel="noopener noreferrer" className="text-[#f59f4f] hover:underline">
                      {r.publicRepo}
                    </a>
                  ) : (
                    <span className="text-[#5f7c98]">—</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-[#9fb2c6]">{r.canonicalPrivateRepo || <span className="text-[#5f7c98]">—</span>}</td>
                <td className="py-3 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[r.publicRepoStatus] || "bg-slate-500/15 text-slate-300"}`}>
                    {r.publicRepoStatus}
                  </span>
                </td>
                <td className="py-3 pr-3 text-[#9fb2c6]">{r.allowAgentRead ? "✓" : "✗"}</td>
                <td className="py-3 pr-3 text-[#9fb2c6]">{r.allowAgentPR ? "✓" : "✗"}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={r.editorLocked}
                      onClick={() => openEdit(r)}
                      className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#c0cfe0] hover:border-white/25 disabled:opacity-30"
                    >
                      Edit
                    </button>
                    <button
                      disabled={verifying === r.productSlug || !r.allowAgentRead}
                      onClick={() => verify(r)}
                      className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#c0cfe0] hover:border-white/25 disabled:opacity-30"
                    >
                      {verifying === r.productSlug ? "…" : "Verify"}
                    </button>
                    <button
                      disabled={r.editorLocked || r.publicRepoStatus === "do_not_use"}
                      onClick={() => remove(r.productSlug)}
                      className="rounded-md border border-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </div>
                  {verifyMsg?.[r.productSlug] && (
                    <p className="mt-1 text-[10px] text-[#9fb2c6]">{verifyMsg[r.productSlug]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#070b12] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-white">{isNew ? "Add repo" : `Edit · ${editing.productName}`}</h2>
            {formError && <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">{formError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Product name</label>
                <input className={inputCls} value={editing.productName} onChange={(e) => setEditing({ ...editing, productName: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Slug (key {isNew ? "— set once" : "— not editable"})</label>
                <input
                  className={inputCls}
                  value={editing.productSlug}
                  disabled={!isNew}
                  onChange={(e) => setEditing({ ...editing, productSlug: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Canonical private repo (owner/name) — grants agent private read</label>
                <input
                  className={inputCls}
                  placeholder="inbharatai/my-private-repo"
                  value={editing.canonicalPrivateRepo ?? ""}
                  onChange={(e) => setEditing({ ...editing, canonicalPrivateRepo: e.target.value.trim() || null })}
                />
              </div>
              <div>
                <label className={labelCls}>Public repo (owner/name)</label>
                <input
                  className={inputCls}
                  placeholder="inbharatai/public-mirror"
                  value={editing.publicRepo ?? ""}
                  onChange={(e) => setEditing({ ...editing, publicRepo: e.target.value.trim() || null })}
                />
              </div>
              <div>
                <label className={labelCls}>Website path / URL</label>
                <input
                  className={inputCls}
                  placeholder="https://example.com"
                  value={editing.websitePath ?? ""}
                  onChange={(e) => setEditing({ ...editing, websitePath: e.target.value.trim() || null })}
                />
              </div>
              <div>
                <label className={labelCls}>Source of truth</label>
                <select className={inputCls} value={editing.sourceOfTruth} onChange={(e) => setEditing({ ...editing, sourceOfTruth: e.target.value })}>
                  {SOT_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Public repo status</label>
                <select className={inputCls} value={editing.publicRepoStatus} onChange={(e) => setEditing({ ...editing, publicRepoStatus: e.target.value })}>
                  {STATUS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2 grid grid-cols-4 gap-2">
                {([
                  ["crawlPrivateRepo", "Crawl private"],
                  ["crawlPublicRepo", "Crawl public"],
                  ["allowAgentRead", "Agent read"],
                  ["allowAgentPR", "Agent PR"],
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

export default Repos;