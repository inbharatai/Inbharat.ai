import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message, AgentMode, Source } from "../types";
import SourceCard from "./SourceCard";
import TricolourStar from "./TricolourStar";
import { AgentWidgetRenderer } from "./AgentWidgets";
import CoderResponsePanel from "./CoderResponsePanel";
import { Layers, Sparkles, MessageSquare, Volume2, VolumeX, Loader2, Copy, RefreshCw, RotateCcw } from "lucide-react";
import { NexusAgent, normalizeForTTS, splitForTTS } from "../services/openaiService";
import { getVoiceSettings } from "../lib/settings";
import { useTranslation } from 'react-i18next';

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

/** Regex to detect inline citations like [1], [2], [1][3], etc. */
const CITATION_RE = /(\[\d+\])/g;

/**
 * Process a text string into React elements with inline citation badges.
 * Citations like [1] become clickable badges linking to the corresponding source.
 */
function renderCitationsInText(text: string, sources?: Source[]): React.ReactNode {
  if (!sources?.length || !CITATION_RE.test(text)) return text;
  CITATION_RE.lastIndex = 0; // reset regex state
  const parts = text.split(CITATION_RE);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const source = sources[num - 1];
      if (source) {
        return (
          <a
            key={i}
            href={source.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-bold rounded-md bg-[#FF9933]/15 text-[#FF9933] hover:bg-[#FF9933]/30 no-underline transition-colors align-super ml-0.5 mr-0.5 cursor-pointer border border-[#FF9933]/20"
            title={source.title}
          >
            {num}
          </a>
        );
      }
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/**
 * Recursively process children to inject citation badges into text nodes.
 */
function processChildren(children: React.ReactNode, sources?: Source[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderCitationsInText(child, sources);
    }
    return child;
  });
}

/**
 * Build ReactMarkdown `components` prop that renders inline citations as badges.
 */
function buildCitationComponents(sources?: Source[]): Partial<Components> {
  if (!sources?.length) return {};
  return {
    p: ({ children, ...props }) => <p {...props}>{processChildren(children, sources)}</p>,
    li: ({ children, ...props }) => <li {...props}>{processChildren(children, sources)}</li>,
    td: ({ children, ...props }) => <td {...props}>{processChildren(children, sources)}</td>,
    strong: ({ children, ...props }) => <strong {...props}>{processChildren(children, sources)}</strong>,
    em: ({ children, ...props }) => <em {...props}>{processChildren(children, sources)}</em>,
    h1: ({ children, ...props }) => <h1 {...props}>{processChildren(children, sources)}</h1>,
    h2: ({ children, ...props }) => <h2 {...props}>{processChildren(children, sources)}</h2>,
    h3: ({ children, ...props }) => <h3 {...props}>{processChildren(children, sources)}</h3>,
    h4: ({ children, ...props }) => <h4 {...props}>{processChildren(children, sources)}</h4>,
    blockquote: ({ children, ...props }) => <blockquote {...props}>{processChildren(children, sources)}</blockquote>,
  };
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
  const { t } = useTranslation();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const chunkAbortRef = useRef<AbortController | null>(null);
  const playingMsgIdRef = useRef<string | null>(null);
  const webAudioRef = useRef<{
    ctx: AudioContext | null;
    nextStart: number;
    sources: AudioBufferSourceNode[];
    buffers: ArrayBuffer[];
    scheduled: number;
    ended: number;
    allFetched: boolean;
  }>({ ctx: null, nextStart: 0, sources: [], buffers: [], scheduled: 0, ended: 0, allFetched: false });

  useEffect(() => () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    const wa = webAudioRef.current;
    wa.sources.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
    wa.ctx?.close().catch(() => { /* ignore */ });
  }, []);

  const handleStopSpeaking = useCallback(() => {
    if (chunkAbortRef.current) {
      chunkAbortRef.current.abort();
      chunkAbortRef.current = null;
    }
    const wa = webAudioRef.current;
    wa.sources.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
    wa.ctx?.close().catch(() => { /* ignore */ });
    webAudioRef.current = { ctx: null, nextStart: 0, sources: [], buffers: [], scheduled: 0, ended: 0, allFetched: false };
    playingMsgIdRef.current = null;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setPlayingId(null);
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

    // Check cache first — instant playback on repeat
    const cached = audioCacheRef.current.get(message.id);
    if (cached) {
      const audio = new Audio(cached);
      const rate = getVoiceSettings().speechRate;
      if (rate >= 0.5 && rate <= 2) audio.playbackRate = rate;
      audio.onended = () => { currentAudioRef.current = null; setPlayingId(null); };
      audio.onerror = () => { setPlayingId(null); setAudioErrorId(message.id); currentAudioRef.current = null; };
      currentAudioRef.current = audio;
      setPlayingId(message.id);
      try { await audio.play(); } catch { setPlayingId(null); setAudioErrorId(message.id); currentAudioRef.current = null; }
      return;
    }

    const normalized = normalizeForTTS(message.content);
    if (!normalized) return;
    const chunks = splitForTTS(normalized, 300);
    const agent = new NexusAgent();

    // Short message: single fetch, simple playback
    if (chunks.length <= 1) {
      setLoadingAudioId(message.id);
      try {
        const audioUrl = await agent.textToSpeech(message.content, appLanguage);
        if (audioUrl) {
          audioCacheRef.current.set(message.id, audioUrl);
          const audio = new Audio(audioUrl);
          const rate = getVoiceSettings().speechRate;
          if (rate >= 0.5 && rate <= 2) audio.playbackRate = rate;
          audio.onended = () => { currentAudioRef.current = null; setPlayingId(null); };
          audio.onerror = () => { setPlayingId(null); setAudioErrorId(message.id); currentAudioRef.current = null; };
          currentAudioRef.current = audio;
          setPlayingId(message.id);
          try { await audio.play(); } catch { setPlayingId(null); setAudioErrorId(message.id); currentAudioRef.current = null; }
        } else {
          setAudioErrorId(message.id);
        }
      } catch {
        setAudioErrorId(message.id);
      } finally {
        setLoadingAudioId(null);
      }
      return;
    }

    // Multi-chunk: Web Audio API for gapless playback with parallel pre-fetch
    setLoadingAudioId(message.id);
    playingMsgIdRef.current = message.id;
    const wa = webAudioRef.current;
    wa.buffers = [];
    wa.sources = [];
    wa.scheduled = 0;
    wa.ended = 0;
    wa.allFetched = false;
    wa.nextStart = 0;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    wa.ctx = ctx;
    let firstScheduled = false;

    chunkAbortRef.current = agent.textToSpeechChunked(
      message.content,
      appLanguage,
      async (buffer, _index, _total) => {
        if (playingMsgIdRef.current !== message.id) return;
        wa.buffers.push(buffer);

        let audioBuffer: AudioBuffer;
        try {
          audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
        } catch {
          return;
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        const rate = getVoiceSettings().speechRate;
        if (rate >= 0.5 && rate <= 2) source.playbackRate.value = rate;
        source.connect(ctx.destination);

        if (!firstScheduled) {
          firstScheduled = true;
          wa.nextStart = ctx.currentTime;
          setLoadingAudioId(null);
          setPlayingId(message.id);
        }

        const startAt = Math.max(wa.nextStart, ctx.currentTime);
        source.start(startAt);
        const effectiveRate = (rate >= 0.5 && rate <= 2) ? rate : 1;
        wa.nextStart = startAt + audioBuffer.duration / effectiveRate;
        wa.sources.push(source);
        wa.scheduled++;

        source.onended = () => {
          wa.ended++;
          if (wa.allFetched && wa.ended >= wa.scheduled && playingMsgIdRef.current === message.id) {
            setPlayingId(null);
            playingMsgIdRef.current = null;
            // Cache concatenated MP3 for instant gapless replay
            if (wa.buffers.length > 0) {
              const combined = new Blob(wa.buffers, { type: 'audio/mpeg' });
              audioCacheRef.current.set(message.id, URL.createObjectURL(combined));
            }
            ctx.close().catch(() => {});
            wa.ctx = null;
          }
        };
      },
      () => { wa.allFetched = true; },
      () => {
        if (!firstScheduled) {
          setLoadingAudioId(null);
          setAudioErrorId(message.id);
        }
      }
    );
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
                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="rounded-2xl border border-[#30363d]/50 bg-[#0d1117]/50 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers size={12} className="text-[#FF9933]/80 flex-shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{t('verifiedSources')}</span>
                      <span className="text-[9px] font-bold text-gray-600 ml-auto">{t('sourcesCount', { count: msg.sources.length })}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {msg.sources.map((s, idx) => (
                        <SourceCard key={idx} source={s} index={idx} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Thinking indicator — shown while waiting for first content chunk ── */}
                {msg.isStreaming && !msg.content && (
                  <div className="rounded-2xl border border-[#FF9933]/20 bg-[#161b22]/60 px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FF9933]" style={{ animation: 'bounce 1.2s infinite', animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[#FF9933]/65" style={{ animation: 'bounce 1.2s infinite', animationDelay: '200ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[#FF9933]/30" style={{ animation: 'bounce 1.2s infinite', animationDelay: '400ms' }} />
                      </div>
                      <span className="text-sm text-gray-400 font-medium">
                        {msg.statusText || t('thinking')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Answer body */}
                {(!msg.isStreaming || msg.content) && <div className="rounded-2xl border border-[#30363d]/40 bg-[#161b22]/60 px-4 sm:px-6 py-4 sm:py-5 shadow-sm">
                  {msg.widget && (
                    <div className="mb-5 animate-in slide-in-from-left-3 duration-400">
                      <AgentWidgetRenderer data={msg.widget} />
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.mode === AgentMode.CODER && (
                    <CoderResponsePanel content={msg.content} />
                  )}
                  <div className="prose prose-invert prose-orange max-w-none text-[#e6edf3] prose-p:leading-relaxed prose-headings:text-white prose-a:text-[#FF9933]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildCitationComponents(msg.sources)}>
                      {msg.role === 'assistant' && msg.mode === AgentMode.CODER ? stripCodeBlocks(msg.content) : msg.content}
                    </ReactMarkdown>
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-5 bg-[#FF9933] rounded-sm animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                  {msg.imageUrl && (
                    <div className="mt-6 rounded-2xl overflow-hidden border border-[#30363d] bg-[#0d1117] shadow-lg">
                      <img src={msg.imageUrl} alt="Generation" className="w-full h-auto" />
                      <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-t border-[#30363d]/50">
                        <TricolourStar size={12} />
                        {t('neuralRender')}
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
                </div>}

                {/* Actions: Copy, Regenerate, Retry + Voice */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Volume2 size={12} className="text-[#FF9933]/90" />
                    {t('voiceLabel')}
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
                      {loadingAudioId === msg.id ? t('audioLoading') : playingId === msg.id ? t('audioPlaying') : audioErrorId === msg.id ? t('audioRetry') : t('audioListen')}
                    </span>
                  </button>
                  {playingId === msg.id && (
                    <button
                      type="button"
                      onClick={handleStopSpeaking}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 min-h-[44px] touch-manual text-xs font-semibold"
                      aria-label={t('stopSpeaking')}
                    >
                      <VolumeX size={14} />
                      {t('audioStop')}
                    </button>
                  )}
                  {audioErrorId === msg.id && (
                    <span className="text-[10px] text-red-400/90">{t('audioError')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(msg)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white hover:border-[#FF9933]/40 min-h-[44px] touch-manual text-xs font-semibold"
                    aria-label={t('copy')}
                  >
                    <Copy size={14} />
                    {copiedId === msg.id ? t('copied') : t('copy')}
                  </button>
                  {isLastAssistant(msgIdx) && !isLoading && lastUserMessage && onRegenerate && (
                    isErrorMessage(msg) ? (
                      <button
                        type="button"
                        onClick={() => onRegenerate(lastUserMessage.content, lastUserMessage.mode ?? activeMode, appLanguage, lastUserMessage.imageUrl)}
                        disabled={retryDisabled || msg.errorCode === "UNAUTHORIZED"}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#FF9933]/50 bg-[#FF9933]/10 text-[#FF9933] hover:bg-[#FF9933]/20 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manual text-xs font-semibold"
                        aria-label={t('retry')}
                      >
                        <RotateCcw size={14} />
                        {msg.errorCode === "UNAUTHORIZED"
                          ? t('signIn')
                          : retryDisabled
                            ? t('retryIn', { seconds: Math.ceil(retryCooldownMs / 1000) })
                            : t('retry')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRegenerate(lastUserMessage.content, lastUserMessage.mode ?? activeMode, appLanguage, lastUserMessage.imageUrl)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white hover:border-[#FF9933]/40 min-h-[44px] touch-manual text-xs font-semibold"
                        aria-label={t('regenerate')}
                      >
                        <RefreshCw size={14} />
                        {t('regenerate')}
                      </button>
                    )
                  )}
                </div>

                {/* Follow-ups */}
                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="rounded-2xl border border-[#30363d]/40 bg-[#0d1117]/40 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={12} className="text-[#FF9933]/80 flex-shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{t('followUpQuestions')}</span>
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
