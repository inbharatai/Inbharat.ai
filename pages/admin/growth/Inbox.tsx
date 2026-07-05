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
          </div>
        ))}
        {!loading && items.length === 0 && <p className="text-[13px] text-[#7a9ab8]">No items yet.</p>}
      </div>
    </div>
  );
};

export default Inbox;