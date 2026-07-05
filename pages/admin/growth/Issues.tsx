import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";
import PipelineStrip from "../../../components/growth/PipelineStrip";
import MarkdownText from "../../../components/growth/MarkdownText";
import { ARTICLES, articlePath, getArticleBySlug } from "../../../content/articles.meta";
import { slugFromArticleUrl, ARTICLE_PATH_PREFIX } from "../../../lib/growth/articleSlug";
import { SITE } from "../../../seo.config";
import { MEDIUM_IMPORT_URL } from "../../../lib/growth/syndication/medium";
import type { SyndicationPlatform, SyndicationStatus } from "../../../lib/growth/syndication/types";

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

/** One row of the growth_syndication ledger — the cross-post history for an
 *  article. Loaded once at the Issues page level (GET /api/growth/syndicate)
 *  and filtered by slug inside each SyndicatePanel. */
interface SyndHistoryRow {
  id: string;
  slug: string;
  platform: string;
  status: string;
  canonical_url: string;
  platform_url: string | null;
  platform_post_id: string | null;
  error: string | null;
  created_at: string;
}

/** Human label + editor URL for each syndication platform. The editor URL is
 *  opened in a new tab on the manual path (no API key, or Medium always) so the
 *  founder pastes the body / canonical into the platform's own composer. */
const SYND_PLATFORMS: { key: SyndicationPlatform; label: string; openUrl: string }[] = [
  { key: "devto", label: "DEV.to", openUrl: "https://dev.to/new" },
  { key: "hashnode", label: "Hashnode", openUrl: "https://hashnode.com/new" },
  { key: "medium", label: "Medium", openUrl: MEDIUM_IMPORT_URL },
];

/** LOCAL Playwright submit config per platform — the "same process as LinkedIn"
 *  path the founder asked for: the "Submit (local) ↗" click copies the body (or
 *  canonical for Medium import) to the clipboard + opens the editor URL, then the
 *  founder runs scripts/syndicate-populate.ts on their own machine (persistent
 *  logged-in profile) to pre-fill the editor + clicks Publish themselves. No API
 *  keys/tokens. `mode` is the --mode flag passed to the script (Medium only). */
const SYND_LOCAL: Record<SyndicationPlatform, { editorUrl: string; clipboard: "body" | "canonical"; mode: "story" | "import" }> = {
  devto: { editorUrl: "https://dev.to/new", clipboard: "body", mode: "import" },
  hashnode: { editorUrl: "https://hashnode.com/new", clipboard: "body", mode: "import" },
  medium: { editorUrl: "https://medium.com/new-story", clipboard: "body", mode: "story" },
};

/** Status → tailwind chip color (mirrors PipelineStrip's statusChip palette). */
const SYND_STATUS_CHIP: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  draft: "bg-sky-500/15 text-sky-300",
  manual: "bg-sky-500/15 text-sky-300",
  playwright_draft: "bg-amber-500/15 text-amber-300",
  failed: "bg-rose-500/15 text-rose-300",
  not_configured: "bg-slate-500/15 text-slate-300",
};
// Honest display labels for syndication ledger statuses. The stored status
// `playwright_draft` reads as "a draft exists on the platform" — false: only a
// clipboard copy happened; the founder still has to run the local script + click
// Publish. Render it as "LOCAL PENDING" so the founder isn't misled.
const SYND_STATUS_LABEL: Record<string, string> = {
  published: "published",
  draft: "draft",
  manual: "manual",
  playwright_draft: "local pending",
  failed: "failed",
  not_configured: "not configured",
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
  // Copyable fallback for manual/local syndication: navigator.clipboard.writeText
  // runs AFTER a network await and can lose transient activation on a cold
  // serverless start, silently failing the copy. When set, we render the body (or
  // canonical URL) in a read-only textarea the founder can always Ctrl+C, so the
  // manual paste flow never dead-ends on "copy below, then paste" with nothing
  // to copy. Cleared at the start of each syndicate action.
  const [localBody, setLocalBody] = useState<{ label: string; text: string } | null>(null);
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
  // Stage 3 syndication ledger (all articles, newest-first). Loaded once on mount
  // and refreshed after each syndicate action; each SyndicatePanel filters by slug.
  const [syndHistory, setSyndHistory] = useState<SyndHistoryRow[]>([]);
  const [syndBusy, setSyndBusy] = useState<string | null>(null); // `${slug}:${platform}` in flight
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
  // Stage 2 Issues filter bar (additive client-side filter over already-loaded
  // drafts). Defaults are "all"/"all"/"" → visibleDrafts === drafts → identical to
  // the prior behavior, so the filter is a pure no-op until the founder uses it.
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // 3-tab workspace: Queue (drafts to action) · Audited pages (SEO/GEO) ·
  // Published (cover redesign + syndication). Persisted so refresh keeps context.
  const [tab, setTab] = useState<"queue" | "pages" | "published">(
    () => (typeof localStorage !== "undefined" && (localStorage.getItem("growth:issuesTab") as "queue" | "pages" | "published") || "queue"),
  );
  // Platform filter for the Published tab (All / Medium / DEV.to / Hashnode).
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  // Search inside the Audited-pages + Published tabs (separate from the Queue search).
  const [pagesSearch, setPagesSearch] = useState<string>("");
  const [publishedSearch, setPublishedSearch] = useState<string>("");
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

  /** Load the syndication ledger (all cross-post history) so each Published
   *  articles row can show its own history inline. Never throws. */
  async function loadSyndHistory() {
    const { data, error } = await fetchJson<{ history?: SyndHistoryRow[] }>("/api/growth/syndicate");
    if (!error && Array.isArray(data?.history)) setSyndHistory(data!.history!);
  }

  /** Syndicate one published article to one platform. The server sources the
   *  body from the live published .md (content/articles/<slug>.md) via the GitHub
   *  contents API, so the cross-post matches the canonical article on
   *  www.inbharat.ai — that is what makes Google attribute the original to
   *  inbharat.ai. API platforms (DEV.to/Hashnode with keys) publish directly;
   *  manual platforms (Medium always; DEV/Hashnode without keys) return the body
   *  + canonical, which we copy to the clipboard and open the platform editor. */
  async function syndicate(slug: string, title: string, platform: SyndicationPlatform) {
    const busyKey = `${slug}:${platform}`;
    setSyndBusy(busyKey);
    setDraftMsg(null);
    setLocalBody(null);
    const { data, error } = await fetchJson<{
      ok: boolean;
      slug?: string;
      title?: string;
      results?: { platform: SyndicationPlatform; ok: boolean; status: SyndicationStatus; url: string | null; error: string | null; canonicalUrl: string }[];
      bodyMarkdown?: string;
      canonicalUrl?: string;
      bodySource?: "published" | "draft";
      error?: string;
      code?: string;
    }>("/api/growth/syndicate", {
      method: "POST",
      body: JSON.stringify({ slug, platforms: [platform] }),
    });
    setSyndBusy(null);
    if (error || !data?.ok || !data.results?.length) {
      setDraftMsg(`Syndicate ${platform} failed: ${strError(error) || strError(data?.error) || data?.code || "unknown"}`);
      // even on failure, refresh history (a failed row is recorded)
      void loadSyndHistory();
      return;
    }
    const r = data.results[0];
    const canonical = data.canonicalUrl ?? r.canonicalUrl;
    // Manual path: Medium always, or DEV.to/Hashnode when their API keys are
    // absent (status === "not_configured"). Copy the body (or canonical for
    // Medium) to the clipboard + open the platform editor for the founder to
    // paste. NOTE: clipboard.writeText runs after a network await and can lose
    // transient activation on a cold serverless start — when it fails we render
    // the text in a read-only textarea (localBody) so the founder can always
    // Ctrl+C instead of dead-ending on "copy below" with nothing to copy.
    const isManual = platform === "medium" || r.status === "not_configured" || r.status === "manual";
    if (isManual) {
      const clipboardText = platform === "medium" ? canonical : (data.bodyMarkdown ?? "");
      let clipboardOk = false;
      try { await navigator.clipboard.writeText(clipboardText); clipboardOk = true; } catch { clipboardOk = false; }
      const open = SYND_PLATFORMS.find((p) => p.key === platform)?.openUrl ?? "";
      const w = window.open(open, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = open;
      const what = platform === "medium" ? "canonical URL" : "article body";
      if (!clipboardOk) setLocalBody({ label: `${SYND_PLATFORMS.find((p) => p.key === platform)?.label} — ${what} (clipboard copy failed; select + Ctrl+C)`, text: clipboardText });
      setDraftMsg(
        `${SYND_PLATFORMS.find((p) => p.key === platform)?.label} manual: ${what} ${clipboardOk ? "copied to clipboard —" : "copy from the box below, then"} paste into the editor that just opened. (body source: ${data.bodySource ?? "?"})`,
      );
    } else if (r.status === "published" || r.status === "draft") {
      setDraftMsg(`${SYND_PLATFORMS.find((p) => p.key === platform)?.label}: ${r.status === "published" ? "published ✓" : "draft created ✓"}${r.url ? ` — ${r.url}` : ""}`);
    } else if (r.status === "failed") {
      setDraftMsg(`${SYND_PLATFORMS.find((p) => p.key === platform)?.label} failed: ${r.error ?? "unknown"}`);
    }
    void loadSyndHistory();
  }

  /** LOCAL Playwright submit — the "same process as LinkedIn" path the founder
   *  asked for. The server (mode:"playwright") resolves the body + canonical and
   *  records a `playwright_draft` ledger row WITHOUT calling any platform API.
   *  We then copy the body (or canonical for Medium import) to the clipboard +
   *  open the platform editor + surface the exact local command to run. The
   *  founder runs scripts/syndicate-populate.ts on their own machine (persistent
   *  logged-in browser profile) to pre-fill the editor, then clicks Publish
   *  themselves. No API keys/tokens. Nothing auto-publishes. */
  async function syndicateLocal(slug: string, title: string, platform: SyndicationPlatform) {
    const busyKey = `${slug}:${platform}:local`;
    setSyndBusy(busyKey);
    setDraftMsg(null);
    setLocalBody(null);
    const { data, error } = await fetchJson<{
      ok: boolean;
      slug?: string;
      bodyMarkdown?: string;
      canonicalUrl?: string;
      bodySource?: "published" | "draft";
      error?: string;
      code?: string;
    }>("/api/growth/syndicate", {
      method: "POST",
      body: JSON.stringify({ slug, platforms: [platform], mode: "playwright" }),
    });
    setSyndBusy(null);
    if (error || !data?.ok) {
      setDraftMsg(`Local submit ${platform} failed: ${strError(error) || strError(data?.error) || data?.code || "unknown"}`);
      void loadSyndHistory();
      return;
    }
    const local = SYND_LOCAL[platform];
    const clipboardText = local.clipboard === "canonical" ? (data.canonicalUrl ?? "") : (data.bodyMarkdown ?? "");
    let clipboardOk = false;
    try { await navigator.clipboard.writeText(clipboardText); clipboardOk = true; } catch { clipboardOk = false; }
    // Do NOT window.open the platform editor here — the local script opens the
    // editor in its own persistent logged-in Playwright profile; opening a
    // second logged-out tab here just gives the founder a dead tab to close.
    const cmd = platform === "medium"
      ? `npx tsx scripts/syndicate-populate.ts --platform medium --slug ${slug} --mode ${local.mode}`
      : `npx tsx scripts/syndicate-populate.ts --platform ${platform} --slug ${slug}`;
    const what = local.clipboard === "canonical" ? "canonical URL" : "article body";
    if (!clipboardOk) setLocalBody({ label: `${SYND_PLATFORMS.find((p) => p.key === platform)?.label} (local) — ${what} (clipboard copy failed; select + Ctrl+C)`, text: clipboardText });
    setDraftMsg(
      `${SYND_PLATFORMS.find((p) => p.key === platform)?.label} (local Playwright): ${what} ${clipboardOk ? "copied to clipboard." : "copy from the box below."} Run locally to pre-fill + publish:  ${cmd}  (body source: ${data.bodySource ?? "?"})`,
    );
    void loadSyndHistory();
  }

  useEffect(() => {
    load();
    loadDrafts();
    void loadSyndHistory();
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

  // Stage 2 filter bar: apply kind + status + title search over the raw drafts.
  // Default filters ("all"/"all"/"") pass every draft through unchanged.
  const rawPendingCount = drafts.filter((d) => d.status === "pending").length;
  const visibleDrafts = drafts.filter((d) => {
    if (kindFilter !== "all") {
      if (kindFilter === "inbox") { if (!isInboxReference(d.kind)) return false; }
      else if (d.kind !== kindFilter) return false;
    }
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${d.title ?? ""} ${d.url ?? ""} ${d.body_md ?? ""} ${d.kind}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const pendingDrafts = visibleDrafts.filter((d) => d.status === "pending");
  const approvedDrafts = visibleDrafts.filter((d) => d.status === "approved");
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

  // Rejected drafts — the old page never rendered a Rejected section, so the
  // "Rejected" status filter chip showed nothing. Surface them compactly with a
  // one-click Approve to restore to the publishable queue.
  const rejectedDrafts = visibleDrafts.filter((d) => d.status === "rejected");

  // Audited-pages tab: lightweight url/title search (page-level, no kind filter).
  const visiblePages = pages.filter((p) => {
    if (!pagesSearch.trim()) return true;
    const q = pagesSearch.trim().toLowerCase();
    return `${p.url} ${p.title ?? ""}`.toLowerCase().includes(q);
  });

  // Published tab: filter articles by syndication platform + title search. When
  // platformFilter is set, only articles with a syndHistory row for that platform
  // show — so the founder can see "what's been cross-posted to Medium" at a glance.
  const visibleArticles = ARTICLES.filter((a) => {
    if (publishedSearch.trim()) {
      const q = publishedSearch.trim().toLowerCase();
      if (!`${a.title} ${a.slug} ${a.category ?? ""}`.toLowerCase().includes(q)) return false;
    }
    if (platformFilter !== "all") {
      const has = syndHistory.some((h) => h.slug === a.slug && h.platform === platformFilter);
      if (!has) return false;
    }
    return true;
  });

  // Tab count badges.
  const queueCount = pendingPublishable.length + approvedPublishable.length;
  const pagesCount = pages.length;
  const publishedCount = ARTICLES.length;

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
    // #10 UI safety: confirm before preparing the LinkedIn share (consistent with
    // the confirm() guards on the cover/article/video-script repo-commit publishes
    // below). LinkedIn publish does NOT commit to a repo — it generates the share
    // URL + caption for the founder to post manually — so this is a lighter
    // "are you sure" than the repo-commit confirms, but keeps one uniform pattern
    // across every Publish button so no publish fires on an accidental click.
    const modeLabel = publishMode === "company" ? ` as company ${companyId.trim()}` : " as personal";
    if (!confirm(`Publish this LinkedIn draft${modeLabel}?\n\n${d.title || d.url || d.id}\n\nIt prepares the LinkedIn share URL + caption; you still post manually on LinkedIn.`)) return;
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
      {localBody && (
        <div className="mt-2">
          <p className="text-[11px] text-[#7a9ab8]">{localBody.label}</p>
          <textarea
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            value={localBody.text}
            className="mt-1 h-40 w-full resize-y rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 font-mono text-[11px] text-[#c0cfe0] focus:border-[#f59f4f]/50 focus:outline-none"
          />
        </div>
      )}
      {draftsError && rawPendingCount === 0 && (
        <p className="mt-2 text-[12px] text-rose-300">Could not load drafts: {draftsError}</p>
      )}

      {/* ── 3-tab workspace ───────────────────────────────────────────────
          Queue (drafts to action) · Audited pages (SEO/GEO) · Published
          (cover redesign + syndication). Persisted in localStorage. */}
      <div className="mt-5 flex flex-wrap gap-1 border-b border-white/10 pb-px">
        {([
          { k: "queue", label: "Queue", count: queueCount },
          { k: "pages", label: "Audited pages", count: pagesCount },
          { k: "published", label: "Published", count: publishedCount },
        ] as const).map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => { setTab(t.k); try { localStorage.setItem("growth:issuesTab", t.k); } catch { /* ignore */ } }}
              className={`rounded-t-lg px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                active ? "bg-[#f59f4f]/10 text-white ring-1 ring-[#f59f4f]/30" : "text-[#9fb2c6] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-[#f59f4f]/20 text-[#f6bf84]" : "bg-white/[0.06] text-[#7a9ab8]"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "queue" && kindFilter === "cover" && (
        <div className="mt-3 rounded-lg border border-[#f59f4f]/20 bg-[#f59f4f]/[0.05] px-3 py-2 text-[12px] text-[#f6bf84]">
          Showing cover drafts. To redesign a cover for a published article,{" "}
          <button onClick={() => { setTab("published"); try { localStorage.setItem("growth:issuesTab", "published"); } catch { /* ignore */ } }} className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[#f59f4f]">
            open the Published tab ↗
          </button>
          .
        </div>
      )}

      {tab === "queue" && drafts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Filter</span>
          <div className="flex flex-wrap gap-1">
            {[
              { k: "all", label: "All" },
              { k: "article", label: "Articles" },
              { k: "linkedin", label: "LinkedIn" },
              { k: "cover", label: "Covers" },
              { k: "video-script", label: "Video" },
              { k: "inbox", label: "Inbox" },
            ].map((opt) => (
              <button
                key={opt.k}
                onClick={() => setKindFilter(opt.k)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${kindFilter === opt.k ? "bg-[#f59f4f] text-black" : "bg-white/[0.04] text-[#c8d6e8] hover:bg-white/[0.08]"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { s: "all", label: "Any status" },
              { s: "pending", label: "Pending" },
              { s: "approved", label: "Approved" },
              { s: "published", label: "Published" },
              { s: "rejected", label: "Rejected" },
            ].map((opt) => (
              <button
                key={opt.s}
                onClick={() => setStatusFilter(opt.s)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${statusFilter === opt.s ? "bg-[#f59f4f] text-black" : "bg-white/[0.04] text-[#c8d6e8] hover:bg-white/[0.08]"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title / url / body…"
            className="min-w-[160px] flex-1 rounded-md border border-white/10 bg-[#0a0f18] px-2.5 py-1 text-[12px] text-white placeholder:text-[#5f798f] focus:border-[#f59f4f]/50 focus:outline-none"
          />
          {(kindFilter !== "all" || statusFilter !== "all" || searchQuery.trim()) && (
            <button
              onClick={() => { setKindFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#9fb2c6] hover:text-white"
            >
              Clear
            </button>
          )}
          <span className="ml-auto mr-1 text-[11px] text-[#7a9ab8]">
            {visibleDrafts.length} / {drafts.length}
          </span>
        </div>
      )}

      {tab === "queue" && pendingPublishable.length > 0 && (
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

      {tab === "queue" && pendingInbox.length > 0 && (
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

      {tab === "queue" && approvedCards.length > 0 && (
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

      {tab === "queue" && approvedInbox.length > 0 && (
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

      {tab === "queue" && rejectedDrafts.length > 0 && (
        <section className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <h2 className="text-[15px] font-bold text-rose-200">
            Rejected ({rejectedDrafts.length})
          </h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            Rejected drafts. Approve to restore one to the publishable queue, or leave it rejected to keep it out of the way.
          </p>
          <div className="mt-3 space-y-2">
            {rejectedDrafts.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kindBadge(d.kind).cls}`}>{kindBadge(d.kind).label}</span>
                <p className="min-w-0 flex-1 truncate text-[12px] text-[#c8d6e8]">{d.title || d.url || d.id}</p>
                <button
                  onClick={() => decideDraft(d.id, "approved")}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  Restore (approve)
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "queue" && !loading && drafts.length > 0 && visibleDrafts.length === 0 && (
        <p className="mt-6 text-[13px] text-[#7a9ab8]">No drafts match this filter.</p>
      )}

      {tab === "pages" && (
        <>
          {loading && <p className="mt-6 text-[13px] text-[#7a9ab8]">Loading…</p>}
          {error && <p className="mt-6 text-[13px] text-rose-300">Failed to load: {error}</p>}
          {!loading && !error && pages.length === 0 && (
            <p className="mt-6 text-[13px] text-[#7a9ab8]">No audited pages yet — run an audit from the Sites tab.</p>
          )}
          {pages.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Search</span>
              <input
                value={pagesSearch}
                onChange={(e) => setPagesSearch(e.target.value)}
                placeholder="Filter by URL / title…"
                className="min-w-[160px] flex-1 rounded-md border border-white/10 bg-[#0a0f18] px-2.5 py-1 text-[12px] text-white placeholder:text-[#5f798f] focus:border-[#f59f4f]/50 focus:outline-none"
              />
              <span className="ml-auto mr-1 text-[11px] text-[#7a9ab8]">{visiblePages.length} / {pages.length}</span>
            </div>
          )}
          <div className="mt-6 space-y-4">
            {visiblePages.map((p) => {
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
        </>
      )}

      {/* Published articles — the canonical "redesign any cover" surface. Every
          published article gets a Redesign cover button (the audited-pages list
          only shows pages that have been crawled). One redesign updates the site
          hero + the LinkedIn og:image together (LinkedIn uses the article cover). */}
      {tab === "published" && (
        <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h2 className="text-[15px] font-bold text-white">Published articles ({ARTICLES.length})</h2>
          <p className="mt-1 text-[12px] text-[#9fb2c6]">
            Redesign the cover of any published article. A fresh pending cover draft lands in the review queue above —
            approve it, then Publish cover to ship it live. The site hero + LinkedIn <code className="text-[#f59f4f]">og:image</code> both update (LinkedIn uses the article cover).
          </p>

          {/* Platform filter + search — the syndication view the founder asked for.
              All / Medium / DEV.to / Hashnode isolates the list to articles that have
              a syndication-history row for that platform. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-[#7a9ab8]">Syndication</span>
            <div className="flex flex-wrap gap-1">
              {[
                { k: "all", label: "All" },
                { k: "medium", label: "Medium" },
                { k: "devto", label: "DEV.to" },
                { k: "hashnode", label: "Hashnode" },
              ].map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setPlatformFilter(opt.k)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${platformFilter === opt.k ? "bg-[#f59f4f] text-black" : "bg-white/[0.04] text-[#c8d6e8] hover:bg-white/[0.08]"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              value={publishedSearch}
              onChange={(e) => setPublishedSearch(e.target.value)}
              placeholder="Search title / slug…"
              className="min-w-[140px] ml-auto mr-1 flex-1 rounded-md border border-white/10 bg-[#0a0f18] px-2.5 py-1 text-[12px] text-white placeholder:text-[#5f798f] focus:border-[#f59f4f]/50 focus:outline-none"
            />
            <span className="mr-1 text-[11px] text-[#7a9ab8]">{visibleArticles.length} / {ARTICLES.length}</span>
          </div>

          <div className="mt-3 divide-y divide-white/[0.04]">
            {visibleArticles.map((a) => {
              const platRows = syndHistory.filter((h) => h.slug === a.slug);
              return (
                <div key={a.slug} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">{a.title}</p>
                      <p className="truncate text-[11px] text-[#7a9ab8]">{a.category} · /{articlePath(a.slug)} · {a.readMinutes} min</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {SYND_PLATFORMS.map((p) => {
                        const last = platRows.find((r) => r.platform === p.key);
                        if (!last) return null;
                        return (
                          <span
                            key={p.key}
                            title={`last ${p.label}: ${last.status}${last.platform_url ? ` — ${last.platform_url}` : ""}`}
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${SYND_STATUS_CHIP[last.status] || "bg-slate-500/15 text-slate-300"}`}
                          >
                            {p.label}:{SYND_STATUS_LABEL[last.status] ?? last.status}
                          </span>
                        );
                      })}
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
                  <SyndicatePanel slug={a.slug} title={a.title} history={syndHistory} busy={syndBusy} onSyndicate={syndicate} onSyndicateLocal={syndicateLocal} />
                </div>
              );
            })}
            {visibleArticles.length === 0 && (
              <p className="py-4 text-[12px] text-[#7a9ab8]">No articles match this filter.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

/** Inline syndication control for one PUBLISHED article. Shows the 3 platform
 *  buttons + the cross-post history for this slug. The body comes from the live
 *  published .md (server-side), so the cross-post matches the canonical article
 *  — the whole point of canonical-based syndication. Human-gated: every click is
 *  a deliberate per-platform action; nothing auto-syndicates. */
const SyndicatePanel: React.FC<{
  slug: string;
  title: string;
  history: SyndHistoryRow[];
  busy: string | null;
  onSyndicate: (slug: string, title: string, platform: SyndicationPlatform) => void;
  onSyndicateLocal: (slug: string, title: string, platform: SyndicationPlatform) => void;
}> = ({ slug, title, history, busy, onSyndicate, onSyndicateLocal }) => {
  const [open, setOpen] = useState(false);
  const rows = history.filter((h) => h.slug === slug).slice(0, 6);
  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] font-semibold text-[#f6bf84] hover:text-[#f59f4f]"
        title="Cross-post this article to DEV.to / Hashnode / Medium with the InBharat canonical URL set"
      >
        <span>{open ? "▾" : "▸"}</span> Syndicate {rows.length > 0 && <span className="text-[10px] text-[#7a9ab8]">· {rows.length} attempt{rows.length === 1 ? "" : "s"}</span>}
      </button>
      {open && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1.5">
            {SYND_PLATFORMS.map((p) => {
              const busyKey = `${slug}:${p.key}`;
              const localBusyKey = `${slug}:${p.key}:local`;
              const last = rows.find((r) => r.platform === p.key);
              const apiDone = last?.status === "published" || last?.status === "draft" || last?.status === "manual";
              return (
                <div key={p.key} className="flex items-center gap-1">
                  <button
                    onClick={() => onSyndicate(slug, title, p.key)}
                    disabled={!!busy}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                      apiDone
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-white/15 bg-white/[0.03] text-[#c8d6e8] hover:border-white/30"
                    }`}
                    title={last ? `last: ${last.status}${last.platform_url ? ` — ${last.platform_url}` : ""}` : "Syndicate via platform API (human-gated)"}
                  >
                    {busy === busyKey ? "…" : p.label}
                  </button>
                  {/* LOCAL Playwright submit — the "same process as LinkedIn" path.
                      Copies the body/canonical + opens the editor + surfaces the local
                      script command. No API keys; the founder runs the script on their
                      own machine and clicks Publish themselves. */}
                  <button
                    onClick={() => onSyndicateLocal(slug, title, p.key)}
                    disabled={!!busy}
                    className="rounded-md border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-1.5 py-1 text-[10px] font-semibold text-[#f6bf84] disabled:opacity-40 hover:bg-[#f59f4f]/20"
                    title={`Submit (local Playwright) — opens ${p.label}'s editor + copies the body, then run scripts/syndicate-populate.ts on your machine to pre-fill + click Publish. No API keys.`}
                  >
                    {busy === localBusyKey ? "…" : "↗ local"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#7a9ab8]">
            <b className="text-[#f6bf84]">↗ local</b> = the LinkedIn-style path: opens the editor + copies the body, then run
            the local Playwright script to pre-fill + you click Publish. The plain buttons publish directly when API keys
            are set (otherwise they copy + open too). The body is the live article on www.inbharat.ai, with the canonical
            set so Google attributes the original to InBharat.
          </p>
          {rows.length > 0 && (
            <ul className="mt-2 space-y-1">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${SYND_STATUS_CHIP[r.status] ?? "bg-slate-500/15 text-slate-300"}`}>{SYND_STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="font-semibold text-[#c8d6e8]">{SYND_PLATFORMS.find((p) => p.key === r.platform)?.label ?? r.platform}</span>
                  {r.platform_url && (
                    <a href={r.platform_url} target="_blank" rel="noopener noreferrer" className="truncate text-[#7ab9e6] hover:underline">view ↗</a>
                  )}
                  <span className="ml-auto text-[#5f7c98]">{new Date(r.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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