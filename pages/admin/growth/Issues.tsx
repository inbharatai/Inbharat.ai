import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface Issue {
  severity: "critical" | "high" | "normal" | "low";
  field: string;
  message: string;
  recommendedFix: string;
}

interface GrowthPageRow {
  url: string;
  domain: string;
  http_status: number | null;
  title: string | null;
  seo_score: number;
  geo_score: number;
  issues: Issue[];
  crawled_at: string;
}

interface DraftRow {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  body_md: string | null;
  // LinkedIn drafts carry internalLinks/note; cover drafts carry the PNG base64
  // + filename/prompt/model for the preview + publish step.
  schema_json: {
    internalLinks?: string[];
    note?: string | null;
    pngBase64?: string;
    mimeType?: string;
    filename?: string;
    prompt?: string;
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  created_at: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300",
  high: "bg-orange-500/15 text-orange-300",
  normal: "bg-amber-500/15 text-amber-300",
  low: "bg-sky-500/15 text-sky-300",
};

const ARTICLE_PREFIX = "/learn-ai-with-reeturaj/";

/** Render an error value as a readable string — the backend sometimes returns
 *  `error` as an object (or a Zod issue array), which `${err}` turns into
 *  "[object Object]". Strings pass through; objects/arrays are JSON-stringified. */
function strError(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Per-kind badge (label + tailwind classes) for the draft cards. The old code
 *  collapsed every non-cover/non-article/non-video-script kind to "linkedin",
 *  so inbox-outline + media-candidate drafts were mislabeled as LinkedIn drafts
 *  and given a "Publish to LinkedIn" button that can't succeed (they have no
 *  share URL). Map each kind to an honest label + a distinct, muted color for the
 *  kinds that have no publish target. */
function kindBadge(kind: string): { label: string; cls: string } {
  switch (kind) {
    case 'cover':
      return { label: 'cover', cls: 'bg-[#f59f4f]/20 text-[#f6bf84]' };
    case 'article':
    case 'video-script':
      return { label: kind, cls: 'bg-violet-500/15 text-violet-300' };
    case 'inbox-outline':
      return { label: 'inbox', cls: 'bg-slate-500/15 text-slate-300' };
    case 'media-candidate':
      return { label: 'media', cls: 'bg-slate-500/15 text-slate-300' };
    default:
      return { label: 'linkedin', cls: 'bg-sky-500/15 text-sky-300' };
  }
}

const Issues: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [pages, setPages] = useState<GrowthPageRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);
  const [promotingUrl, setPromotingUrl] = useState<string | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<"personal" | "company">("personal");
  const [companyId, setCompanyId] = useState("");
  // Per-draft publish outcome so the founder completes the LinkedIn post from a
  // REAL click gesture (Open LinkedIn ↗) instead of a popup the browser may block
  // after the await — the old "blank tab opens and closes" symptom. Cleared per
  // action; only one draft's result/error shows at a time.
  const [publishResult, setPublishResult] = useState<{ draftId: string; shareUrl: string; caption: string } | null>(null);
  const [publishError, setPublishError] = useState<{ draftId: string; reason: string } | null>(null);
  // Inline SUCCESS notice for article/cover/video-script publish, pinned to the
  // draft card so the founder sees feedback right next to the button they clicked.
  // LinkedIn has its own share-URL UI (publishResult) below; these kinds just need
  // a confirmation line. Together with publishError this fixes "I click Publish
  // article → site and nothing happens" — the old code wrote the error/success to
  // draftMsg at the TOP of the page, far from the button, so it was invisible.
  const [publishOk, setPublishOk] = useState<{ draftId: string; message: string } | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  /** Open the LinkedIn share URL from a fresh user gesture (button click), so the
   *  popup is never blocked. Falls back to a same-tab navigation if blocked. */
  function openShare(shareUrl: string) {
    const w = window.open(shareUrl, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = shareUrl;
  }

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<{ pages?: GrowthPageRow[] }>("/api/growth/pages");
    if (error) setError(error);
    else setPages(data?.pages || []);
    setLoading(false);
  }

  async function loadDrafts() {
    const { data } = await fetchJson<{ drafts?: DraftRow[] }>("/api/growth/approvals");
    setDrafts(data?.drafts || []);
  }

  useEffect(() => {
    load();
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function auditUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAuditing(true);
    setAuditMsg(null);
    const { data, error } = await fetchJson<{ page?: { seoScore?: number; geoScore?: number } }>("/api/growth/crawl", {
      method: "POST",
      body: JSON.stringify({ url: url.trim() }),
    });
    setAuditMsg(
      error
        ? `Failed: ${error}`
        : `Audited ${url.trim()} — SEO ${data?.page?.seoScore ?? "?"} · GEO ${data?.page?.geoScore ?? "?"}`,
    );
    setAuditing(false);
    if (!error) await load();
  }

  async function promote(page: GrowthPageRow) {
    setPromotingUrl(page.url);
    setDraftMsg(null);
    const { data, error } = await fetchJson<{ draft?: { status?: string } }>("/api/growth/promote", {
      method: "POST",
      body: JSON.stringify({ url: page.url, title: page.title || undefined, description: undefined }),
    });
    setDraftMsg(
      error
        ? `Promote failed: ${error}`
        : data?.draft?.status === "skipped"
          ? `Already has a pending draft for ${page.url}.`
          : `Drafted LinkedIn caption for ${page.url}.`,
    );
    setPromotingUrl(null);
    if (!error) await loadDrafts();
  }

  async function decideDraft(draftId: string, decision: "approved" | "rejected") {
    const { error } = await fetchJson("/api/growth/approvals", {
      method: "POST",
      body: JSON.stringify({ draftId, decision }),
    });
    if (error) setDraftMsg(`Decision failed: ${error}`);
    else await loadDrafts();
  }

  const pendingDrafts = drafts.filter((d) => d.status === "pending");
  const approvedDrafts = drafts.filter((d) => d.status === "approved");
  // The Personal/Company toggle + companyId field only apply to LinkedIn drafts;
  // hide them when only cover drafts are awaiting publish.
  const approvedLinkedinDrafts = approvedDrafts.filter((d) => d.kind !== "cover");

  async function publishDraft(d: DraftRow) {
    if (publishMode === "company" && !companyId.trim()) {
      setDraftMsg("Enter a LinkedIn company ID for company mode.");
      return;
    }
    // NOTE: we do NOT open a popup here. The old flow opened `about:blank`
    // synchronously, awaited the backend, then redirected the popup on success or
    // closed it on failure — which is exactly why "a blank tab opens and closes
    // and nothing happens": any backend non-ok (or a popup-blocked post-await
    // redirect) left the founder staring at a blank tab. Now we just fetch; on
    // success we surface the share URL + caption INLINE and the founder clicks
    // "Open LinkedIn ↗" from a REAL user gesture (never blocked); on failure we
    // show a prominent inline error banner with the real backend reason.
    setPublishingId(d.id);
    setDraftMsg(null);
    setPublishError(null);
    setPublishResult(null);
    setPublishOk(null);
    const { data, error } = await fetchJson<{ ok: boolean; shareUrl?: string; summary?: string; title?: string; error?: string; code?: string }>("/api/growth/publish", {
      method: "POST",
      body: JSON.stringify({ draftId: d.id, mode: publishMode, companyId: publishMode === "company" ? companyId.trim() : undefined }),
    });
    setPublishingId(null);
    if (error || !data?.ok || !data.shareUrl) {
      // Surface the REAL backend reason. The old code printed only the fetch-level
      // `error` (or "no share URL"), so a backend `error` object rendered as
      // "[object Object]" and the founder couldn't see why publish failed. Read
      // both the fetch error and the body's `error`/`code`, stringify objects
      // safely, and pin it to THIS draft so the banner shows next to it.
      const reason = strError(error) || strError(data?.error) || data?.code || "no share URL returned";
      setPublishError({ draftId: d.id, reason });
      setDraftMsg(`Publish failed: ${reason}`);
      return;
    }
    const caption = data.summary || d.body_md || d.title || "";
    // Copy the approved caption to the clipboard now (best-effort) and surface the
    // share URL inline so the founder can open LinkedIn from a real click gesture.
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      // clipboard may be blocked; the caption is shown inline to copy manually
    }
    setPublishResult({ draftId: d.id, shareUrl: data.shareUrl, caption });
    setDraftMsg("Ready — click “Open LinkedIn ↗” and the composer opens with the caption + link pre-filled. Review and click Post. (Caption also copied to clipboard as backup.)");
    await loadDrafts();
  }

  async function regenerateCover(d: DraftRow) {
    if (!confirm("Regenerate this cover? It will create a fresh pending draft (the current one stays until you reject it).")) return;
    setRegeneratingId(d.id);
    setDraftMsg(null);
    const { data, error } = await fetchJson<{ ok: boolean; draftId?: string; note?: string; error?: string; code?: string }>("/api/growth/cover/regenerate", {
      method: "POST",
      body: JSON.stringify({ draftId: d.id }),
    });
    setRegeneratingId(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "regenerate failed";
      setDraftMsg(`Regenerate failed: ${reason}`);
      return;
    }
    setDraftMsg(data.draftId ? "Cover regenerated — a fresh pending draft is in the review queue." : `No new draft: ${data.note || "nothing to regenerate"}`);
    await loadDrafts();
  }

  async function publishCover(d: DraftRow) {
    setPublishingId(d.id);
    setDraftMsg(null);
    setPublishError(null);
    setPublishOk(null);
    const { data, error } = await fetchJson<{
      ok: boolean;
      kind?: string;
      filename?: string;
      fileUrl?: string;
      pngCommitSha?: string;
      metaCommitSha?: string;
      error?: string;
      code?: string;
    }>("/api/growth/publish", {
      method: "POST",
      body: JSON.stringify({ draftId: d.id, mode: "cover" }),
    });
    setPublishingId(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "commit failed";
      setPublishError({ draftId: d.id, reason });
      setDraftMsg(`Cover publish failed: ${reason}`);
      return;
    }
    const msg =
      `Cover published — ${data.filename} committed to GitHub (png ${data.pngCommitSha?.slice(0, 7) ?? "?"}${
        data.metaCommitSha ? `, meta ${data.metaCommitSha.slice(0, 7)}` : ""
      }). Vercel will auto-rebuild; the article hero + OG tag will pick it up.`;
    setPublishOk({ draftId: d.id, message: msg });
    setDraftMsg(msg);
    await loadDrafts();
  }

  async function publishArticle(d: DraftRow) {
    setPublishingId(d.id);
    setDraftMsg(null);
    setPublishError(null);
    setPublishOk(null);
    const { data, error } = await fetchJson<{
      ok: boolean; kind?: string; slug?: string; fileUrl?: string;
      mdCommitSha?: string; metaCommitSha?: string; error?: string; code?: string;
    }>("/api/growth/publish", { method: "POST", body: JSON.stringify({ draftId: d.id, mode: "article" }) });
    setPublishingId(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "commit failed";
      // Pin the error to THIS card (inline banner) AND echo at top — the old code
      // only set draftMsg at the top, far from the button → "nothing happens".
      setPublishError({ draftId: d.id, reason });
      setDraftMsg(`Article publish failed: ${reason}`);
      return;
    }
    const msg =
      `Article published — ${data.slug} committed to GitHub (md ${data.mdCommitSha?.slice(0, 7) ?? "?"}${
        data.metaCommitSha ? `, meta ${data.metaCommitSha.slice(0, 7)}` : ""
      }). Vercel will auto-rebuild; it goes live at ${data.fileUrl ?? "the hub"}.`;
    setPublishOk({ draftId: d.id, message: msg });
    setDraftMsg(msg);
    await loadDrafts();
  }

  async function publishVideoScript(d: DraftRow) {
    setPublishingId(d.id);
    setDraftMsg(null);
    setPublishError(null);
    setPublishOk(null);
    const { data, error } = await fetchJson<{ ok: boolean; slug?: string; mdCommitSha?: string; error?: string; code?: string }>(
      "/api/growth/publish", { method: "POST", body: JSON.stringify({ draftId: d.id, mode: "video-script" }) },
    );
    setPublishingId(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "commit failed";
      setPublishError({ draftId: d.id, reason });
      setDraftMsg(`Video script publish failed: ${reason}`);
      return;
    }
    const msg = `Video script published — ${data.slug} committed to GitHub (sha ${data.mdCommitSha?.slice(0, 7) ?? "?"}). It's a reference artifact in the repo (no site wiring).`;
    setPublishOk({ draftId: d.id, message: msg });
    setDraftMsg(msg);
    await loadDrafts();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Issues</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Latest audited pages with SEO + GEO scores and prioritized recommendations.
      </p>

      <form onSubmit={auditUrl} className="mt-5 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://inbharat.ai/"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={auditing}
          className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[13px] font-semibold text-[#0a0c10] disabled:opacity-40"
        >
          {auditing ? "Auditing…" : "Audit URL"}
        </button>
      </form>
      {auditMsg && <p className="mt-2 text-[12px] text-[#9fb2c6]">{auditMsg}</p>}
      {draftMsg && <p className="mt-2 text-[12px] text-[#9fb2c6]">{draftMsg}</p>}

      {pendingDrafts.length > 0 && (
        <section className="mt-6 rounded-xl border border-[#f59f4f]/25 bg-[#f59f4f]/[0.05] p-4">
          <h2 className="text-[15px] font-bold text-white">
            Drafts awaiting review ({pendingDrafts.length})
          </h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            Human-gated drafts generated by the Growth Agent — LinkedIn captions and on-brand article
            cover images. Approving marks the draft ready to publish; you still publish it yourself.
            Nothing auto-publishes.
          </p>
          <div className="mt-3 space-y-3">
            {pendingDrafts.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{d.title || d.url || d.id}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>
                    {kindBadge(d.kind).label}
                  </span>
                </div>
                {d.kind === "cover" ? (
                  <CoverPreview d={d} />
                ) : (
                  <>
                    {d.body_md ? (
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#c8d6e8]">{d.body_md}</p>
                    ) : (
                      <p className="mt-2 text-[12px] italic text-[#7a9ab8]">
                        No caption generated ({d.schema_json?.note || "model unavailable"}). Write one manually before approving.
                      </p>
                    )}
                    {d.schema_json?.internalLinks && d.schema_json.internalLinks.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {d.schema_json.internalLinks.map((l) => (
                          <li key={l} className="truncate text-[11px] text-[#7ab9e6]">
                            ↳ {l}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decideDraft(d.id, "approved")}
                    className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-[11px] font-semibold text-[#06120c] hover:bg-emerald-400"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decideDraft(d.id, "rejected")}
                    className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {approvedDrafts.length > 0 && (
        <section className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
          <h2 className="text-[15px] font-bold text-white">Approved — ready to publish ({approvedDrafts.length})</h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            One-click publish (human-gated). LinkedIn: copies the caption to your clipboard and opens the official
            share page prefilled with the article URL — you post it yourself. Cover: commits the PNG + wires the
            article `visual` field to GitHub (Vercel auto-rebuilds). Nothing auto-publishes.
          </p>
          {approvedLinkedinDrafts.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-white/10 p-0.5">
                <button
                  onClick={() => setPublishMode("personal")}
                  className={`rounded-md px-3 py-1 text-[11px] font-semibold ${publishMode === "personal" ? "bg-[#f59f4f] text-black" : "text-[#c8d6e8]"}`}
                >
                  Personal
                </button>
                <button
                  onClick={() => setPublishMode("company")}
                  className={`rounded-md px-3 py-1 text-[11px] font-semibold ${publishMode === "company" ? "bg-[#f59f4f] text-black" : "text-[#c8d6e8]"}`}
                >
                  Company
                </button>
              </div>
              {publishMode === "company" && (
                <input
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  placeholder="LinkedIn company ID (e.g. 12345)"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-1.5 text-[12px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
                />
              )}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {approvedDrafts.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{d.title || d.url || d.id}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>
                    {kindBadge(d.kind).label}
                  </span>
                </div>
                {d.kind === "cover" ? (
                  <CoverPreview d={d} />
                ) : d.kind === "article" || d.kind === "video-script" ? (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-white/5 bg-white/[0.02] p-2.5">
                    {d.body_md && <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-[#c8d6e8]">{d.body_md}</pre>}
                    {d.kind === "article" && d.schema_json?.slug && (
                      <p className="mt-2 text-[10px] text-[#5f7c98]">slug: {d.schema_json.slug} · {d.schema_json?.category ?? ""} · ~{d.schema_json?.readMinutes ?? "?"} min read</p>
                    )}
                  </div>
                ) : (
                  <>
                    {d.body_md && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#c8d6e8]">{d.body_md}</p>}
                    {d.schema_json?.internalLinks && d.schema_json.internalLinks.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {d.schema_json.internalLinks.map((l) => (
                          <li key={l} className="truncate text-[11px] text-[#7ab9e6]">↳ {l}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {/* Inline publish result — LinkedIn share URL + caption, opened from a
                    REAL click gesture so the popup is never blocked (fixes "blank tab
                    opens and closes"). The caption was already copied to clipboard. */}
                {publishResult?.draftId === d.id && (
                  <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-2.5">
                    <p className="text-[11px] font-semibold text-emerald-300">✓ Ready to post — the composer opens with caption + link pre-filled.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => openShare(publishResult.shareUrl)}
                        className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0a66c2]/90"
                      >
                        Open LinkedIn ↗
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(publishResult.caption).then(() => setDraftMsg("Caption copied to clipboard."))}
                        className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30"
                      >
                        Copy caption
                      </button>
                      <button
                        onClick={() => setPublishResult(null)}
                        className="rounded-md border border-white/10 px-3 py-1.5 text-[11px] text-[#7a9ab8] hover:border-white/25"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {/* Inline SUCCESS banner for article/cover/video-script publish —
                    pinned to this card so the founder sees the confirmation ( +
                    commit shas + live URL) right next to the button they clicked. */}
                {publishOk?.draftId === d.id && (
                  <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-2.5">
                    <p className="text-[11px] font-semibold text-emerald-300">✓ {publishOk.message}</p>
                    <button onClick={() => setPublishOk(null)} className="mt-1.5 text-[10px] text-[#7a9ab8] hover:text-[#c8d6e8]">Dismiss</button>
                  </div>
                )}
                {/* Prominent inline error banner — the real backend reason, pinned to
                    this draft so the founder sees WHY publish failed (old flow just
                    closed the popup → "nothing happens"). */}
                {publishError?.draftId === d.id && (
                  <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/[0.08] p-2.5">
                    <p className="text-[11px] font-semibold text-red-300">✗ Publish failed: {publishError.reason}</p>
                    <p className="mt-1 text-[10px] text-[#9fb2c6]">
                      The draft was not marked published. Check the reason above, fix it (e.g. a company ID), and retry.
                    </p>
                    <button onClick={() => setPublishError(null)} className="mt-1.5 text-[10px] text-[#7a9ab8] hover:text-[#c8d6e8]">Dismiss</button>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {d.kind === "cover" ? (
                    <>
                      <button
                        onClick={() => publishCover(d)}
                        disabled={publishingId === d.id}
                        className="rounded-md bg-[#f59f4f] px-3 py-1.5 text-[11px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90 disabled:opacity-40"
                      >
                        {publishingId === d.id ? "Committing…" : "Publish cover"}
                      </button>
                      <button
                        onClick={() => regenerateCover(d)}
                        disabled={regeneratingId === d.id}
                        className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30 disabled:opacity-40"
                      >
                        {regeneratingId === d.id ? "Regenerating…" : "Regenerate"}
                      </button>
                    </>
                  ) : d.kind === "article" ? (
                    <button
                      onClick={() => publishArticle(d)}
                      disabled={publishingId === d.id}
                      className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500/90 disabled:opacity-40"
                    >
                      {publishingId === d.id ? "Committing…" : "Publish article → site"}
                    </button>
                  ) : d.kind === "video-script" ? (
                    <button
                      onClick={() => publishVideoScript(d)}
                      disabled={publishingId === d.id}
                      className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500/90 disabled:opacity-40"
                    >
                      {publishingId === d.id ? "Committing…" : "Publish script → repo"}
                    </button>
                  ) : d.kind === "linkedin" ? (
                    <button
                      onClick={() => publishDraft(d)}
                      disabled={publishingId === d.id}
                      className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0a66c2]/90 disabled:opacity-40"
                    >
                      {publishingId === d.id ? "Preparing…" : "Publish to LinkedIn"}
                    </button>
                  ) : (
                    /* inbox-outline / media-candidate drafts have no share URL and no
                       publish target — show an honest note instead of a button that
                       would 409. The founder can copy the caption from the body above. */
                    <p className="text-[11px] italic text-[#7a9ab8]">
                      No publish target for this draft kind — copy the caption above to use it manually.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="mt-6 text-[13px] text-[#7a9ab8]">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-rose-300">Failed to load: {error}</p>}
      {!loading && !error && pages.length === 0 && (
        <p className="mt-6 text-[13px] text-[#7a9ab8]">No audited pages yet — run an audit from the Sites tab.</p>
      )}

      <div className="mt-6 space-y-4">
        {pages.map((p) => {
          const isArticle = p.url.includes(ARTICLE_PREFIX);
          return (
            <div key={p.url} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-white">{p.title || p.url}</p>
                  <p className="truncate text-[12px] text-[#7a9ab8]">{p.url}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Score label="SEO" value={p.seo_score} />
                  <Score label="GEO" value={p.geo_score} />
                  {isArticle && (
                    <button
                      onClick={() => promote(p)}
                      disabled={promotingUrl === p.url}
                      title="Generate a human-gated LinkedIn promotion draft for this article"
                      className="rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] disabled:opacity-40"
                    >
                      {promotingUrl === p.url ? "Drafting…" : "Promote"}
                    </button>
                  )}
                </div>
              </div>
              {p.issues && p.issues.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {p.issues.slice(0, 8).map((iss, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px]">
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEV_COLOR[iss.severity] || "bg-slate-500/15 text-slate-300"}`}>
                        {iss.severity}
                      </span>
                      <span className="text-[#c8d6e8]"><b className="text-white">{iss.field}:</b> {iss.message} <span className="text-[#7a9ab8]">— {iss.recommendedFix}</span></span>
                    </li>
                  ))}
                  {p.issues.length > 8 && <li className="text-[11px] text-[#5f7c98]">+{p.issues.length - 8} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const color = value >= 80 ? "text-emerald-300" : value >= 50 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wide text-[#7a9ab8]">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value ?? "—"}</p>
    </div>
  );
};

/** Renders a cover draft's generated PNG (from schema_json.pngBase64) + the
 *  filename + the prompt that produced it, so the founder can approve/reject
 *  the visual before it is committed to the repo. Falls back to a note when the
 *  image payload is missing (e.g. the model call failed). */
const CoverPreview: React.FC<{ d: DraftRow }> = ({ d }) => {
  const sj = d.schema_json;
  if (!sj?.pngBase64) {
    return (
      <p className="mt-2 text-[12px] italic text-[#7a9ab8]">
        No cover generated ({sj?.note || "model unavailable"}).
      </p>
    );
  }
  const mime = sj.mimeType || "image/png";
  return (
    <div className="mt-2">
      <img
        src={`data:${mime};base64,${sj.pngBase64}`}
        alt={`Cover draft for ${d.title || d.url || d.id}`}
        className="w-full max-w-[420px] rounded-md border border-white/10"
      />
      <p className="mt-1.5 truncate text-[11px] text-[#7a9ab8]">
        {sj.filename} · {sj.model || "gemini-2.5-flash-image"}
        {typeof sj.costUsd === "number" ? ` · $${sj.costUsd.toFixed(4)}` : ""}
      </p>
      {sj.prompt && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-[#5f7c98]">prompt</summary>
          <p className="mt-1 whitespace-pre-wrap rounded bg-black/30 p-2 text-[11px] leading-relaxed text-[#9fb2c6]">
            {sj.prompt}
          </p>
        </details>
      )}
    </div>
  );
};

export default Issues;