import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";
import PipelineStrip from "../../../components/growth/PipelineStrip";
import MarkdownText from "../../../components/growth/MarkdownText";
import { ARTICLES, articlePath, getArticleBySlug } from "../../../content/articles.meta";
import { slugFromArticleUrl, ARTICLE_PATH_PREFIX } from "../../../lib/growth/articleSlug";
import { SITE } from "../../../seo.config";

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
  // + filename/prompt/model for the preview + publish step; article drafts carry
  // slug/category/readMinutes for the publish step.
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
    slug?: string;
    category?: string;
    readMinutes?: number;
    articleDescription?: string;
    articleTitle?: string;
    articleUrl?: string;
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
    case 'linkedin':
      return { label: 'linkedin', cls: 'bg-sky-500/15 text-sky-300' };
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
      // Don't masquerade an unknown kind as "linkedin" — surface it so a new
      // kind added server-side is visible (and fixable) instead of hidden.
      return { label: kind || 'unknown', cls: 'bg-white/5 text-[#9fb2c6]' };
  }
}

/** Inbox drops (inbox-outline / media-candidate) are auto-generated from files
 *  the founder dropped into the private inbox folder. They have no article URL
 *  and no publish target — they are reference material, not posts. We separate
 *  them from the publishable review queue so they stop looking like LinkedIn
 *  captions waiting to be approved. */
function isInboxReference(kind: string): boolean {
  return kind === "inbox-outline" || kind === "media-candidate";
}

/** A one-line "what is this draft" explainer shown under the card heading, so
 *  the founder understands what they are approving at a glance — the literal
 *  "we should have a description about what we are posting" request. The article
 *  description is sourced server-side (schema_json.articleDescription, fresh from
 *  the live page meta) and falls back to the local ARTICLES registry (so old
 *  drafts predating that field still get a real description, not a bare card).
 *  We deliberately do NOT fall back to schema_json.note here — that field holds
 *  operational messages ("model not configured", "budget exhausted"), not a
 *  description of the article, so showing it as "what this post is about" would
 *  mislead the founder. The note is surfaced separately in the rose warning. */
const DraftAbout: React.FC<{ d: DraftRow }> = ({ d }) => {
  if (isInboxReference(d.kind)) {
    return (
      <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200">
        <span className="font-semibold">Inbox reference drop</span> — auto-generated from a file dropped into your private
        inbox folder. It is <span className="font-semibold">not a publishable LinkedIn post</span> (no article URL, no
        cover, no publish button). Reuse the text above only if you want to; otherwise Reject it to clear the queue.
      </div>
    );
  }
  if (d.kind === "linkedin") {
    const articleUrl = d.schema_json?.articleUrl || d.url || null;
    const slug = slugFromArticleUrl(articleUrl);
    const article = slug ? getArticleBySlug(slug) : undefined;
    const title = d.schema_json?.articleTitle || d.title || article?.title || articleUrl;
    // Prefer the server-stored description (fresh from the live page meta); fall
    // back to the local ARTICLES registry description (covers old drafts), then
    // the abstract. Never the operational `note`.
    const about = d.schema_json?.articleDescription || article?.description || article?.abstract;
    return (
      <div className="mt-2 text-[11px] leading-relaxed text-[#7a9ab8]">
        LinkedIn caption for the article <span className="text-[#c8d6e8]">{title}</span>
        {articleUrl && (
          <>
            {" · "}
            <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="text-[#7ab9e6] hover:underline">
              open article ↗
            </a>
          </>
        )}
        {about && <div className="mt-0.5 text-[#9fb2c6]">{about}</div>}
      </div>
    );
  }
  return null;
};

const Issues: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [pages, setPages] = useState<GrowthPageRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);
  const [promotingUrl, setPromotingUrl] = useState<string | null>(null);
  const [coverGenUrl, setCoverGenUrl] = useState<string | null>(null);
  const [redesigningSlug, setRedesigningSlug] = useState<string | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<"personal" | "company">("personal");
  const [companyId, setCompanyId] = useState("");
  // Per-draft publish outcome so the founder completes the LinkedIn post from a
  // REAL click gesture (Open LinkedIn ↗) instead of a popup the browser may block
  // after the await — the old "blank tab opens and closes" symptom. Cleared per
  // action; only one draft's result/error shows at a time.
  const [publishResult, setPublishResult] = useState<{ draftId: string; shareUrl: string; caption: string; post: string } | null>(null);
  const [publishError, setPublishError] = useState<{ draftId: string; reason: string } | null>(null);
  // Inline SUCCESS notice for article/cover/video-script publish, pinned to the
  // draft card so the founder sees feedback right next to the button they clicked.
  // LinkedIn has its own share-URL UI (publishResult) below; these kinds just need
  // a confirmation line. Together with publishError this fixes "I click Publish
  // article → site and nothing happens" — the old code wrote the error/success to
  // draftMsg at the TOP of the page, far from the button, so it was invisible.
  const [publishOk, setPublishOk] = useState<{ draftId: string; message: string } | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // Drafts that just published successfully. The backend flips status →
  // 'published', so loadDrafts() drops them out of approvedDrafts and the card
  // hosting the publishOk/publishResult banner (and the "Open LinkedIn ↗"
  // button) would unmount the instant publish succeeds — defeating the whole
  // "open LinkedIn from a real click gesture" design (the founder clicks
  // Publish, the button to actually open LinkedIn disappears). We pin the
  // just-published draft here so it stays visible with its result banner until
  // the founder dismisses it; only then does it leave the page.
  const [justPublished, setJustPublished] = useState<Record<string, DraftRow>>({});
  const dismissJustPublished = (id: string) =>
    setJustPublished((m) => {
      if (!m[id]) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });

  // Agent↔Issues alignment state.
  const [stripKey, setStripKey] = useState(0);
  const [threadByDraft, setThreadByDraft] = useState<Record<string, string>>({});
  // "N new drafts" toast — fires when drafts land from an agent run (cross-tab
  // BroadcastChannel ping, or a same-tab mount after running on the Agent page).
  const [pendingToast, setPendingToast] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const focusDraftId = searchParams.get("draft");
  // Per-card refs so a ?draft=<id> deep-link can scroll + ring-highlight the card.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Guards the pending-delta toast so the very first load seeds the baseline
  // instead of toasting "N new drafts" against a missing prior value.
  const didSeedPending = useRef(false);

  // Cross-tab signal: the Agent tab posts {type:'drafts-updated'} when an agent
  // run finishes. Refresh the draft list + pipeline strip, then let the mount
  // delta decide whether to toast (only when pending actually increased).
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("growth-admin");
    ch.onmessage = (ev) => {
      if (ev?.data?.type === "drafts-updated") {
        void loadDrafts();
        setStripKey((k) => k + 1);
      }
    };
    return () => ch.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const { data, error } = await fetchJson<{ drafts?: DraftRow[] }>("/api/growth/approvals");
    setDraftsError(error && !data ? error : null);
    const rows = data?.drafts || [];
    setDrafts(rows);
    // Map each draft → the agent thread that created it (for "View in Agent").
    void loadThreadMap(rows);
    // Pending-delta toast: fires when pending drafts landed since the founder
    // last saw this page — covers both the same-tab "ran on Agent, came here"
    // case (this is the mount load) and the cross-tab BroadcastChannel refresh.
    const pendingCount = rows.filter((d) => d.status === "pending").length;
    if (didSeedPending.current) {
      let prev = 0;
      try { prev = Number(localStorage.getItem("growth:lastSeenPending") || "0"); } catch { /* ignore */ }
      if (pendingCount > prev) setPendingToast(pendingCount - prev);
    }
    didSeedPending.current = true;
    try { localStorage.setItem("growth:lastSeenPending", String(pendingCount)); } catch { /* ignore */ }
  }

  /** Batched reverse-lookup: which agent thread created each draft. Attaches a
   *  threadId to each card so the founder can jump back to the conversation. */
  async function loadThreadMap(rows: DraftRow[]) {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) { setThreadByDraft({}); return; }
    const { data, error } = await fetchJson<{ map?: Record<string, string> }>("/api/growth/draft-threads", {
      method: "POST",
      body: JSON.stringify({ draftIds: ids }),
    });
    if (!error && data?.map) setThreadByDraft(data.map);
  }

  useEffect(() => {
    load();
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link landing: ?draft=<id> (from an Agent "Open in Issues" link) scrolls
  // the matching card into view and rings it briefly so the founder's eye lands
  // on the draft the agent just pointed them to.
  useEffect(() => {
    if (!focusDraftId) return;
    const el = cardRefs.current[focusDraftId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const ring = ["ring-2", "ring-[#f59f4f]", "ring-offset-2", "ring-offset-[#0a0c10]"];
    el.classList.add(...ring);
    const t = setTimeout(() => el.classList.remove(...ring), 2500);
    return () => clearTimeout(t);
  }, [focusDraftId, drafts]);

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

  /** On-demand cover generation for a published article — the founder's "load a
   *  new cover if the previous cover is not there or not good". Creates a fresh
   *  pending cover draft (style-matched to the family) regardless of whether a
   *  cover already exists; the founder then approves + publishes it. */
  async function generateCover(page: GrowthPageRow) {
    const slug = slugFromArticleUrl(page.url);
    if (!slug) { setDraftMsg(`Couldn't derive an article slug from ${page.url}.`); return; }
    if (!confirm(`Generate a fresh cover for "${page.title || slug}"? It will create a pending draft in the review queue (any existing pending cover draft is replaced).`)) return;
    setCoverGenUrl(page.url);
    setDraftMsg(null);
    const { data, error } = await fetchJson<{ ok: boolean; draftId?: string; note?: string; error?: string; code?: string }>("/api/growth/cover/generate", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    setCoverGenUrl(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "generate failed";
      setDraftMsg(`Cover generate failed: ${reason}`);
      return;
    }
    setDraftMsg(data.draftId ? "Cover generated — a fresh pending draft is in the review queue. Approve it, then Publish cover." : `No new draft: ${data.note || "nothing generated"}`);
    await loadDrafts();
  }

  /** Redesign the cover of any PUBLISHED article (the "Published articles" section).
   *  Uses /api/growth/cover/generate — purpose-built for published articles (it
   *  looks the slug up in ARTICLES, clears pending/approved/rejected cover drafts
   *  for the URL, and force-creates a new pending one over an existing published
   *  cover). After approve + Publish cover, shipCoverToGitHub overwrites the live
   *  PNG idempotently — the site hero + LinkedIn og:image both update. */
  async function redesignCover(slug: string, title: string) {
    if (!confirm(`Redesign the cover for "${title}"? A fresh pending cover draft replaces any existing pending one. Approve it, then Publish cover to ship it live (the site hero + LinkedIn og:image both update).`)) return;
    setRedesigningSlug(slug);
    setDraftMsg(null);
    const { data, error } = await fetchJson<{ ok: boolean; draftId?: string; note?: string; error?: string; code?: string }>("/api/growth/cover/generate", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    setRedesigningSlug(null);
    if (error || !data?.ok) {
      const reason = strError(error) || strError(data?.error) || data?.code || "generate failed";
      setDraftMsg(`Cover redesign failed: ${reason}`);
      return;
    }
    setDraftMsg(data.draftId ? "Cover redesigned — a fresh pending draft is in the review queue. Approve it, then Publish cover." : `No new draft: ${data.note || "nothing generated"}`);
    await loadDrafts();
    setStripKey((k) => k + 1);
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
  // Separate inbox reference drops (auto-generated from dropped files, no
  // publish target) from the publishable review queue so they stop masquerading
  // as LinkedIn captions. The founder explicitly finds these confusing.
  const pendingPublishable = pendingDrafts.filter((d) => !isInboxReference(d.kind));
  const pendingInbox = pendingDrafts.filter((d) => isInboxReference(d.kind));
  const approvedPublishable = approvedDrafts.filter((d) => !isInboxReference(d.kind));
  const approvedInbox = approvedDrafts.filter((d) => isInboxReference(d.kind));
  // Just-published drafts that are no longer in approvedDrafts (status flipped
  // to 'published' server-side) but should stay visible until dismissed so the
  // founder can click "Open LinkedIn ↗" / read the commit-SHA confirmation.
  const justPublishedList = Object.values(justPublished).filter(
    (d) => !approvedDrafts.some((a) => a.id === d.id),
  );
  const approvedCards = [...approvedPublishable, ...justPublishedList];
  // The Personal/Company toggle + companyId field ONLY apply to LinkedIn drafts
  // (the publish handler routes by kind and ignores mode/companyId for
  // article/cover/video-script). Show the toggle only when a LinkedIn draft is
  // actually awaiting publish — the old code gated on `kind !== "cover"`, which
  // rendered an inert toggle for article/video-script drafts too.
  const hasLinkedinToPublish = approvedDrafts.some((d) => d.kind === "linkedin");

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
    // Compose the FULL LinkedIn post (caption + article URL) — LinkedIn has no
    // supported URL scheme that pre-fills post text, so the post is written here,
    // copied to the clipboard, AND shown inline below for review. The founder
    // clicks Open LinkedIn (composer opens with the link card), pastes once, and
    // pushes. This is the "auto-write the post I can just review and push" flow.
    const articleUrl = d.url || "";
    const fullPost = caption && articleUrl ? `${caption}\n\n${articleUrl}` : caption || articleUrl || "";
    try {
      await navigator.clipboard.writeText(fullPost);
    } catch {
      // clipboard may be blocked; the full post is shown inline to copy manually
    }
    setPublishResult({ draftId: d.id, shareUrl: data.shareUrl, caption, post: fullPost });
    setJustPublished((m) => ({ ...m, [d.id]: d }));
    setDraftMsg("Ready — the full post is written below and copied to your clipboard. Click “Open LinkedIn ↗”, paste into the composer (the link card is already there), review, and Post.");
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
    // Publish commits the cover PNG + wires the article `visual` field to GitHub
    // main → Vercel auto-rebuilds → live site. That's an outward-facing change, so
    // confirm before the commit (Regenerate already confirms; publish didn't).
    if (!confirm(`Publish this cover to the live site?\n\n${d.title || d.url || d.id}\n\nIt commits the PNG + updates the article visual on GitHub main, then Vercel rebuilds.`)) return;
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
    setJustPublished((m) => ({ ...m, [d.id]: d }));
    setDraftMsg(msg);
    await loadDrafts();
  }

  async function publishArticle(d: DraftRow) {
    // Publish commits the article markdown + articles.meta.ts entry to GitHub
    // main → Vercel auto-rebuilds → the article goes live. It also ships the
    // companion cover if one is approved. Confirm before this outward-facing
    // change (a stray click used to push straight to main with no gate).
    if (!confirm(`Publish this article to the live site?\n\n${d.title || d.url || d.id}\n\nIt commits the article + its meta entry to GitHub main (and ships the companion cover if one is approved), then Vercel rebuilds and it goes live.`)) return;
    setPublishingId(d.id);
    setDraftMsg(null);
    setPublishError(null);
    setPublishOk(null);
    const { data, error } = await fetchJson<{
      ok: boolean; kind?: string; slug?: string; fileUrl?: string;
      mdCommitSha?: string; metaCommitSha?: string; error?: string; code?: string;
      cover?: { ok: boolean; draftId?: string; filename?: string; fileUrl?: string; pngCommitSha?: string; metaCommitSha?: string; error?: string; needsToken?: boolean } | null;
      coverDrafted?: { draftId: string | null; note: string } | null;
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
    // Surface the companion cover outcome from the bundled publish (article + cover
    // ship together on one click). The article is already live regardless of the
    // cover result, so a cover failure is reported as a next-step, not a failure.
    // When no companion cover existed, the server auto-drafts a pending cover
    // (coverDrafted) so the article is never left coverless — surface that here.
    const c = data.cover;
    const coverLine = !c
      ? data.coverDrafted
        ? ` No companion cover existed, so a fresh cover draft was auto-created — ${data.coverDrafted.note}.`
        : " No companion cover draft, and none could be auto-created (cover model not configured or monthly budget exhausted) — generate one from the Published articles section when able."
      : c.ok
        ? ` Cover shipped too — ${c.filename} (png ${c.pngCommitSha?.slice(0, 7) ?? "?"}). Live at ${c.fileUrl}.`
        : ` Cover did NOT ship (article is still live): ${c.error}${c.needsToken ? " — set GITHUB_TOKEN (contents:write) in Vercel env." : ""}`;
    const msg =
      `Article published — ${data.slug} committed to GitHub (md ${data.mdCommitSha?.slice(0, 7) ?? "?"}${
        data.metaCommitSha ? `, meta ${data.metaCommitSha.slice(0, 7)}` : ""
      }). Vercel will auto-rebuild; it goes live at ${data.fileUrl ?? "the hub"}.${coverLine}`;
    setPublishOk({ draftId: d.id, message: msg });
    setJustPublished((m) => ({ ...m, [d.id]: d }));
    setDraftMsg(msg);
    await loadDrafts();
  }

  async function publishVideoScript(d: DraftRow) {
    // Commits the script as a reference artifact to GitHub main. Confirm first.
    if (!confirm(`Publish this video script to the repo?\n\n${d.title || d.url || d.id}\n\nIt commits the script markdown to GitHub main as a reference artifact.`)) return;
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
    setJustPublished((m) => ({ ...m, [d.id]: d }));
    setDraftMsg(msg);
    await loadDrafts();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Issues</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Latest audited pages with SEO + GEO scores and prioritized recommendations.
      </p>

      <div className="mt-5">
        <PipelineStrip variant="issues" refreshKey={stripKey} />
      </div>

      {pendingToast != null && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2">
          <p className="text-[12px] font-semibold text-emerald-300">
            ✨ {pendingToast} new draft{pendingToast === 1 ? "" : "s"} ready to review — the Growth Agent just finished a run.
          </p>
          <button onClick={() => setPendingToast(null)} className="text-[11px] text-emerald-300/70 hover:text-emerald-200">Dismiss</button>
        </div>
      )}

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
      {draftsError && pendingDrafts.length === 0 && (
        <p className="mt-2 text-[12px] text-rose-300">Could not load drafts: {draftsError}</p>
      )}

      {pendingPublishable.length > 0 && (
        <section className="mt-6 rounded-xl border border-[#f59f4f]/25 bg-[#f59f4f]/[0.05] p-4">
          <h2 className="text-[15px] font-bold text-white">
            Drafts awaiting review ({pendingPublishable.length})
          </h2>
          {draftsError && <p className="mt-1 text-[12px] text-rose-300">Could not load drafts: {draftsError}</p>}
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            Human-gated drafts generated by the Growth Agent — LinkedIn captions and on-brand article
            cover images. Approving marks the draft ready to publish; you still publish it yourself.
            Nothing auto-publishes.
          </p>
          <div className="mt-3 space-y-3">
            {pendingPublishable.map((d) => (
              <div key={d.id} ref={(el) => { cardRefs.current[d.id] = el; }} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{d.title || d.url || d.id}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>
                    {kindBadge(d.kind).label}
                  </span>
                  {threadByDraft[d.id] && (
                    <Link to={`/admin/growth/agent?thread=${encodeURIComponent(threadByDraft[d.id])}`} className="rounded border border-[#f59f4f]/30 px-1.5 py-0.5 text-[9px] font-semibold text-[#f6bf84] hover:bg-[#f59f4f]/10" title="Open the agent conversation that created this draft">
                      View in Agent ↗
                    </Link>
                  )}
                </div>
                {d.kind === "cover" ? (
                  <CoverPreview d={d} />
                ) : (
                  <>
                    <DraftAbout d={d} />
                    {d.kind === "linkedin" && !d.body_md ? (
                      <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-200">
                        <span className="font-semibold">⚠ No caption generated</span> ({d.schema_json?.note || "model unavailable"}). This draft has no text to post yet — write a caption yourself before approving, or Reject it.
                      </div>
                    ) : d.body_md ? (
                      <div className="mt-2"><MarkdownText className="text-[12px]">{d.body_md}</MarkdownText></div>
                    ) : (
                      <p className="mt-2 text-[12px] italic text-[#7a9ab8]">
                        No {d.kind === "video-script" ? "script" : "body"} generated for this {d.kind} draft ({d.schema_json?.note || "model unavailable"}). Regenerate it from the Agent tab, or write it manually before approving.
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

      {pendingInbox.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
          <h2 className="text-[15px] font-bold text-amber-200">
            Inbox reference drops — not posts ({pendingInbox.length})
          </h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            Auto-generated from markdown files dropped into your private inbox folder. These are not
            publishable LinkedIn captions (no article URL). Reject the ones you do not want to clear
            them from the queue; the publishable LinkedIn + cover drafts live in the section above.
          </p>
          <div className="mt-3 space-y-3">
            {pendingInbox.map((d) => (
              <div key={d.id} ref={(el) => { cardRefs.current[d.id] = el; }} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{d.title || d.id}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>
                    {kindBadge(d.kind).label}
                  </span>
                </div>
                <DraftAbout d={d} />
                {d.body_md && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#c8d6e8]">{d.body_md}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decideDraft(d.id, "rejected")}
                    className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Reject (clear)
                  </button>
                  <button
                    onClick={() => decideDraft(d.id, "approved")}
                    className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {approvedCards.length > 0 && (
        <section className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
          <h2 className="text-[15px] font-bold text-white">
            Approved — ready to publish ({approvedPublishable.length})
            {justPublishedList.length > 0 && (
              <span className="ml-2 text-[11px] font-semibold text-emerald-300">· {justPublishedList.length} just published</span>
            )}
          </h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            One-click publish (human-gated). LinkedIn: copies the caption to your clipboard and opens the official
            share page prefilled with the article URL — you post it yourself. Cover: commits the PNG + wires the
            article `visual` field to GitHub (Vercel auto-rebuilds). Nothing auto-publishes.
          </p>
          {hasLinkedinToPublish && (
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
            {approvedCards.map((d) => {
              const justOut = !!justPublished[d.id];
              return (
              <div key={d.id} ref={(el) => { cardRefs.current[d.id] = el; }} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{d.title || d.url || d.id}</p>
                  {justOut && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300">published</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>
                    {kindBadge(d.kind).label}
                  </span>
                  {threadByDraft[d.id] && !justOut && (
                    <Link to={`/admin/growth/agent?thread=${encodeURIComponent(threadByDraft[d.id])}`} className="rounded border border-[#f59f4f]/30 px-1.5 py-0.5 text-[9px] font-semibold text-[#f6bf84] hover:bg-[#f59f4f]/10" title="Open the agent conversation that created this draft">
                      View in Agent ↗
                    </Link>
                  )}
                </div>
                {d.kind === "cover" ? (
                  <CoverPreview d={d} />
                ) : d.kind === "article" || d.kind === "video-script" ? (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-white/5 bg-white/[0.02] p-2.5">
                    {d.body_md && <MarkdownText className="text-[12px]">{d.body_md}</MarkdownText>}
                    {d.kind === "article" && d.schema_json?.slug && (
                      <p className="mt-2 text-[10px] text-[#5f7c98]">slug: {d.schema_json.slug} · {d.schema_json?.category ?? ""} · ~{d.schema_json?.readMinutes ?? "?"} min read</p>
                    )}
                  </div>
                ) : (
                  <>
                    <DraftAbout d={d} />
                    {d.body_md ? (
                      <div className="mt-2"><MarkdownText className="text-[12px]">{d.body_md}</MarkdownText></div>
                    ) : (
                      <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-200">
                        <span className="font-semibold">⚠ No caption generated</span> ({d.schema_json?.note || "model unavailable"}). This draft has no text to post — write a caption yourself, or Reject it from the pending queue before publishing.
                      </div>
                    )}
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
                    <p className="text-[11px] font-semibold text-emerald-300">✓ Post written + copied to clipboard — review it below, then Open LinkedIn and paste.</p>
                    {publishResult.post && (
                      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-[12px] leading-relaxed text-[#c8d6e8]">{publishResult.post}</pre>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => openShare(publishResult.shareUrl)}
                        className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0a66c2]/90"
                      >
                        Open LinkedIn ↗
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(publishResult.post).then(() => setDraftMsg("Post copied to clipboard."))}
                        className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30"
                      >
                        Copy post
                      </button>
                      <button
                        onClick={() => { setPublishResult(null); dismissJustPublished(d.id); }}
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
                    <button onClick={() => { setPublishOk(null); dismissJustPublished(d.id); }} className="mt-1.5 text-[10px] text-[#7a9ab8] hover:text-[#c8d6e8]">Dismiss</button>
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
                  {justOut ? (
                    /* Already published — the result banner above has the Open
                       LinkedIn button (linkedin) or the commit-SHA confirmation
                       (article/cover/video-script). No publish button to retry. */
                    <p className="text-[11px] font-semibold text-emerald-300">
                      ✓ Published — {d.kind === "linkedin" ? "click “Open LinkedIn ↗” above to post." : "see the confirmation above; dismiss it to clear this card."}
                    </p>
                  ) : d.kind === "cover" ? (
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
              );
            })}
          </div>
        </section>
      )}

      {approvedInbox.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
          <h2 className="text-[15px] font-bold text-amber-200">
            Approved inbox references — kept, not published ({approvedInbox.length})
          </h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            These are markdown files you dropped into the inbox and then approved to keep as reference
            material. They have no publish target (no article URL, no cover) — nothing here ever
            auto-publishes. They are kept out of the publishable queue above on purpose.
          </p>
          <div className="mt-3 space-y-2">
            {approvedInbox.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>{kindBadge(d.kind).label}</span>
                <p className="min-w-0 flex-1 truncate text-[12px] text-[#c8d6e8]">{d.title || d.id}</p>
                <button
                  onClick={() => decideDraft(d.id, "rejected")}
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20"
                >
                  Reject (clear)
                </button>
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
          const isArticle = p.url.includes(ARTICLE_PATH_PREFIX);
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
                    <>
                      <button
                        onClick={() => promote(p)}
                        disabled={promotingUrl === p.url}
                        title="Generate a human-gated LinkedIn promotion draft for this article"
                        className="rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] disabled:opacity-40"
                      >
                        {promotingUrl === p.url ? "Drafting…" : "Promote"}
                      </button>
                      <button
                        onClick={() => generateCover(p)}
                        disabled={coverGenUrl === p.url}
                        title="Generate a fresh on-brand cover for this article (or replace one you don't like). Creates a pending draft to approve + publish."
                        className="rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] disabled:opacity-40"
                      >
                        {coverGenUrl === p.url ? "Generating cover…" : "Generate cover"}
                      </button>
                    </>
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

      {/* Published articles — the canonical "redesign any cover" surface. Every
          published article gets a Redesign cover button (the audited-pages list
          only shows pages that have been crawled). One redesign updates the site
          hero + the LinkedIn og:image together (LinkedIn uses the article cover). */}
      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h2 className="text-[15px] font-bold text-white">Published articles ({ARTICLES.length})</h2>
        <p className="mt-1 text-[12px] text-[#9fb2c6]">
          Redesign the cover of any published article. A fresh pending cover draft lands in the review queue above —
          approve it, then Publish cover to ship it live. The site hero + LinkedIn <code className="text-[#f59f4f]">og:image</code> both update (LinkedIn uses the article cover).
        </p>
        <div className="mt-3 divide-y divide-white/[0.04]">
          {ARTICLES.map((a) => (
            <div key={a.slug} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{a.title}</p>
                <p className="truncate text-[11px] text-[#7a9ab8]">{a.category} · /{articlePath(a.slug)} · {a.readMinutes} min</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${SITE.url}${articlePath(a.slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-[#c8d6e8] hover:border-white/30"
                >
                  View live ↗
                </a>
                <button
                  onClick={() => redesignCover(a.slug, a.title)}
                  disabled={redesigningSlug === a.slug}
                  title="Generate a fresh pending cover for this published article (replaces any pending one). Approve + Publish cover to ship it live."
                  className="rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] disabled:opacity-40"
                >
                  {redesigningSlug === a.slug ? "Redesigning…" : "Redesign cover"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
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