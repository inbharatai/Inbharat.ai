import React, { useEffect, useState } from "react";
import { useAdminApi } from "../../../lib/growth/adminApi";

interface InboxItem {
  id: string;
  storage_path: string;
  kind: string;
  original_name: string | null;
  status: string;
  sha256: string | null;
  folder: string | null;
  fed_to_agent: boolean | null;
  post_order: number | null;
  alt_text: string | null;
  linked_draft_id: string | null;
  error: string | null;
  created_at: string;
  ingested_at: string | null;
  previewUrl?: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  ingested: "bg-emerald-500/15 text-emerald-300",
  error: "bg-rose-500/15 text-rose-300",
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function classifyKind(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md" || ext === "txt") return ext;
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return "other";
}

// ─── Social composer types ────────────────────────────────────────────────────

type SocialChannel = "instagram" | "linkedin";
type SocialKind = "image" | "carousel" | "video";

interface ValidationIssue {
  level: "ok" | "error" | "unverified";
  code: string;
  message: string;
}
interface ValidationResult {
  ok: boolean;
  unverified: boolean;
  issues: ValidationIssue[];
}
interface ComposeResult {
  ok: boolean;
  draftId: string;
  channel: SocialChannel;
  kind: SocialKind;
  caption: string | null;
  firstComment?: string | null;
  note?: string | null;
  validation: ValidationResult;
  itemCount: number;
}
interface PreviewMediaItem {
  inboxItemId: string;
  originalName: string | null;
  alt: string;
  kind: string | null;
  signedUrl: string | null;
}
interface PreviewResult {
  ok: boolean;
  draftId: string;
  status: string;
  channel: SocialChannel;
  kind: SocialKind;
  caption: string;
  firstComment?: string | null;
  media: PreviewMediaItem[];
}
interface DryRunStep {
  method: string;
  endpoint: string;
  payload?: Record<string, unknown> | null;
  note: string;
}
interface DryRunResult {
  ok: boolean;
  dryRun: { channel: SocialChannel; configured: boolean; steps: DryRunStep[]; notes: string[] };
}

// ─── Social Composer Panel ────────────────────────────────────────────────────

const SocialComposerPanel: React.FC<{ folder: string; items: InboxItem[]; onAnnotated: () => void }> = ({ folder, items, onAnnotated }) => {
  const { fetchJson } = useAdminApi();

  // Composer form state.
  const [channel, setChannel] = useState<SocialChannel>("instagram");
  const [kind, setKind] = useState<SocialKind>("image");
  const [articleSlug, setArticleSlug] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Post-compose actions.
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  // Per-item alt text (local state; saved on blur).
  const [altTexts, setAltTexts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of items) m[it.id] = it.alt_text ?? "";
    return m;
  });

  // Per-item order — sorted by post_order (null last, then created_at).
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    [...items]
      .sort((a, b) => {
        const ao = a.post_order ?? Infinity;
        const bo = b.post_order ?? Infinity;
        if (ao !== bo) return ao - bo;
        return a.created_at.localeCompare(b.created_at);
      })
      .map((i) => i.id),
  );
  const [reordering, setReordering] = useState(false);

  // Annotate an item's alt text on blur.
  async function saveAltText(itemId: string, text: string) {
    await fetchJson("/api/growth/inbox?action=annotate", {
      method: "POST",
      body: JSON.stringify({ itemId, altText: text }),
    });
    onAnnotated();
  }

  // Move item up/down in orderedIds, then POST reorder to persist.
  async function moveItem(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= orderedIds.length) return;
    const newOrder = [...orderedIds];
    [newOrder[idx], newOrder[next]] = [newOrder[next], newOrder[idx]];
    setOrderedIds(newOrder);
    setReordering(true);
    await fetchJson("/api/growth/inbox?action=reorder", {
      method: "POST",
      body: JSON.stringify({ order: newOrder.map((id, i) => ({ itemId: id, postOrder: i })) }),
    });
    setReordering(false);
  }

  // Compose the social draft.
  async function compose() {
    setComposing(true);
    setComposeResult(null);
    setComposeError(null);
    setPreviewResult(null);
    setDryRunResult(null);
    const { data, error } = await fetchJson<ComposeResult & { ok: boolean; error?: string; code?: string }>("/api/growth/social?action=compose", {
      method: "POST",
      body: JSON.stringify({ folder, channel, kind, articleSlug: articleSlug.trim() || undefined }),
    });
    setComposing(false);
    if (error || !data?.ok) {
      setComposeError(error || data?.error || data?.code || "compose failed");
      return;
    }
    setComposeResult(data as unknown as ComposeResult);
  }

  // Preview the draft (fresh signed URLs + caption).
  async function preview() {
    if (!composeResult?.draftId) return;
    setPreviewing(true);
    setPreviewResult(null);
    const { data, error } = await fetchJson<PreviewResult>("/api/growth/social?action=preview", {
      method: "POST",
      body: JSON.stringify({ draftId: composeResult.draftId }),
    });
    setPreviewing(false);
    if (error || !data?.ok) { setComposeError(error || "preview failed"); return; }
    setPreviewResult(data);
  }

  // Dry-run the draft (step plan, no API call).
  async function dryRun() {
    if (!composeResult?.draftId) return;
    setDryRunning(true);
    setDryRunResult(null);
    const { data, error } = await fetchJson<DryRunResult>("/api/growth/social?action=dryrun", {
      method: "POST",
      body: JSON.stringify({ draftId: composeResult.draftId }),
    });
    setDryRunning(false);
    if (error || !data?.ok) { setComposeError(error || "dry-run failed"); return; }
    setDryRunResult(data);
  }

  // Only show media items (image/video) for composing; skip text drops.
  const mediaItems = orderedIds
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is InboxItem => !!it && (it.kind === "image" || it.kind === "video"));

  return (
    <div className="mt-3 rounded-xl border border-[#f59f4f]/20 bg-[#f59f4f]/[0.02] p-3">
      <p className="text-[12px] font-semibold text-[#f59f4f]">Compose social post</p>

      {/* Channel + kind + article slug */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as SocialChannel)}
          className="rounded-md border border-white/10 bg-[#0a0f18] px-2 py-1 text-[11px] text-[#c0cfe0] outline-none"
        >
          <option value="instagram">Instagram</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SocialKind)}
          className="rounded-md border border-white/10 bg-[#0a0f18] px-2 py-1 text-[11px] text-[#c0cfe0] outline-none"
        >
          <option value="image">Image</option>
          <option value="carousel">Carousel</option>
          <option value="video">Video</option>
        </select>
        <input
          value={articleSlug}
          onChange={(e) => setArticleSlug(e.target.value)}
          placeholder="Article slug (optional)"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
        />
        <button
          onClick={compose}
          disabled={composing || mediaItems.length === 0}
          className="rounded-md bg-[#f59f4f] px-3 py-1 text-[11px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90 disabled:opacity-40"
        >
          {composing ? "Composing…" : "Compose"}
        </button>
      </div>
      {mediaItems.length === 0 && (
        <p className="mt-1 text-[11px] text-[#7a9ab8]">No image/video items in this folder — upload assets first.</p>
      )}

      {/* Per-item alt text + order controls */}
      {mediaItems.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] text-[#7a9ab8]">Media order &amp; alt text (saved on blur):</p>
          {mediaItems.map((it, idx) => (
            <div key={it.id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5">
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0 || reordering}
                  className="rounded px-1 py-0.5 text-[10px] text-[#7a9ab8] hover:bg-white/10 disabled:opacity-30"
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === mediaItems.length - 1 || reordering}
                  className="rounded px-1 py-0.5 text-[10px] text-[#7a9ab8] hover:bg-white/10 disabled:opacity-30"
                  title="Move down"
                >↓</button>
              </div>
              <span className="shrink-0 text-[10px] text-[#5f7c98]">#{idx + 1}</span>
              <p className="min-w-0 flex-1 truncate text-[11px] text-[#c8d6e8]">{it.original_name || it.id}</p>
              <input
                value={altTexts[it.id] ?? ""}
                onChange={(e) => setAltTexts((m) => ({ ...m, [it.id]: e.target.value }))}
                onBlur={() => saveAltText(it.id, altTexts[it.id] ?? "")}
                placeholder="Alt text…"
                className="w-44 shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Compose error */}
      {composeError && <p className="mt-2 text-[11px] text-rose-300">{composeError}</p>}

      {/* Compose result */}
      {composeResult && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <p className="text-[11px] font-semibold text-emerald-300">
            Draft created — ID {composeResult.draftId} · {composeResult.itemCount} item(s)
          </p>
          {composeResult.caption && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#c8d6e8]">{composeResult.caption}</p>
          )}
          {composeResult.firstComment && (
            <p className="mt-1 text-[10px] text-[#7a9ab8]">First comment: {composeResult.firstComment}</p>
          )}
          {composeResult.note && (
            <p className="mt-1 text-[10px] text-[#7a9ab8]">{composeResult.note}</p>
          )}

          {/* Validation issues */}
          {composeResult.validation.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {composeResult.validation.issues.map((iss, i) => (
                <p
                  key={i}
                  className={`text-[10px] ${iss.level === "error" ? "text-rose-300" : iss.level === "unverified" ? "text-amber-300" : "text-emerald-300"}`}
                >
                  <span className="font-bold uppercase">[{iss.level}]</span> {iss.code}: {iss.message}
                </p>
              ))}
            </div>
          )}

          {/* Hard-error blocker note */}
          {!composeResult.validation.ok && (
            <p className="mt-1 text-[11px] font-semibold text-rose-300">Validation errors block publishing — fix the media and recompose.</p>
          )}
          {composeResult.validation.unverified && composeResult.validation.ok && (
            <p className="mt-1 text-[11px] text-amber-300">Some constraints could not be verified server-side (marked amber above). Review before publishing.</p>
          )}

          {/* Publishing note */}
          <p className="mt-2 rounded-md border border-[#f59f4f]/20 bg-[#f59f4f]/[0.05] px-2 py-1 text-[10px] text-[#f6bf84]">
            Publishing happens from the Issues tab after approval — this draft is now in the pending queue.
          </p>

          {/* Preview + Dry-run actions */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={preview}
              disabled={previewing}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06] disabled:opacity-40"
            >
              {previewing ? "Loading…" : "Preview"}
            </button>
            <button
              onClick={dryRun}
              disabled={dryRunning}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#c0cfe0] hover:bg-white/[0.06] disabled:opacity-40"
            >
              {dryRunning ? "Loading…" : "Dry run"}
            </button>
          </div>

          {/* Preview result */}
          {previewResult && (
            <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <p className="text-[10px] font-semibold text-[#7a9ab8]">Preview · {previewResult.channel} {previewResult.kind}</p>
              <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#c8d6e8]">{previewResult.caption}</p>
              {previewResult.media.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {previewResult.media.map((m, i) => (
                    <div key={m.inboxItemId} className="flex flex-col items-center gap-0.5">
                      {m.signedUrl ? (
                        <a href={m.signedUrl} target="_blank" rel="noopener noreferrer">
                          <img src={m.signedUrl} alt={m.alt || m.originalName || `media ${i + 1}`} className="h-16 w-16 rounded object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded bg-white/[0.05] text-[9px] text-[#5f7c98]">{m.kind || "media"}</div>
                      )}
                      <span className="max-w-[64px] truncate text-[9px] text-[#5f7c98]">#{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dry-run result */}
          {dryRunResult && (
            <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <p className="text-[10px] font-semibold text-[#7a9ab8]">
                Dry run · {dryRunResult.dryRun.channel} · {dryRunResult.dryRun.configured ? "API configured" : "not configured"}
              </p>
              {dryRunResult.dryRun.notes.map((n, i) => (
                <p key={i} className="mt-0.5 text-[10px] text-amber-300">{n}</p>
              ))}
              {dryRunResult.dryRun.steps.map((step, i) => (
                <div key={i} className="mt-1.5 rounded border border-white/[0.05] bg-white/[0.02] p-1.5">
                  <p className="text-[10px] font-semibold text-[#c0cfe0]">{step.method} {step.endpoint.slice(0, 80)}{step.endpoint.length > 80 ? "…" : ""}</p>
                  <p className="text-[10px] text-[#7a9ab8]">{step.note}</p>
                  {step.payload && (
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[#5f7c98]">{JSON.stringify(step.payload).slice(0, 120)}…</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Inbox component ─────────────────────────────────────────────────────

const Inbox: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [targetFolder, setTargetFolder] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await fetchJson<{ items?: InboxItem[] }>("/api/growth/inbox");
    if (error) setError(error);
    else {
      setItems(data?.items || []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadOne(file: File, folder: string = ""): Promise<void> {
    setBusy(file.name);
    try {
      const sha = await sha256Hex(file);
      // 1. Get a signed upload URL (server checks ext + size; never sees the key in browser).
      const { data: sign, error: signErr } = await fetchJson<{ uploadUrl?: string; path?: string }>(
        `/api/growth/inbox?action=sign`,
        { method: "POST", body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, sha256: sha, folder }) },
      );
      if (signErr || !sign?.uploadUrl) {
        setError(`Sign failed for ${file.name}: ${signErr || "no url"}`);
        return;
      }
      // 2. PUT the file directly to Supabase Storage (signed URL — no service key in browser).
      const put = await fetch(sign.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) {
        setError(`Upload failed for ${file.name}: HTTP ${put.status}`);
        return;
      }
      // 3. Confirm — dedup on (sha256, folder), insert the tracking row.
      const { error: confirmErr } = await fetchJson(`/api/growth/inbox?action=confirm`, {
        method: "POST",
        body: JSON.stringify({ path: sign.path, sha256: sha, kind: classifyKind(file.name), originalName: file.name, folder }),
      });
      if (confirmErr) setError(`Confirm failed for ${file.name}: ${confirmErr}`);
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function onFiles(files: FileList | File[], folder?: string) {
    const arr = Array.from(files);
    const f = folder ?? targetFolder ?? "";
    for (const file of arr) await uploadOne(file, f);
  }

  /** Folder upload: <input webkitdirectory> gives each file a webkitRelativePath
   *  like 'myFolder/sub/file.md'. Use the TOP-LEVEL folder name as the inbox
   *  folder so a dropped folder becomes one inbox group the agent can feed on. */
  async function onFolderFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const top = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "";
    for (const file of arr) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      // Preserve the relative sub-path under the top folder so nested structure is kept.
      const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : top;
      await uploadOne(file, folder);
    }
  }

  async function feedFolder(folder: string, feed: boolean) {
    const { error } = await fetchJson(`/api/growth/inbox?action=${feed ? "feed" : "unfeed"}`, {
      method: "POST",
      body: JSON.stringify({ folder }),
    });
    if (error) setError(error);
    else await load();
  }

  // Group items by folder for the folder tree. Root items (folder '' ) sit in
  // the "(root)" group. anyIngested gates the Feed button (nothing to feed until
  // the daily cron has ingested text drops into drafts).
  const folderGroups = (() => {
    const map = new Map<string, InboxItem[]>();
    for (const it of items) {
      const f = it.folder ?? "";
      const list = map.get(f) ?? [];
      list.push(it);
      map.set(f, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([folder, groupItems]) => ({
        folder,
        items: groupItems,
        anyFed: groupItems.some((i) => i.fed_to_agent),
        anyIngested: groupItems.some((i) => i.status === "ingested"),
      }));
  })();

  async function remove(id: string, status: string) {
    if (status === "ingested") {
      setError("Cannot delete an ingested item (it produced a draft).");
      return;
    }
    const { error } = await fetchJson("/api/growth/inbox", { method: "DELETE", body: JSON.stringify({ itemId: id }) });
    if (error) setError(error);
    else await load();
  }

  /** Phase 2: save an inbox item as a KB 'source' row so the agent retrieves it
   *  before future drafts. Best-effort — surfaces success/fail inline. */
  async function saveToKb(it: InboxItem) {
    setBusy(`kb:${it.id}`);
    try {
      const title = (it.original_name || it.storage_path || "").replace(/\.[^.]+$/, "");
      const { error } = await fetchJson("/api/growth/knowledge", {
        method: "POST",
        body: JSON.stringify({ type: "source", title, sourceType: "user_note", topicCluster: it.folder || null, status: "approved" }),
      });
      if (error) setError(`Save to KB failed: ${error}`);
      else setError(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Content inbox</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Drop articles, assets, topics, or videos here. They upload to a private bucket, and the daily cron turns text
        drops into human-gated draft outlines (media becomes a candidate for the LinkedIn publish flow). Duplicates are
        skipped by content hash.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void onFiles(e.dataTransfer.files); }}
          className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? "border-[#f59f4f]/60 bg-[#f59f4f]/5" : "border-white/15 hover:border-white/25"}`}
        >
          <input type="file" multiple className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
          <p className="text-[14px] font-semibold text-white">Drop files here or click to browse</p>
          <p className="mt-1 text-[12px] text-[#7a9ab8]">.md · .txt · .png · .jpg · .mp4 — up to 50 MB each</p>
        </label>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 p-8 text-center transition-colors hover:border-white/25">
          {/* webkitdirectory uploads a whole folder; each file carries webkitRelativePath.
              Spread-cast to bypass TS (webkitdirectory isn't in React's input types). */}
          <input type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => e.target.files && onFolderFiles(e.target.files)} />
          <p className="text-[14px] font-semibold text-white">Upload a folder</p>
          <p className="mt-1 text-[12px] text-[#7a9ab8]">Loads a folder of assets the agent can access & review</p>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#7a9ab8]">Place single-file drops into folder:</span>
        <input
          value={targetFolder}
          onChange={(e) => setTargetFolder(e.target.value)}
          placeholder="(optional) e.g. campaigns/launch"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
        />
      </div>
      {busy && <p className="mt-3 text-[12px] text-[#f59f4f]">Uploading {busy}…</p>}

      {error && <p className="mt-4 text-[13px] text-rose-300">{error}</p>}
      {loading && <p className="mt-4 text-[13px] text-[#7a9ab8]">Loading…</p>}

      <div className="mt-6 space-y-4">
        {folderGroups.map(({ folder, items: groupItems, anyFed, anyIngested }) => (
          <div key={folder} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-white">
                {folder || "(root)"} <span className="ml-1 text-[11px] font-normal text-[#7a9ab8]">· {groupItems.length} item(s)</span>
              </p>
              <div className="flex items-center gap-2">
                {anyFed && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">fed to agent</span>}
                <button
                  onClick={() => feedFolder(folder, !anyFed)}
                  disabled={!anyIngested}
                  className="rounded-md border border-[#f59f4f]/30 px-2.5 py-1 text-[11px] text-[#f59f4f] hover:bg-[#f59f4f]/10 disabled:opacity-30"
                  title={anyIngested ? (anyFed ? "Hide this folder's assets from agent context" : "Mark this folder's ingested assets as agent context") : "Ingest items first (daily cron) before feeding"}
                >
                  {anyFed ? "Unfeed" : "Feed to agent"}
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {groupItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-white">{it.original_name || it.storage_path}</p>
                    <p className="mt-0.5 text-[11px] text-[#7a9ab8]">
                      {it.kind} · {it.sha256?.slice(0, 10)} · {new Date(it.created_at).toLocaleString()}
                      {it.status === "error" && it.error && <span className="text-rose-300"> — {it.error}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[it.status] || "bg-slate-500/15 text-slate-300"}`}>{it.status}</span>
                    {it.previewUrl && (
                      <a href={it.previewUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#f59f4f] hover:underline">preview</a>
                    )}
                    <button
                      onClick={() => saveToKb(it)}
                      disabled={busy === `kb:${it.id}`}
                      className="rounded-md border border-sky-500/20 px-2.5 py-1 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-30"
                      title="Save this item to the knowledge base (retrieved before future drafts)"
                    >
                      {busy === `kb:${it.id}` ? "Saving…" : "Save to KB"}
                    </button>
                    <button
                      onClick={() => remove(it.id, it.status)}
                      disabled={it.status === "ingested"}
                      className="rounded-md border border-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Social composer panel — shown per folder, always visible */}
            <SocialComposerPanel
              folder={folder}
              items={groupItems}
              onAnnotated={load}
            />
          </div>
        ))}
        {!loading && items.length === 0 && <p className="text-[13px] text-[#7a9ab8]">No items yet.</p>}
      </div>
    </div>
  );
};

export default Inbox;
