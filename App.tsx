import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { Message, AgentMode, ChatSession, ViewMode } from './types';
import { NexusAgent, hasOpenAIKey, OpenAISanitizedError } from './services/openaiService';
import Omnibox from './components/Omnibox';
import ChatView from './components/ChatView';
import LiveConversation from './components/LiveConversation';
import Sidebar from './components/Sidebar';
import NewsFeed from './components/NewsFeed';
import TricolourStar from './components/TricolourStar';
import SettingsPanel from './components/SettingsPanel';
import {
  Menu, Share2, MoreHorizontal, Hash, Terminal, Globe, BookOpen, Sparkles, Briefcase, ShoppingBag, X, Settings
} from 'lucide-react';

const STORAGE_KEY = 'inbharat_v8_pro_v2_final';
const ANON_MESSAGE_COUNT_KEY = 'inbharat_anon_message_count';
const REGISTER_DISMISS_KEY = 'inbharat_register_prompt_dismissed';
const REGISTER_PROMPT_THRESHOLD = 6; // after this many user messages, prompt to register

const App: React.FC = () => {
  const { isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.HOME);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [appLanguage, setAppLanguage] = useState("EN");
  const [activeMode, setActiveMode] = useState<AgentMode>(AgentMode.STANDARD);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const agentRef = useRef<NexusAgent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSessions(parsed);
      } catch (_e) { /* ignore invalid saved state */ }
    }
    agentRef.current = new NexusAgent();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Auto-scroll to bottom only when a response just finished (user can scroll up without being pulled back)
  useEffect(() => {
    const justFinished = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;
    if (justFinished && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [isLoading]);

  const startNewChat = (mode: AgentMode = AgentMode.STANDARD) => {
    setCurrentSessionId(null);
    setActiveMode(mode);
    setViewMode(ViewMode.HOME);
    setIsSidebarOpen(false);
  };

  const handleDiscovery = () => {
    setViewMode(ViewMode.DISCOVER);
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
  };

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleSearch = useCallback(async (query: string, mode: AgentMode, language: string, imageData?: string) => {
    if (!agentRef.current || (!query.trim() && !imageData)) return;
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setIsLoading(true);
    setViewMode(ViewMode.HOME);

    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: query || "Analyzing provided image context...", 
      mode,
      imageUrl: imageData 
    };

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: query ? (query.length > 40 ? query.slice(0, 40) + "..." : query) : "Intelligence Search",
        messages: [userMsg],
        activeMode: mode,
        timestamp: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      targetSessionId = newSession.id;
    } else {
      setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, messages: [...s.messages, userMsg], activeMode: mode } : s));
    }

    // Track anonymous usage and prompt to register after a few chats
    if (!isSignedIn) {
      const prev = parseInt(localStorage.getItem(ANON_MESSAGE_COUNT_KEY) || '0', 10);
      const next = prev + 1;
      localStorage.setItem(ANON_MESSAGE_COUNT_KEY, next.toString());
      if (next >= REGISTER_PROMPT_THRESHOLD && !localStorage.getItem(REGISTER_DISMISS_KEY)) {
        setShowRegisterPrompt(true);
      }
    }

    try {
      const result = await agentRef.current.executeQuery(query, mode, language || appLanguage, imageData, signal);
      if (signal.aborted) return;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text,
        sources: result.sources,
        followUps: result.followUps,
        imageUrl: result.imageUrl,
        videoUrl: result.videoUrl,
        widget: result.widget, // Store widget data
        mode
      };
      setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s));
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === "AbortError") return;
      const errMsgText = (error as Error)?.message ?? String(error);
      const errAny = error as { status?: number; cause?: { status?: number }; response?: { status?: number } };
      const errStatus = errAny?.status ?? errAny?.cause?.status ?? errAny?.response?.status;
      console.error("InBharat AI request failed:", errMsgText, errStatus != null ? `(status ${errStatus})` : "");
      const sanitized = error instanceof OpenAISanitizedError ? error : null;
      let content: string;
      if (sanitized?.code === "UPSTREAM_OVERLOADED") {
        content = "Service is busy right now. Tap Retry in a few seconds.";
      } else if (sanitized?.code === "RATE_LIMIT") {
        content = "Too many requests. Tap Retry in a few seconds.";
      } else if (
        sanitized?.code === "AUTH_ERROR" ||
        errStatus === 401 ||
        /OPENAI_API_KEY|api key|not set|VITE_OPENAI|unauthorized|incorrect api key|401/i.test(errMsgText)
      ) {
        content = "OpenAI API key is missing or invalid. Add VITE_OPENAI_API_KEY to your .env file and restart the dev server.";
      } else if (
        errStatus === 429 ||
        /429|rate limit|too many requests/i.test(errMsgText)
      ) {
        content = "Too many requests. Tap Retry in a few seconds.";
      } else if (
        errStatus === 503 || errStatus === 502 || errStatus === 500 ||
        /503|502|500|overload|capacity|heavy traffic|try again later/i.test(errMsgText)
      ) {
        content = "Service is busy right now. Tap Retry in a few seconds.";
      } else if (/fetch|NetworkError|Failed to fetch|ERR_NETWORK/i.test(errMsgText)) {
        content = "Network error. Check your connection and try again.";
      } else {
        content = "The request failed. Check your API key and connection, then tap Retry.";
      }
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content,
        mode: AgentMode.RESEARCH,
        ...(sanitized && {
          errorCode: sanitized.code,
          retryAfterSeconds: sanitized.retryAfterSeconds,
          errorShownAt: Date.now(),
        }),
      };
      setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, messages: [...s.messages, errMsg] } : s));
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }, [currentSessionId, appLanguage, isSignedIn]);

  const handleRegenerate = useCallback((query: string, mode: AgentMode, language: string, imageUrl?: string) => {
    if (!isLoading) handleSearch(query, mode, language, imageUrl);
  }, [isLoading, handleSearch]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  const getModeInfo = (mode: AgentMode) => {
    switch (mode) {
      case AgentMode.STANDARD: return { label: 'Nexus', icon: Sparkles, color: 'text-white', bg: 'bg-white/5', border: 'border-white/10' };
      case AgentMode.RESEARCH: return { label: 'Research', icon: Hash, color: 'text-[#FF9933]', bg: 'bg-[#FF9933]/10', border: 'border-[#FF9933]/30' };
      case AgentMode.CODER: return { label: 'Coder', icon: Terminal, color: 'text-[#138808]', bg: 'bg-[#138808]/10', border: 'border-[#138808]/30' };
      case AgentMode.BROWSER: return { label: 'Browser', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
      case AgentMode.EDUCATOR: return { label: 'Educator', icon: BookOpen, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' };
      case AgentMode.EXECUTIVE: return { label: 'Executive', icon: Briefcase, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' };
      case AgentMode.SHOPPER: return { label: 'Shopper', icon: ShoppingBag, color: 'text-[#138808]', bg: 'bg-[#138808]/10', border: 'border-[#138808]/30' };
      default: return { label: 'InBharat', icon: Sparkles, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' };
    }
  };

  const activeModeInfo = getModeInfo(activeMode);

  return (
    <div className="flex min-h-screen h-dvh sm:h-screen w-full max-w-[100vw] bg-[#0d1117] text-[#e6edf3] font-sans overflow-x-hidden overflow-y-auto relative touch-manual">
      {/* Live Overlay */}
      {viewMode === ViewMode.LIVE && <LiveConversation onClose={() => setViewMode(ViewMode.HOME)} language={appLanguage} />}

      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={filteredSessions}
        currentSessionId={currentSessionId}
        onSessionSelect={(id) => {
          const session = sessions.find(s => s.id === id);
          setCurrentSessionId(id);
          if (session) setActiveMode(session.activeMode);
          setViewMode(ViewMode.HOME);
          setIsSidebarOpen(false);
        }}
        onNewChat={startNewChat}
        onDiscovery={handleDiscovery}
        searchQuery={sidebarSearch}
        onSearchChange={setSidebarSearch}
        activeLanguage={appLanguage}
      />

      {/* Main UI */}
      <main className="flex-1 flex flex-col relative h-full">
        {/* Sign-in banner when not authenticated */}
        {!isSignedIn && (
          <div className="shrink-0 bg-[#161b22] border-b border-[#30363d]/50 px-4 py-2 flex items-center justify-center gap-3 text-sm">
            <span className="text-gray-400">Sign in to save your chats and use InBharat on any device.</span>
            <SignInButton mode="modal">
              <button className="px-4 py-2 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold transition-all text-sm">
                Sign in
              </button>
            </SignInButton>
          </div>
        )}
        {isOffline && (
          <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-center gap-2 text-amber-200 text-sm">
            <span className="font-medium">You are offline.</span>
            <span className="text-amber-200/80">History and drafts are available; connect to the internet for search and AI.</span>
          </div>
        )}
        {!hasOpenAIKey() && (
          <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/40 px-4 py-2.5 flex items-center justify-center gap-2 text-amber-200 text-sm">
            <span className="font-medium">OpenAI API key is missing.</span>
            <span className="text-amber-200/80">Add VITE_OPENAI_API_KEY to your .env file and restart the dev server to use chat and voice.</span>
          </div>
        )}
        {/* Header */}
        <header className="h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 safe-top z-[100] sticky top-0 bg-[#0d1117]/95 backdrop-blur-xl border-b border-[#30363d]/30 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="flex-shrink-0 w-10 h-10 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-sm touch-manual" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <Link to="/" className="flex items-center gap-2 min-w-0 hover:opacity-90 transition-opacity" title="Back to home">
               <TricolourStar size={28} className="flex-shrink-0" />
               <span className="font-black italic text-base sm:text-lg tracking-tight text-white opacity-90 truncate">InBharat</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
             <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 md:px-4 ${activeModeInfo.bg} ${activeModeInfo.border} border rounded-xl animate-in fade-in duration-300`}>
                <activeModeInfo.icon size={12} className={activeModeInfo.color} />
                <span className={`text-[10px] font-black tracking-widest ${activeModeInfo.color}`}>{activeModeInfo.label} Unit Online</span>
             </div>
             <button
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-center text-gray-400 hover:text-[#FF9933] transition-all touch-manual"
                aria-label="Settings"
                data-testid="settings-button"
              >
                <Settings size={20} />
              </button>
             <button
                onClick={() => setViewMode(ViewMode.LIVE)}
                className="w-10 h-10 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-center text-gray-400 hover:text-[#FF9933] transition-all shadow-lg overflow-hidden group touch-manual"
                aria-label="Voice mode"
              >
                <TricolourStar size={20} className="group-hover:scale-125 transition-transform" />
              </button>
             {isSignedIn ? (
               <UserButton afterSignOutUrl="/" />
             ) : (
               <SignInButton mode="modal">
                 <button className="px-3 py-2 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#FF9933]/50 text-gray-300 hover:text-white font-bold text-sm transition-all">
                   Sign in
                 </button>
               </SignInButton>
             )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col overscroll-behavior-y-contain">
          {viewMode === ViewMode.DISCOVER ? (
            <div className="pt-4 sm:pt-8 pb-44 sm:pb-52 px-2 sm:px-0">
              <NewsFeed onArticleClick={(title) => handleSearch(title, AgentMode.RESEARCH, appLanguage)} />
            </div>
          ) : !currentSessionId ? (
            <div className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-12 md:pt-20 lg:pt-32 min-h-full pb-44 sm:pb-52">
               <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-1000 mb-8 sm:mb-12 md:mb-16">
                  <div className="relative mb-6 sm:mb-8">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 bg-[#000000] border-2 border-[#30363d] rounded-[2rem] sm:rounded-[3rem] flex items-center justify-center shadow-2xl relative overflow-hidden group">
                       <TricolourStar size={84} className="w-14 h-14 sm:w-20 sm:h-20 md:w-[84px] md:h-[84px] group-hover:scale-110 transition-transform duration-700" />
                       <div className="absolute inset-0 bg-gradient-to-tr from-[#FF9933]/10 via-transparent to-[#138808]/10 pointer-events-none" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 sm:-bottom-3 sm:-right-3 bg-[#FF9933] w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border-4 border-[#0d1117] shadow-xl animate-bounce">
                      <Sparkles size={16} className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                  </div>
                  <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black italic tracking-tighter text-white mb-3 sm:mb-5 px-2">
                    InBharat <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent pr-1">Ai</span>
                  </h1>

                  <p className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3">
                    Desh Ka Ai
                  </p>
                  <div className="w-20 sm:w-24 h-px bg-gradient-to-r from-[#FF9933] via-white/80 to-[#138808] mb-3 sm:mb-4" />
                  <p className="text-[9px] sm:text-[10px] md:text-xs font-medium uppercase text-[#A0A0A0] max-w-[90vw] sm:max-w-lg px-2 flex flex-col items-center justify-center gap-y-0.5">
                    <span className="tracking-[0.15em] sm:tracking-[0.25em] flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4">
                      <span>S O V E R E I G N</span>
                      <span>I N T E L L I G E N C E</span>
                    </span>
                    <span className="tracking-[0.15em] sm:tracking-[0.25em]">F O R</span>
                    <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent tracking-[0.15em] sm:tracking-[0.25em] pr-1">B H A R A T</span>
                  </p>
               </div>
               <div className="flex-1 min-h-4" />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 sm:pt-10 pb-44 sm:pb-52">
               <ChatView
                 messages={currentSession?.messages || []}
                 onFollowUpClick={(q) => handleSearch(q, activeMode, appLanguage)}
                 appLanguage={appLanguage}
                 activeMode={activeMode}
                 isLoading={isLoading}
                 onStop={handleStop}
                 onRegenerate={handleRegenerate}
                 lastUserMessage={currentSession?.messages?.filter(m => m.role === "user").pop()}
               />
               {isLoading && (
                 <div className="mt-16 flex flex-col sm:flex-row gap-4 sm:gap-8 ml-0 md:ml-14">
                   <div className="flex gap-4 sm:gap-8 flex-1">
                     <div className="w-10 h-10 rounded-2xl bg-[#FF9933]/10 border border-[#FF9933]/20 flex items-center justify-center flex-shrink-0">
                       <TricolourStar size={20} className="opacity-40" />
                     </div>
                     <div className="flex-1 space-y-8 py-2">
                       <div className="h-4 bg-[#161b22] rounded-full w-2/3"></div>
                       <div className="space-y-4">
                         <div className="grid grid-cols-3 gap-4">
                           <div className="h-3 bg-[#161b22] rounded-full col-span-2"></div>
                           <div className="h-3 bg-[#161b22] rounded-full col-span-1"></div>
                         </div>
                         <div className="h-3 bg-[#161b22] rounded-full w-4/5"></div>
                         <div className="h-3 bg-[#161b22] rounded-full w-1/2"></div>
                       </div>
                     </div>
                   </div>
                   <button
                     type="button"
                     onClick={handleStop}
                     className="sm:self-center px-4 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-semibold touch-manual min-h-[44px]"
                     aria-label="Stop generating"
                   >
                     Stop
                   </button>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Fixed bottom bar — Cursor-style: always visible, compact */}
        <div className="fixed bottom-0 left-0 right-0 safe-bottom z-[40] bg-[#0d1117] border-t border-[#30363d]/50 pointer-events-none">
          <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 py-2 sm:py-3 pointer-events-auto">
            <Omnibox 
              onSearch={handleSearch} 
              onLiveClick={() => setViewMode(ViewMode.LIVE)} 
              onSpeakToType={async (blob) => (await agentRef.current?.transcribe(blob, appLanguage)) ?? ''}
              isLoading={isLoading} 
              language={appLanguage} 
              setLanguage={setAppLanguage}
              initialMode={activeMode}
              onModeChange={setActiveMode}
            />
          </div>
          <div className="w-full max-w-2xl mx-auto flex items-center justify-between px-4 sm:px-8 pb-2 opacity-30 hover:opacity-100 transition-all">
             <button
               type="button"
               onClick={() => {
                 if (!currentSession) return;
                 const text = currentSession.messages
                   .map((m) => `${m.role === "user" ? "You" : "InBharat"}: ${m.content}`)
                   .join("\n\n");
                 const blob = new Blob([text], { type: "text/plain" });
                 const url = URL.createObjectURL(blob);
                 const a = document.createElement("a");
                 a.href = url;
                 a.download = `inbharat-chat-${currentSession.id.slice(0, 8)}.txt`;
                 a.click();
                 URL.revokeObjectURL(url);
               }}
               disabled={!currentSession || currentSession.messages.length === 0}
               className="p-3 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-2xl text-gray-500 hover:text-white transition-all active:scale-90 touch-manual disabled:opacity-50"
               aria-label="Export chat"
             >
               <Share2 size={18} />
             </button>
             <div className="flex items-center gap-3">
               <div className="h-1 w-2 bg-[#FF9933] rounded-full" />
               <div className="h-1 w-12 bg-white/30 rounded-full" />
               <div className="h-1 w-2 bg-[#138808] rounded-full" />
             </div>
             <button className="p-3 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-2xl text-gray-500 hover:text-white transition-all active:scale-90 touch-manual"><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </main>

      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Register prompt modal — after a few chats, ask to create account */}
      {showRegisterPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowRegisterPrompt(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl max-w-md w-full p-6 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setShowRegisterPrompt(false); localStorage.setItem(REGISTER_DISMISS_KEY, '1'); }}
              className="absolute top-4 right-4 p-1 rounded-lg text-gray-500 hover:text-white hover:bg-[#30363d] transition-all"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-black text-white mb-2">Create a free account</h3>
            <p className="text-gray-400 text-sm mb-6">Keep your chat history and use InBharat on any device. Sign up with email or Google.</p>
            <div className="flex flex-col gap-3">
              <SignUpButton mode="modal">
                <button className="w-full py-3 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold transition-all">
                  Sign up with Email or Google
                </button>
              </SignUpButton>
              <button
                onClick={() => { setShowRegisterPrompt(false); localStorage.setItem(REGISTER_DISMISS_KEY, '1'); }}
                className="w-full py-3 rounded-xl bg-[#0d1117] border border-[#30363d] text-gray-400 hover:text-white font-medium transition-all"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
