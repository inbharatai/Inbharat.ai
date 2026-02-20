import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message, AgentMode } from "../types";
import SourceCard from "./SourceCard";
import TricolourStar from "./TricolourStar";
import { AgentWidgetRenderer } from "./AgentWidgets";
import CoderResponsePanel from "./CoderResponsePanel";
import { Layers, Sparkles, MessageSquare, Volume2, VolumeX, Loader2, Copy, RefreshCw, RotateCcw } from "lucide-react";
import { NexusAgent } from "../services/openaiService";
import { getVoiceSettings } from "../lib/settings";

const ERROR_MESSAGE_MARKER = "We're experiencing heavy neural traffic";

function isErrorContent(content: string): boolean {
  return (
    content.includes(ERROR_MESSAGE_MARKER) ||
    content.includes("Service is busy right now") ||
    content.includes("Too many requests") ||
    content.includes("Something went wrong")
  );
}

/** Strip fenced code blocks so prose can be shown without duplicating the code panel. */
function stripCodeBlocks(content: string): string {
  const withPlaceholder = content.replace(/```[\w]*\n?[\s\S]*?```/g, '\n*Code shown in the panel above.*\n');
  return withPlaceholder.replace(/(\*Code shown in the panel above\.\*\s*\n)(\s*\*Code shown in the panel above\.\*\s*\n)+/g, '$1').trim();
}

interface ChatViewProps {
  messages: Message[];
  onFollowUpClick?: (query: string) => void;
  appLanguage?: string;
  activeMode?: AgentMode;
  isLoading?: boolean;
  onStop?: () => void;
  onRegenerate?: (query: string, mode: AgentMode, language: string, imageUrl?: string) => void;
  lastUserMessage?: Message | null;
}

const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onFollowUpClick,
  appLanguage = "EN",
  activeMode = AgentMode.STANDARD,
  isLoading = false,
  onStop: _onStop,
  onRegenerate,
  lastUserMessage,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  const handleStopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
      setPlayingId(null);
    }
  }, []);

  const handleCopy = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  const isLastAssistant = (msgIdx: number) =>
    msgIdx === messages.length - 1 && messages[messages.length - 1]?.role === "assistant";
  const isErrorMessage = (msg: Message) => !!msg.errorCode || isErrorContent(msg.content);

  const [, setCooldownTick] = useState(0);
  const lastAssistant = messages.length > 0 && messages[messages.length - 1]?.role === "assistant" ? messages[messages.length - 1] : null;
  const retryCooldownMs =
    lastAssistant?.errorCode && lastAssistant.retryAfterSeconds != null && lastAssistant.errorShownAt != null
      ? Math.max(0, lastAssistant.errorShownAt + lastAssistant.retryAfterSeconds * 1000 - Date.now())
      : 0;
  const retryDisabled = retryCooldownMs > 0;

  useEffect(() => {
    if (retryCooldownMs <= 0) return;
    const interval = setInterval(() => setCooldownTick((c) => c + 1), 1000);
    return () => clearInterval(interval);
  }, [retryCooldownMs, lastAssistant?.id, lastAssistant?.errorShownAt, lastAssistant?.retryAfterSeconds]);

  const lastPlayedAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!getVoiceSettings().autoRead || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || last.id === lastPlayedAutoRef.current) return;
    if (last.errorCode || isErrorContent(last.content)) return;
    lastPlayedAutoRef.current = last.id;
    void handlePlayAudio(last);
    // Intentionally only depend on messages; handlePlayAudio is current by closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handlePlayAudio = async (message: Message) => {
    if (loadingAudioId || playingId === message.id) return;
    if (message.errorCode || isErrorContent(message.content)) return;
    handleStopSpeaking();
    setAudioErrorId(null);
    setLoadingAudioId(message.id);
    const agent = new NexusAgent();
    try {
      const audioBase64 = await agent.textToSpeech(message.content, appLanguage);
      if (audioBase64) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const rate = getVoiceSettings().speechRate;
        if (rate >= 0.5 && rate <= 2) audio.playbackRate = rate;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          setPlayingId(null);
        };
        audio.onerror = () => {
          setPlayingId(null);
          setAudioErrorId(message.id);
          currentAudioRef.current = null;
        };
        currentAudioRef.current = audio;
        setPlayingId(message.id);
        await audio.play();
      } else {
        setAudioErrorId(message.id);
      }
    } catch (err) {
      console.error("Audio playback error:", err);
      setAudioErrorId(message.id);
    } finally {
      setLoadingAudioId(null);
    }
  };

  return (
    <div className="space-y-8 sm:space-y-10 max-w-3xl mx-auto">
      {messages.map((msg, msgIdx) => (
        <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-3 duration-500">
          {/* ——— User message card ——— */}
          {msg.role === 'user' && (
            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center text-gray-400 shadow-sm">
                <span className="text-base sm:text-lg" aria-hidden>👤</span>
              </div>
              <div className="flex-1 min-w-0 rounded-2xl sm:rounded-3xl bg-[#161b22]/80 border border-[#30363d]/60 px-4 sm:px-5 py-4 sm:py-5 shadow-sm">
                <p className="text-base sm:text-lg md:text-xl font-semibold text-white leading-snug break-words">
                  {msg.content}
                </p>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Attached" className="mt-3 rounded-xl max-h-40 object-cover border border-[#30363d]/50" />
                )}
              </div>
            </div>
          )}

          {/* ——— Assistant message card ——— */}
          {msg.role === 'assistant' && (
            <div className="flex gap-3 sm:gap-4 md:gap-5">
              <div className="hidden sm:flex flex-shrink-0 flex-col items-center">
                <div className="w-10 h-10 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center shadow-md">
                  <TricolourStar size={22} />
                </div>
                <div className="w-px flex-1 min-h-[60px] mt-2 bg-gradient-to-b from-[#30363d] to-transparent rounded-full" />
              </div>

              <div className="flex-1 min-w-0 space-y-6">
                {/* Actions: Copy, Regenerate, Retry + Voice */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Volume2 size={12} className="text-[#FF9933]/90" />
                    Voice
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(msg)}
                    disabled={loadingAudioId === msg.id}
                    className={`
                      inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border min-h-[44px] touch-manual
                      transition-all duration-200 font-semibold text-xs uppercase tracking-wider
                      ${loadingAudioId === msg.id
                        ? "bg-[#FF9933]/20 border-[#FF9933]/40 text-[#FF9933] cursor-wait"
                        : playingId === msg.id
                          ? "bg-[#FF9933]/25 border-[#FF9933]/50 text-[#FF9933] shadow-sm"
                          : audioErrorId === msg.id
                            ? "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20"
                            : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white hover:border-[#FF9933]/40 hover:bg-[#161b22]"
                      }
                    `}
                  >
                    {loadingAudioId === msg.id ? (
                      <Loader2 size={14} className="animate-spin flex-shrink-0" />
                    ) : (
                      <Volume2 size={14} className={playingId === msg.id ? "animate-pulse flex-shrink-0" : ""} />
                    )}
                    <span>
                      {loadingAudioId === msg.id ? "Loading…" : playingId === msg.id ? "Playing" : audioErrorId === msg.id ? "Try again" : "Listen"}
                    </span>
                  </button>
                  {playingId === msg.id && (
                    <button
                      type="button"
                      onClick={handleStopSpeaking}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 min-h-[44px] touch-manual text-xs font-semibold"
                      aria-label="Stop speaking"
                    >
                      <VolumeX size={14} />
                      Stop
                    </button>
                  )}
                  {audioErrorId === msg.id && (
                    <span className="text-[10px] text-red-400/90">Check API key or connection</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(msg)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white hover:border-[#FF9933]/40 min-h-[44px] touch-manual text-xs font-semibold"
                    aria-label="Copy"
                  >
                    <Copy size={14} />
                    {copiedId === msg.id ? "Copied" : "Copy"}
                  </button>
                  {isLastAssistant(msgIdx) && !isLoading && lastUserMessage && onRegenerate && (
                    isErrorMessage(msg) ? (
                      <button
                        type="button"
                        onClick={() => onRegenerate(lastUserMessage.content, lastUserMessage.mode ?? activeMode, appLanguage, lastUserMessage.imageUrl)}
                        disabled={retryDisabled || msg.errorCode === "UNAUTHORIZED"}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#FF9933]/50 bg-[#FF9933]/10 text-[#FF9933] hover:bg-[#FF9933]/20 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manual text-xs font-semibold"
                        aria-label="Retry"
                      >
                        <RotateCcw size={14} />
                        {msg.errorCode === "UNAUTHORIZED"
                          ? "Sign in"
                          : retryDisabled
                            ? `Retry in ${Math.ceil(retryCooldownMs / 1000)}s`
                            : "Retry"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRegenerate(lastUserMessage.content, lastUserMessage.mode ?? activeMode, appLanguage, lastUserMessage.imageUrl)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white hover:border-[#FF9933]/40 min-h-[44px] touch-manual text-xs font-semibold"
                        aria-label="Regenerate"
                      >
                        <RefreshCw size={14} />
                        Regenerate
                      </button>
                    )
                  )}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="rounded-2xl border border-[#30363d]/50 bg-[#0d1117]/50 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers size={12} className="text-[#FF9933]/80 flex-shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Verified sources</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {msg.sources.map((s, idx) => (
                        <SourceCard key={idx} source={s} index={idx} />
                      ))}
                    </div>
                  </div>
                )}
                {msg.role === 'assistant' && (!msg.sources || msg.sources.length === 0) && msgIdx === messages.length - 1 && msgIdx > 0 && messages[msgIdx - 1].role === 'user' && (
                  <p className="text-xs text-gray-500 mt-1">Add SERPER_API_KEY in Vercel to get live links and verified sources.</p>
                )}

                {/* Answer body */}
                <div className="rounded-2xl border border-[#30363d]/40 bg-[#161b22]/60 px-4 sm:px-6 py-4 sm:py-5 shadow-sm">
                  {msg.widget && (
                    <div className="mb-5 animate-in slide-in-from-left-3 duration-400">
                      <AgentWidgetRenderer data={msg.widget} />
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.mode === AgentMode.CODER && (
                    <CoderResponsePanel content={msg.content} />
                  )}
                  <div className="prose prose-invert prose-orange max-w-none text-[#e6edf3] prose-p:leading-relaxed prose-headings:text-white prose-a:text-[#FF9933]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.role === 'assistant' && msg.mode === AgentMode.CODER ? stripCodeBlocks(msg.content) : msg.content}
                    </ReactMarkdown>
                  </div>
                  {msg.imageUrl && (
                    <div className="mt-6 rounded-2xl overflow-hidden border border-[#30363d] bg-[#0d1117] shadow-lg">
                      <img src={msg.imageUrl} alt="Generation" className="w-full h-auto" />
                      <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-t border-[#30363d]/50">
                        <TricolourStar size={12} />
                        Neural Render
                      </div>
                    </div>
                  )}
                  {msg.videoUrl && (
                    <div className="mt-6 rounded-2xl overflow-hidden border border-[#30363d] bg-black aspect-video relative">
                      <video src={msg.videoUrl} controls autoPlay loop muted className="w-full h-full object-cover" />
                      <div className="absolute top-3 left-3 px-3 py-1.5 bg-black/60 backdrop-blur rounded-lg text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                        Video
                      </div>
                    </div>
                  )}
                </div>

                {/* Follow-ups */}
                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="rounded-2xl border border-[#30363d]/40 bg-[#0d1117]/40 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={12} className="text-[#FF9933]/80 flex-shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Follow-up questions</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {msg.followUps.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onFollowUpClick?.(q)}
                          className="group flex items-center justify-between gap-3 p-3.5 sm:p-4 min-h-[48px] rounded-xl bg-[#161b22]/60 border border-[#30363d]/40 text-left text-sm font-medium text-gray-400 hover:text-white hover:bg-[#161b22] hover:border-[#FF9933]/30 transition-all active:scale-[0.99] touch-manual"
                        >
                          <span className="break-words">{q}</span>
                          <Sparkles size={14} className="text-[#FF9933]/80 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ChatView;
