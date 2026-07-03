import React, { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { Share2, ExternalLink, CheckCircle2, XCircle, Clock, FileEdit, AlertCircle } from "lucide-react";
import { MEDIUM_IMPORT_URL, mediumInstructions } from "../../../lib/growth/syndication/medium.js";
import type { SyndicationPlatform, SyndicationResult, SyndicationStatus } from "../../../lib/growth/syndication/types.js";

/**
 * /admin/growth/syndication — Stage 3 cross-posting surface.
 *
 * Lists every APPROVED/PUBLISHED article draft with per-platform checkboxes
 * (DEV.to, Hashnode, Medium) and a human-gated Syndicate action. Every attempt
 * + its platform URL is recorded in the growth_syndication ledger and shown in
 * the history list. The InBharat canonical URL is sent on each cross-post so
 * Google attributes the original to www.inbharat.ai.
 *
 * Platform behaviour (documented honestly in the confirm step):
 *   - DEV.to    → creates a DRAFT (founder reviews on DEV.to, then flips public)
 *   - Hashnode  → publishes LIVE (Hashnode's API has no draft-with-canonical path)
 *   - Medium    → MANUAL: surfaces the canonical + the import-page URL (API deprecated)
 */

interface EligibleDraft {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  status: string;
  slug: string | null;
}

interface HistoryRow {
  id: string;
  draft_id: string;
  slug: string;
  platform: string;
  status: string;
  canonical_url: string;
  platform_url: string | null;
  platform_post_id: string | null;
  error: string | null;
  created_at: string;
}

interface ListResp {
  ok: boolean;
  history?: HistoryRow[];
  eligible?: EligibleDraft[];
  error?: string;
}

interface SyndicateResp {
  ok: boolean;
  slug?: string;
  title?: string;
  results?: SyndicationResult[];
  error?: string;
}

const PLATFORMS: { key: SyndicationPlatform; label: string; hint: string }[] = [
  { key: "devto", label: "DEV.to", hint: "API draft if DEVTO_API_KEY is set; else run the local command below to open the DEV.to editor pre-filled in your browser" },
  { key: "hashnode", label: "Hashnode", hint: "API publish LIVE if HASHNODE_TOKEN is set; else run the local command below to open the Hashnode editor pre-filled in your browser" },
  { key: "medium", label: "Medium", hint: "Medium API is deprecated — run the local command below to open Medium's importer with the canonical URL pre-filled" },
];

/** The local Playwright populate command for a platform+slug (no API key needed —
 *  opens the platform editor in your browser, pre-filled; you review + publish by
 *  hand. Mirrors scripts/linkedin-populate.ts; see scripts/syndicate-populate.ts.) */
function localCommand(platform: SyndicationPlatform, slug: string): string {
  return `npx tsx scripts/syndicate-populate.ts --platform ${platform} --slug ${slug}`;
}

const STATUS_STYLE: Record<SyndicationStatus, { icon: React.ComponentType<{ size?: number; className?: string }>; cls: string; label: string }> = {
  published: { icon: CheckCircle2, cls: "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20", label: "Live" },
  draft: { icon: FileEdit, cls: "text-sky-300 bg-sky-500/10 ring-1 ring-sky-500/20", label: "Draft" },
  manual: { icon: Clock, cls: "text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20", label: "Manual" },
  failed: { icon: XCircle, cls: "text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/20", label: "Failed" },
  not_configured: { icon: AlertCircle, cls: "text-slate-300 bg-slate-500/10 ring-1 ring-slate-500/20", label: "Not configured" },
};

function StatusBadge({ status }: { status: SyndicationStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.failed;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.cls}`}>
      <Icon size={11} />
      {s.label}
    </span>
  );
}

const Syndication: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [eligible, setEligible] = useState<EligibleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-draft platform selection: draftId → set of platforms the founder ticked.
  const [picks, setPicks] = useState<Record<string, Set<SyndicationPlatform>>>({});
  // Per-draft in-flight syndicate + last result (for inline feedback).
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyndicationResult[]>>({});
  const [confirm, setConfirm] = useState<{ draft: EligibleDraft; platforms: SyndicationPlatform[] } | null>(null);
  // Which local-command "copy" button just fired (key = `${platform}:${slug}`) for inline feedback.
  const [copied, setCopied] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await fetchJson<ListResp>("/api/growth/syndicate");
    if (error || !data) {
      setError(error || "Failed to load");
    } else {
      setHistory(data.history ?? []);
      setEligible(data.eligible ?? []);
    }
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(draftId: string, p: SyndicationPlatform) {
    setPicks((prev) => {
      const set = new Set(prev[draftId] ?? []);
      if (set.has(p)) set.delete(p);
      else set.add(p);
      return { ...prev, [draftId]: set };
    });
  }

  // Copy the local Playwright command to the clipboard (best-effort; the founder
  // pastes it into a terminal at the repo root). This is the no-API-key path.
  async function copyLocal(platform: SyndicationPlatform, slug: string) {
    const cmd = localCommand(platform, slug);
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      /* clipboard may be blocked; the command is still visible to select */
    }
    setCopied(`${platform}:${slug}`);
    const key = `${platform}:${slug}`;
    setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1800);
  }

  async function runSyndicate(draft: EligibleDraft, platforms: SyndicationPlatform[]) {
    setBusy((b) => ({ ...b, [draft.id]: true }));
    setConfirm(null);
    const { data, error } = await fetchJson<SyndicateResp>("/api/growth/syndicate", {
      method: "POST",
      body: JSON.stringify({ draftId: draft.id, platforms }),
    });
    if (error || !data || !data.results) {
      setResults((r) => ({ ...r, [draft.id]: [{ platform: "devto", ok: false, url: null, postId: null, status: "failed", error: error || "syndicate failed", canonicalUrl: "" }] }));
    } else {
      setResults((r) => ({ ...r, [draft.id]: data.results ?? [] }));
      // Refresh history so the new ledger rows show.
      void load();
    }
    setBusy((b) => ({ ...b, [draft.id]: false }));
  }

  const platformLabel = (k: string): string => PLATFORMS.find((p) => p.key === k)?.label ?? k;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2.5">
          <Share2 size={18} className="text-[#f59f4f]" />
          <h1 className="text-[16px] font-semibold tracking-wide text-white">Syndication</h1>
        </div>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[#9fb2c6]">
          Cross-post an approved article to DEV.to / Hashnode / Medium with the InBharat canonical URL set, so Google
          attributes the original to <span className="text-[#c0cfe0]">www.inbharat.ai</span>. Human-gated, per-article,
          no auto-publish. Each attempt is logged below with its platform URL.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{error}</div>
      )}

      {/* Eligible drafts */}
      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">
          Article drafts ({eligible.length})
        </h2>
        {loading ? (
          <p className="text-[12.5px] text-[#7a9ab8]">Loading…</p>
        ) : eligible.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-3 text-[12.5px] text-[#7a9ab8]">
            No approved or published article drafts to syndicate. Approve an article draft in Issues first.
          </p>
        ) : (
          <div className="space-y-2.5">
            {eligible.map((d) => {
              const chosen = picks[d.id] ?? new Set<SyndicationPlatform>();
              const last = results[d.id];
              const isBusy = busy[d.id];
              return (
                <div key={d.id} className="rounded-lg border border-white/10 bg-[#0a0f18] px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-white">{d.title || "(untitled)"}</p>
                      <p className="mt-0.5 text-[11px] text-[#7a9ab8]">
                        <span className="capitalize">{d.status}</span> · {d.slug || "no slug"}
                        {d.url ? <> · <a href={d.url} target="_blank" rel="noreferrer" className="text-[#5f9fb8] hover:underline">inbharat</a></> : null}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (chosen.size === 0) return;
                        setConfirm({ draft: d, platforms: Array.from(chosen) });
                      }}
                      disabled={chosen.size === 0 || isBusy}
                      className="rounded-lg bg-[#f59f4f] px-3 py-1.5 text-[12px] font-semibold text-[#0a0f18] transition-colors hover:bg-[#f59f4f]/90 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#5f7c98]"
                    >
                      {isBusy ? "Syndicating…" : `Syndicate${chosen.size ? ` (${chosen.size})` : ""}`}
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {PLATFORMS.map((p) => {
                      const on = chosen.has(p.key);
                      return (
                        <button
                          key={p.key}
                          onClick={() => toggle(d.id, p.key)}
                          title={p.hint}
                          className={[
                            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                            on
                              ? "bg-[#f59f4f]/15 text-[#f59f4f] ring-1 ring-[#f59f4f]/40"
                              : "bg-white/[0.04] text-[#9fb2c6] ring-1 ring-white/10 hover:bg-white/[0.08]",
                          ].join(" ")}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Local Playwright path — no API key needed. Opens the platform editor in
                      the founder's browser pre-filled with title + body + tags + canonical;
                      the founder reviews + clicks Publish themselves. Mirrors the LinkedIn
                      populate script. Shown when the draft has a slug. */}
                  {d.slug && (
                    <div className="mt-2.5 rounded-lg border border-white/10 bg-[#030508]/60 px-3 py-2">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#7a9ab8]">
                        Open in browser (local Playwright · no API key)
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-[#7a9ab8]">
                        Run one of these at the repo root. A Chromium window opens with the editor pre-filled — review it, then click Publish yourself. The body is also copied to the clipboard.
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {PLATFORMS.map((p) => {
                          const cmd = localCommand(p.key, d.slug!);
                          const justCopied = copied === `${p.key}:${d.slug}`;
                          return (
                            <div key={p.key} className="flex items-center gap-2">
                              <span className="w-16 shrink-0 text-[10.5px] text-[#7a9ab8]">{p.label}</span>
                              <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] text-[#c0cfe0]">{cmd}</code>
                              <button
                                onClick={() => void copyLocal(p.key, d.slug!)}
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${justCopied ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-[#9fb2c6] hover:bg-white/[0.1]"}`}
                              >
                                {justCopied ? "copied" : "copy"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {last && (
                    <div className="mt-2.5 space-y-1.5 rounded-lg border border-white/10 bg-[#030508]/60 px-3 py-2">
                      {last.map((r) => (
                        <div key={r.platform} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                          <span className="w-16 text-[#7a9ab8]">{platformLabel(r.platform)}</span>
                          <StatusBadge status={r.status} />
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#5f9fb8] hover:underline">
                              open <ExternalLink size={11} />
                            </a>
                          ) : null}
                          {r.platform === "medium" && r.status === "manual" ? (
                            <span className="text-[#7a9ab8]">
                              copy <code className="text-[#c0cfe0]">{r.canonicalUrl}</code> ·{" "}
                              <a href={MEDIUM_IMPORT_URL} target="_blank" rel="noreferrer" className="text-[#5f9fb8] hover:underline">open importer</a>
                            </span>
                          ) : null}
                          {r.error ? <span className="text-rose-300/90">{r.error}</span> : null}
                        </div>
                      ))}
                      {last.find((r) => r.platform === "medium" && r.status === "manual") ? (
                        <pre className="whitespace-pre-wrap rounded bg-black/40 px-2 py-1.5 text-[10.5px] leading-relaxed text-[#9fb2c6]">{mediumInstructions(last.find((r) => r.platform === "medium")!.canonicalUrl)}</pre>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7a9ab8]">
          History ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-3 text-[12.5px] text-[#7a9ab8]">
            No syndication attempts yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0a0f18]">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10.5px] uppercase tracking-wide text-[#7a9ab8]">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Slug</th>
                  <th className="px-3 py-2 font-semibold">Platform</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">URL</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-white/[0.06]">
                    <td className="px-3 py-2 text-[#7a9ab8]">{new Date(h.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-[#c0cfe0]">{h.slug}</td>
                    <td className="px-3 py-2 text-[#c0cfe0]">{platformLabel(h.platform)}</td>
                    <td className="px-3 py-2"><StatusBadge status={h.status as SyndicationStatus} /></td>
                    <td className="px-3 py-2">
                      {h.platform_url ? (
                        <a href={h.platform_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#5f9fb8] hover:underline">
                          open <ExternalLink size={11} />
                        </a>
                      ) : h.error ? (
                        <span className="text-rose-300/80" title={h.error}>error</span>
                      ) : (
                        <span className="text-[#5f7c98]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0f18] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-white">Confirm syndication</h3>
            <p className="mt-1 text-[12px] text-[#9fb2c6]">
              Cross-post <span className="text-[#c0cfe0]">{confirm.draft.title || confirm.draft.slug}</span> to:
            </p>
            <ul className="mt-2 space-y-1 text-[12px]">
              {confirm.platforms.map((p) => {
                const meta = PLATFORMS.find((x) => x.key === p)!;
                return (
                  <li key={p} className="flex gap-2 text-[#c0cfe0]">
                    <span className="text-[#f59f4f]">▪</span>
                    <span><span className="font-medium">{meta.label}</span> — {meta.hint}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
              Hashnode publishes live immediately. DEV.to creates a draft for your review. The InBharat canonical URL is
              set on each so the original is attributed to inbharat.ai.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-[#9fb2c6] hover:bg-white/[0.04]">Cancel</button>
              <button
                onClick={() => void runSyndicate(confirm.draft, confirm.platforms)}
                className="rounded-lg bg-[#f59f4f] px-3 py-1.5 text-[12px] font-semibold text-[#0a0f18] hover:bg-[#f59f4f]/90"
              >
                Syndicate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Syndication;