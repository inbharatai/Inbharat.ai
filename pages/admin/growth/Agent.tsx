import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { useVoiceInput, useVoiceOutput, buildContextBlock } from "../../../lib/speech";
import PipelineStrip from "../../../components/growth/PipelineStrip";
import MarkdownText from "../../../components/growth/MarkdownText";

/**
 * /admin/growth/agent — the conversational CMO agent (Phase C) + Auto Mode (C5).
 *
 * Chat panel: the founder types commands; the agent executes tools (redraft
 * captions, generate covers, analyze images) and narrates what it did. Every
 * artifact is a human-gated draft in Issues — the agent never publishes.
 *
 * Attachments (C4): a paperclip uploads images/folders/videos into the inbox
 * pipeline (folder 'agent-chat') and passes their itemIds to the turn so the
 * agent can analyze them on command ("analyze this"). Like any AI tool's input.
 *
 * Auto Mode (C5): ON/OFF toggle. While on, a cron loop drafts pending work
 * autonomously (still human-gated publish). auto-approve (off by default) also
 * marks pending drafts approved. The founder flips it whenever they want.
 */

interface AgentMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: { ok?: boolean; message?: string; [k: string]: unknown } | null;
  createdAt: string;
}

interface Thread {
  id: string;
  title: string;
  updatedAt: string;
}

interface AutoMode {
  enabled: boolean;
  autoApprove: boolean;
  cadenceMinutes: number;
  maxTasksPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string | null;
}

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

/** One-click starter prompts — so the founder can see HOW to ask the agent to
 *  do things (the most common pain: "I can't see how to ask it to do tasks"). */
const EXAMPLE_PROMPTS: string[] = [
  "Review & upgrade an article (paste it below)",
  "Write an article on RAG in plain English",
  "Draft a LinkedIn caption about our latest feature",
  "Make a cover for the article draft I just made",
  "Search the web for the latest Gemini model",
  "Make a post AND an article from the article in my inbox",
];

const Agent: React.FC = () => {
  const { fetchJson } = useAdminApi();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ itemId: string; name: string; kind: string }[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [auto, setAuto] = useState<AutoMode | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [morningRunning, setMorningRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stripKey, setStripKey] = useState(0);
  const [searchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Phase 4: Voice Command Center. Mic → STT feeds the input textarea (the founder
  // still clicks Send — nothing auto-submits/publishes). TTS toggle reads back the
  // latest agent reply via free browser speechSynthesis. Both no-op when unsupported.
  const location = useLocation();
  const [ttsOn, setTtsOn] = useState(false);
  const [interim, setInterim] = useState("");
  // Phase 4 screen-awareness: pending draft count for the voice context block
  // (so "what should I publish today?" gets a real answer, not a guess). Fetched
  // from the existing /api/growth/pipeline bundle on mount + after each send.
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  // TTS: only narrate NEW assistant arrivals while ttsOn — never re-narrate a
  // stale last message on toggle, and never narrate across a thread switch.
  const lastSpokenIdRef = useRef<string | null>(null);
  const voice = useVoiceInput({
    onFinal: (t) => { setInterim(""); setInput((prev) => (prev ? prev + " " : "") + t); },
    onInterim: (t) => setInterim(t),
  });
  const tts = useVoiceOutput();

  // Cross-tab signal: when an agent run creates drafts, tell any open Issues
  // tab to refresh + toast. BroadcastChannel does not deliver to the posting
  // context, so the same-tab case (run here → navigate to Issues) is handled by
  // the Issues page's localStorage pending-delta check on its own mount.
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("growth-admin");
    channelRef.current = ch;
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  /** Bump the pipeline strip refresh key + ping any other tab that drafts moved. */
  function notifyDraftsUpdated() {
    setStripKey((k) => k + 1);
    void loadPendingCount();
    try { channelRef.current?.postMessage({ type: "drafts-updated" }); } catch { /* ignore */ }
  }

  /** Fetch the pipeline bundle + count pending drafts for the voice context block. */
  async function loadPendingCount() {
    const { data } = await fetchJson<{ article?: { status?: string } | null; linkedin?: { status?: string } | null; cover?: { status?: string } | null }>("/api/growth/pipeline");
    if (!data) return;
    const parts = [data.article, data.linkedin, data.cover].filter(Boolean) as { status?: string }[];
    setPendingDraftCount(parts.filter((p) => p.status === "pending").length);
  }

  async function loadThreads() {
    const { data, error } = await fetchJson<{ threads?: Thread[] }>("/api/growth/agent");
    if (error) setError(error);
    else setThreads(data?.threads || []);
  }

  async function loadAuto() {
    const { data, error } = await fetchJson<{ mode?: AutoMode }>("/api/growth/auto");
    if (error) setError(error);
    else if (data?.mode) setAuto(data.mode);
  }

  useEffect(() => {
    void loadThreads();
    void loadAuto();
    void loadPendingCount();
    // Deep-link preselect: ?thread=<id> (from an Issues "View in Agent" link)
    // opens that conversation directly instead of the blank new-chat state.
    const t = searchParams.get("thread");
    if (t) setActiveId(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void (async () => {
      const { data, error } = await fetchJson<{ messages?: AgentMessage[] }>(`/api/growth/agent?threadId=${encodeURIComponent(activeId)}`);
      if (error) setError(error);
      else setMessages(data?.messages || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Phase 4: TTS read-back — narrate only NEW assistant replies while ttsOn.
  // Never re-narrate a stale last message when the founder toggles TTS on, and
  // never narrate across a thread switch (lastSpokenIdRef guards both). Tool-
  // only messages are skipped (no spoken content). When the reply is longer
  // than 500 chars, append a short "truncated" cue so the founder knows there's
  // more on screen rather than hearing the agent stop mid-sentence.
  useEffect(() => {
    if (!ttsOn || !tts.supported) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    if (lastSpokenIdRef.current === last.id) return;
    lastSpokenIdRef.current = last.id;
    const text = last.content.length > 500
      ? `${last.content.slice(0, 500)}… (truncated — see the full reply on screen)`
      : last.content;
    tts.speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsOn]);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setError(null);
    setNotice(null);
  }

  async function deleteThreadFn(id: string) {
    const { error } = await fetchJson(`/api/growth/agent?threadId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (error) { setError(error); return; }
    if (activeId === id) newChat();
    void loadThreads();
  }

  async function uploadAttachment(file: File): Promise<void> {
    setUploading(file.name);
    try {
      const sha = await sha256Hex(file);
      const { data: sign, error: signErr } = await fetchJson<{ uploadUrl?: string; path?: string }>(
        "/api/growth/inbox?action=sign",
        { method: "POST", body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, sha256: sha, folder: "agent-chat" }) },
      );
      if (signErr || !sign?.uploadUrl) { setError(`Sign failed for ${file.name}: ${signErr || "no url"}`); return; }
      const put = await fetch(sign.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) { setError(`Upload failed for ${file.name}: HTTP ${put.status}`); return; }
      const { data: conf, error: confErr } = await fetchJson<{ itemId?: string }>("/api/growth/inbox?action=confirm", {
        method: "POST",
        body: JSON.stringify({ path: sign.path, sha256: sha, kind: classifyKind(file.name), originalName: file.name, folder: "agent-chat" }),
      });
      if (confErr || !conf?.itemId) { setError(`Confirm failed for ${file.name}: ${confErr}`); return; }
      setAttachments((a) => [...a, { itemId: conf.itemId!, name: file.name, kind: classifyKind(file.name) }]);
    } finally {
      setUploading(null);
    }
  }

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    void Promise.all(Array.from(files).map((f) => uploadAttachment(f)));
  }

  async function send() {
    const raw = input.trim();
    if (!raw || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    // Stop any in-progress TTS narration so the previous reply doesn't talk
    // over the founder's new message during the "agent is working…" wait.
    if (ttsOn) tts.cancel();
    const attIds = attachments.map((a) => a.itemId);
    // Phase 4: append a screen-awareness context block so the agent knows where
    // the founder is when issuing a voice command ("what should I publish
    // today?"). pendingDraftCount comes from the live pipeline bundle so the
    // agent can answer queue questions without an extra tool round-trip.
    const activeTitle = threads.find((t) => t.id === activeId)?.title ?? null;
    const ctx = buildContextBlock({
      pathname: location.pathname,
      pendingDraftCount,
      activeThreadTitle: activeTitle,
      viewing: "agent command center",
    });
    const text = ctx ? `${raw}\n\n${ctx}` : raw;
    // Optimistic user echo (show the founder's words, not the context block).
    const optimistic: AgentMessage = {
      id: `tmp-${Date.now()}`, threadId: activeId ?? "", role: "user", content: raw,
      toolName: null, toolArgs: null, toolResult: null, createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setInterim("");
    const { data, error } = await fetchJson<{ threadId?: string; reply?: string | null; messages?: AgentMessage[] }>(
      "/api/growth/agent",
      { method: "POST", body: JSON.stringify({ message: text, threadId: activeId ?? undefined, attachmentItemIds: attIds.length ? attIds : undefined }) },
    );
    setSending(false);
    if (error) { setError(error); return; }
    if (data?.threadId && data.threadId !== activeId) {
      setActiveId(data.threadId);
      void loadThreads();
    }
    if (data?.messages) setMessages(data.messages);
    setAttachments([]); // attachments are per-turn
    notifyDraftsUpdated();
  }

  async function toggleAuto(patch: Partial<AutoMode>) {
    setAutoBusy(true);
    const { data, error } = await fetchJson<{ mode?: AutoMode }>("/api/growth/auto", { method: "POST", body: JSON.stringify(patch) });
    setAutoBusy(false);
    if (error) setError(error);
    else if (data?.mode) setAuto(data.mode);
  }

  async function runNow() {
    setRunning(true);
    const { data, error } = await fetchJson<{ summary?: string; ran?: boolean }>("/api/growth/auto?action=run", { method: "POST" });
    setRunning(false);
    if (error) setError(error);
    else if (data?.summary) setError(null);
    void loadAuto();
    void loadThreads();
    notifyDraftsUpdated();
  }

  /** Trigger the daily 8am "Build with Reeturaj" auto-plan run on demand — same
   *  handler Vercel's cron hits at 02:30 UTC. Drafts an article + LinkedIn caption
   *  + cover into the "Build with Reeturaj — Daily Plan" thread; nothing publishes. */
  async function runMorning() {
    if (morningRunning) return;
    setMorningRunning(true);
    setError(null);
    setNotice(null);
    const { data, error } = await fetchJson<{ ok?: boolean; topic?: string; mode?: string; reply?: string | null; note?: string | null; toolTrail?: { name: string; ok: boolean; message: string }[] }>("/api/growth/cron/morning", { method: "POST" });
    setMorningRunning(false);
    if (error) { setError(error); return; }
    // The run appends to the daily-plan thread — refresh the list so it surfaces.
    void loadThreads();
    notifyDraftsUpdated();
    const trail = formatMorningTrail(data?.toolTrail);
    // The cron reports the agent outcome honestly (body ok = agent outcome).
    // A failed turn (note "model not configured" / "no db" / "budget exhausted")
    // creates ZERO drafts — surface the actionable reason + the tool trail so the
    // founder sees EXACTLY which tool failed and why, instead of a single opaque
    // (often null) reply. The trail also catches the partial-run case where the
    // turn returned ok:true (e.g. budget exhausted mid-turn) but drafted nothing.
    if (data && data.ok === false) {
      setError(morningFailMessage(data.note, data.reply) + (trail ? `\n${trail}` : ""));
      return;
    }
    // ok:true, but did write_article actually succeed? A turn can return ok:true
    // with zero drafts (budget exhausted at turn start returns ok:true + note;
    // or the model answered in text and never called write_article). Only claim
    // "drafted" when the trail shows write_article succeeded — otherwise show the
    // trail as an honest "nothing drafted" notice.
    const wroteArticle = !!(data?.toolTrail && data.toolTrail.some((t) => t.name === "write_article" && t.ok));
    if (wroteArticle) {
      setNotice(`Morning plan drafted: "${data?.topic}" (${data?.mode}). Review the Daily Plan thread + Issues.${trail ? `\n${trail}` : ""}`);
    } else {
      setError(`Morning plan ran but drafted no new article — nothing was written.${trail ? `\n${trail}` : ""}${data?.note ? `\n(note: ${data.note})` : ""}`);
    }
  }

  /** Render the morning run's tool trail as a compact, scannable line so the
   *  founder sees exactly which tools ran and what each returned — e.g.
   *  "write_article ✗ article model not configured or monthly budget exhausted".
   *  Empty string when no tools ran (model answered in text or failed pre-loop). */
  function formatMorningTrail(trail: { name: string; ok: boolean; message: string }[] | undefined): string {
    if (!trail || trail.length === 0) return "";
    return "Tools: " + trail.map((t) => `${t.name} ${t.ok ? "✓" : "✗"}${t.message ? ` ${t.message}` : ""}`).join("  |  ");
  }

  /** Map the agent-turn failure `note` to a founder-actionable message. */
  function morningFailMessage(note: string | null | undefined, reply: string | null | undefined): string {
    switch (note) {
      case "no db":
        return "Morning plan ran but drafted nothing — Supabase isn't configured in Vercel env. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY so the agent can persist drafts.";
      case "model not configured":
        return "Morning plan ran but drafted nothing — no growth model key in Vercel env. Set GEMINI_API_KEY (or GROWTH_OPENAI_API_KEY) so the agent can draft.";
      case "budget exhausted":
        return "Morning plan ran but drafted nothing — the monthly growth budget is exhausted. Raise the cap in Settings.";
      default:
        return `Morning plan ran but drafted nothing — ${reply || note || "the agent returned no draft."}`;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Growth Agent</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
        Chat with your expert fractional CMO. It understands plain English and executes on command — reviews and upgrades text you paste,
        drafts articles + LinkedIn posts, generates covers (matching a sample you drop in the inbox so every cover looks consistent),
        analyzes images, and searches the web for current facts. Everything it makes lands in Issues for your approval; it never publishes on its own.
      </p>

      <div className="mt-5">
        <PipelineStrip variant="agent" refreshKey={stripKey} />
      </div>

      {error && <p className="mt-3 text-[12px] text-rose-300">{error}</p>}
      {notice && <p className="mt-3 text-[12px] text-[#f59f4f]">{notice}</p>}

      {/* ─── Auto Mode panel ─────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${auto?.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300"}`}>
              {auto?.enabled ? "Auto Mode ON" : "Auto Mode OFF"}
            </span>
            {auto?.autoApprove && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">auto-approve</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={runNow} disabled={running} className="rounded-md border border-[#f59f4f]/30 px-3 py-1.5 text-[12px] text-[#f59f4f] hover:bg-[#f59f4f]/10 disabled:opacity-40">
              {running ? "Running…" : "Run now"}
            </button>
            <button
              onClick={() => toggleAuto({ enabled: !auto?.enabled })}
              disabled={autoBusy}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${auto?.enabled ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30" : "bg-[#f59f4f] text-[#0a0c10] hover:bg-[#f59f4f]/90"} disabled:opacity-40`}
            >
              {auto?.enabled ? "Turn OFF" : "Turn ON"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#7a9ab8]">
          When ON, the agent autonomously drafts captions + covers for articles that lack them (budget-guarded, up to {auto?.maxTasksPerRun ?? 5}/run). Publish stays your click.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-[#c0cfe0]">
            <input
              type="checkbox"
              checked={!!auto?.autoApprove}
              disabled={autoBusy}
              onChange={(e) => toggleAuto({ autoApprove: e.target.checked })}
              className="accent-amber-500"
            />
            <span className="text-amber-300">Auto-approve pending drafts</span>
            <span className="text-[10px] text-[#7a9ab8]">(marks drafts approved so they&apos;re ready to ship; still no auto-publish)</span>
          </label>
        </div>
        {auto?.lastRunSummary && (
          <p className="mt-2 text-[11px] text-[#7a9ab8]">
            Last run{auto.lastRunAt ? ` ${new Date(auto.lastRunAt).toLocaleString()}` : ""}: {auto.lastRunSummary}
          </p>
        )}
      </div>

      {/* ─── Chat: thread list + panel ───────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-56">
          <button onClick={newChat} className="w-full rounded-lg bg-[#f59f4f] px-3 py-2 text-[12px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90">+ New chat</button>
          <button
            onClick={() => void runMorning()}
            disabled={morningRunning}
            className="mt-1 w-full rounded-lg border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-2 text-[12px] font-medium text-[#f59f4f] hover:bg-[#f59f4f]/20 disabled:opacity-50"
            title="Run the daily 8am auto-plan now — drafts one article + LinkedIn caption + cover into the Daily Plan thread (nothing publishes)"
          >
            {morningRunning ? "Planning today's article…" : "☀️ Run morning plan now"}
          </button>
          <div className="mt-2 space-y-1">
            {threads.map((t) => (
              <div key={t.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setActiveId(t.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-[12px] ${activeId === t.id ? "bg-[#f59f4f]/10 text-[#f59f4f] ring-1 ring-[#f59f4f]/30" : "text-[#9fb2c6] hover:bg-white/[0.04]"}`}
                  title={t.title}
                >
                  {t.title}
                </button>
                <button
                  onClick={() => void deleteThreadFn(t.id)}
                  className="shrink-0 rounded px-1.5 py-1 text-[11px] text-[#5f7c98] opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                  title="Delete conversation"
                >
                  ✕
                </button>
              </div>
            ))}
            {threads.length === 0 && <p className="px-2 text-[11px] text-[#5f7c98]">No conversations yet.</p>}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.02]">
          <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-[13px] text-[#9fb2c6]">
                  Ask the agent to do something — it drafts, reviews, generates covers, and searches the web. Everything it makes lands in <span className="text-[#f59f4f]">Issues</span> for your approval before it ships.
                </p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setInput(ex)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-[#c0cfe0] transition hover:border-[#f59f4f]/40 hover:text-white"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-[1.6] text-[#7a9ab8]">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-[#9fb2c6]">How publishing works</p>
                  <p>• <span className="text-[#c0cfe0]">Articles</span> → approve in Issues → Publish → live on <span className="text-[#c0cfe0]">inbharat.ai/learn-ai-with-reeturaj</span> (cover ships with it).</p>
                  <p>• <span className="text-[#c0cfe0]">LinkedIn captions</span> → approve → Publish → a one-click share link. To auto-fill the composer, run <span className="text-[#c0cfe0]">scripts/linkedin-populate.ts</span> locally.</p>
                  <p>• <span className="text-[#c0cfe0]">Covers</span> → approve → Publish → commits the PNG + wires it to the article. Drop a sample cover in the inbox and ask the agent to use it as the style to keep every cover consistent.</p>
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`mb-3 ${m.role === "user" ? "text-right" : ""}`}>
                {m.role === "user" && <div className="inline-block max-w-[85%] rounded-lg bg-[#f59f4f]/15 px-3 py-2 text-left text-[13px] text-white">{m.content}</div>}
                {m.role === "assistant" && m.content && (
                  <div className="max-w-[90%] rounded-lg bg-white/[0.04] px-3 py-2">
                    <MarkdownText className="text-[13px]">{m.content}</MarkdownText>
                  </div>
                )}
                {m.role === "tool" && (
                  <div className="max-w-[90%] rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-[11px] text-[#7a9ab8]">
                    <span className="text-[#f59f4f]">🔧 {m.toolName}</span> → {m.toolResult?.message ?? (m.toolResult?.ok ? "ok" : "no detail")}
                    {typeof m.toolResult?.draftId === "string" && m.toolResult.draftId && (
                      <Link
                        to={`/admin/growth/issues?draft=${encodeURIComponent(m.toolResult.draftId)}`}
                        className="ml-2 rounded border border-[#f59f4f]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#f6bf84] hover:bg-[#f59f4f]/10"
                        title="Open this draft in Issues to review + approve"
                      >
                        Open in Issues ↗
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && <div className="mb-3 text-[12px] text-[#7a9ab8]">Agent is working…</div>}
          </div>

          {/* attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-white/5 px-3 py-2">
              {attachments.map((a) => (
                <span key={a.itemId} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-[#c0cfe0]">
                  📎 {a.name} <span className="text-[#5f7c98]">({a.kind})</span>
                </span>
              ))}
            </div>
          )}
          {uploading && <p className="px-3 text-[11px] text-[#f59f4f]">Uploading {uploading}…</p>}
          {/* Phase 4: live STT interim transcript (shown as a muted line, NOT merged
              into the textarea value — merging would cause cursor-jump/duplication). */}
          {voice.listening && interim && (
            <p className="px-3 pt-2 text-[11px] italic text-[#7a9ab8]">… {interim}</p>
          )}

          {/* composer */}
          <div className="flex items-end gap-2 border-t border-white/10 p-3">
            <label className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-2 text-[#9fb2c6] hover:border-white/25" title="Attach images / files / folders">
              <input type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
              📎
            </label>
            <label className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-2 text-[#9fb2c6] hover:border-white/25" title="Attach a folder">
              <input type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => onPickFiles(e.target.files)} />
              📁
            </label>
            {voice.supported && (
              <button
                onClick={voice.toggle}
                className={`rounded-lg border px-2.5 py-2 text-[13px] ${voice.listening ? "border-rose-400/50 bg-rose-500/15 text-rose-300 animate-pulse" : "border-white/10 text-[#9fb2c6] hover:border-white/25"}`}
                title={voice.listening ? "Listening… click to stop" : "Speak your command (mic → text); you still click Send"}
              >
                {voice.listening ? "●" : "🎙"}
              </button>
            )}
            {tts.supported && (
              <button
                onClick={() => { if (ttsOn) tts.cancel(); setTtsOn((v) => !v); }}
                className={`rounded-lg border px-2.5 py-2 text-[13px] ${ttsOn ? "border-[#f59f4f]/50 bg-[#f59f4f]/15 text-[#f59f4f]" : "border-white/10 text-[#9fb2c6] hover:border-white/25"}`}
                title={ttsOn ? "Voice read-back ON — click to stop" : "Turn on voice read-back of agent replies"}
              >
                🔊
              </button>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              rows={1}
              placeholder={voice.listening ? "Listening… (speak, then review + Send)" : "Tell the agent what to do… (Enter to send, Shift+Enter for newline)"}
              className="min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-[#0a0f18] px-3 py-2 text-[13px] text-white placeholder:text-[#5f7c98] focus:border-[#f59f4f]/50 focus:outline-none"
            />
            <button onClick={send} disabled={sending || !input.trim()} className="rounded-lg bg-[#f59f4f] px-4 py-2 text-[13px] font-semibold text-[#0a0c10] hover:bg-[#f59f4f]/90 disabled:opacity-40">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Agent;