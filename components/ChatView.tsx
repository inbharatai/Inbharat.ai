
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import SourceCard from './SourceCard';
import TricolourStar from './TricolourStar';
import { AgentWidgetRenderer } from './AgentWidgets';
import { Layers, Sparkles, MessageSquare, Volume2, Loader2 } from 'lucide-react';
import { NexusAgent } from '../services/openaiService';

interface ChatViewProps {
  messages: Message[];
  onFollowUpClick?: (query: string) => void;
  appLanguage?: string;
}

const ChatView: React.FC<ChatViewProps> = ({ messages, onFollowUpClick, appLanguage = "EN" }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);

  const handlePlayAudio = async (message: Message) => {
    if (loadingAudioId || playingId === message.id) return;
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
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setPlayingId(null);
        };
        audio.onerror = () => {
          setPlayingId(null);
          setAudioErrorId(message.id);
        };
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
                {/* Voice: Listen — prominent at top */}
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
                        ? 'bg-[#FF9933]/20 border-[#FF9933]/40 text-[#FF9933] cursor-wait'
                        : playingId === msg.id
                          ? 'bg-[#FF9933]/25 border-[#FF9933]/50 text-[#FF9933] shadow-sm'
                          : audioErrorId === msg.id
                            ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
                            : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white hover:border-[#FF9933]/40 hover:bg-[#161b22]'
                      }
                    `}
                  >
                    {loadingAudioId === msg.id ? (
                      <Loader2 size={14} className="animate-spin flex-shrink-0" />
                    ) : (
                      <Volume2 size={14} className={playingId === msg.id ? 'animate-pulse flex-shrink-0' : ''} />
                    )}
                    <span>
                      {loadingAudioId === msg.id ? 'Loading…' : playingId === msg.id ? 'Playing' : audioErrorId === msg.id ? 'Try again' : 'Listen'}
                    </span>
                  </button>
                  {audioErrorId === msg.id && (
                    <span className="text-[10px] text-red-400/90">Check API key or connection</span>
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
                  <div className="prose prose-invert prose-orange max-w-none text-[#e6edf3] prose-p:leading-relaxed prose-headings:text-white prose-a:text-[#FF9933]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
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
