
import React from 'react';
import {
  Plus, Search, MessageSquare, Compass, Settings,
  Terminal, Globe, User, Hash, History
} from 'lucide-react';
import { AgentMode, ChatSession } from '../types';
import TricolourStar from './TricolourStar';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  sessionsLoading?: boolean;
  currentSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewChat: (mode: AgentMode) => void;
  onDiscovery: () => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeLanguage: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, onClose, sessions, sessionsLoading = false, currentSessionId, onSessionSelect, 
  onNewChat, onDiscovery, searchQuery, onSearchChange, activeLanguage: _activeLanguage 
}) => {
  const { isSignedIn, user, signOut } = useAuth();
  const { t } = useTranslation();
  const actionsDisabled = !isSignedIn;
  const agents = [
    { mode: AgentMode.RESEARCH, label: t('researchUnit'), icon: Hash, color: 'text-[#FF9933]' },
    { mode: AgentMode.CODER, label: t('codeTerminal'), icon: Terminal, color: 'text-[#138808]' },
    { mode: AgentMode.BROWSER, label: t('globalBrowser'), icon: Globe, color: 'text-blue-400' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[440] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-[450] w-[min(300px,85vw)] max-w-[300px] bg-[#0d1117] border-r border-[#30363d]/30 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col shadow-2xl overflow-hidden safe-top`}>
        {/* Top Section: Search & New Chat */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="relative group">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#FF9933] transition-colors" />
            <input 
              type="text" 
              placeholder={t('searchHistory')} 
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-10 bg-[#161b22] border border-[#30363d]/50 rounded-xl pl-10 pr-4 text-xs text-white placeholder-gray-600 outline-none focus:border-[#FF9933]/30 transition-all"
            />
          </div>

          <button 
            onClick={() => !actionsDisabled && onNewChat(AgentMode.RESEARCH)}
            disabled={actionsDisabled}
            className={`w-full min-h-[44px] h-11 flex items-center justify-between px-4 rounded-xl font-black text-xs transition-all shadow-lg group touch-manual ${
              actionsDisabled
                ? "bg-white/10 text-gray-500 border border-[#30363d] cursor-not-allowed"
                : "bg-white text-black hover:bg-gray-200 active:scale-[0.98]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Plus size={16} strokeWidth={3} />
              <span className="uppercase tracking-widest">{t('newChat')}</span>
            </div>
            <TricolourStar size={16} className="group-hover:rotate-[18deg] transition-transform" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-8">
          {/* Intelligence Units */}
          <div className="space-y-1 mb-8">
            <div className="px-4 text-[9px] font-black uppercase tracking-[0.3em] text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-1 h-1 bg-[#FF9933] rounded-full inline-block" />
              {t('intelligenceUnits')}
            </div>
            {agents.map((agent) => (
                <button 
                  key={agent.mode}
                  onClick={() => !actionsDisabled && onNewChat(agent.mode)}
                  disabled={actionsDisabled}
                  className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 min-h-[44px] rounded-xl transition-all group touch-manual text-left ${
                    actionsDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[#161b22]"
                  }`}
                >
                <agent.icon size={16} className={`${agent.color} opacity-60 group-hover:opacity-100`} />
                <span className="text-[13px] font-semibold text-gray-400 group-hover:text-white">{agent.label}</span>
              </button>
            ))}
            <button 
              onClick={() => !actionsDisabled && onDiscovery()}
              disabled={actionsDisabled}
              className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 min-h-[44px] rounded-xl transition-all group touch-manual text-left ${
                actionsDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[#161b22]"
              }`}
            >
              <Compass size={16} className="text-[#FF9933] opacity-60 group-hover:opacity-100" />
              <span className="text-[13px] font-semibold text-gray-400 group-hover:text-white">{t('discoverLive')}</span>
            </button>
          </div>

          {/* Chat History */}
          <div className="space-y-1">
            <div className="px-4 text-[9px] font-black uppercase tracking-[0.3em] text-gray-700 mb-3 flex items-center gap-2">
              <History size={10} className="text-gray-600" />
              {t('chatHistory')}
            </div>
            {sessionsLoading ? (
              <p className="px-4 text-[11px] text-gray-500 italic font-medium">{t('loadingChats')}</p>
            ) : sessions.length === 0 ? (
              <p className="px-4 text-[11px] text-gray-800 italic font-medium">{t('noChatsYet')}</p>
            ) : (
              sessions.map(s => (
                <button 
                  key={s.id} 
                  onClick={() => onSessionSelect(s.id)} 
                  className={`w-full text-left p-3.5 min-h-[44px] rounded-xl text-xs sm:text-[13px] transition-all truncate flex items-center justify-between group touch-manual ${currentSessionId === s.id ? 'bg-[#161b22] text-white border border-[#30363d]/50' : 'text-gray-500 hover:text-white hover:bg-[#161b22]/50'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare size={14} className="opacity-30 group-hover:opacity-60 flex-shrink-0" />
                    <span className="truncate font-medium">{s.title}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Footer: User Profile */}
        <div className="p-4 border-t border-[#30363d]/30 bg-[#0d1117]">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-[#161b22] transition-all group"
            onClick={() => {
              if (!isSignedIn) return;
              void signOut();
            }}
            title={isSignedIn ? t('signOut') : t('signInToChat')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-gradient-to-br from-[#FF9933] to-[#138808] rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                <User size={18} />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[11px] font-black text-white truncate uppercase tracking-widest leading-none mb-1">
                  {isSignedIn ? t('signedIn') : t('guest')}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-semibold text-gray-500 truncate">
                    {isSignedIn ? (user?.email ?? "user") : t('signInToChat')}
                  </span>
                  <TricolourStar size={10} />
                </div>
              </div>
            </div>
            <Settings size={14} className="text-gray-600 group-hover:text-white group-hover:rotate-45 transition-all" />
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
