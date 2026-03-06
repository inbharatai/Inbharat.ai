import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Languages, Mic, MicOff, Zap, Camera, Image as ImageIcon, 
  Paperclip, Terminal, BookOpen, Globe, X, Sparkles, Hash, MessageSquare, Briefcase, ShoppingBag
} from 'lucide-react';
import { AgentMode } from '../types';
import { getSupportedMimeType } from '../services/openaiService';

interface OmniboxProps {
  onSearch: (query: string, mode: AgentMode, language: string, imageData?: string) => void;
  onLiveClick: () => void;
  onSpeakToType?: (audioBlob: Blob) => Promise<string>;
  isLoading: boolean;
  disabled?: boolean;
  language: string;
  setLanguage: (lang: string) => void;
  initialMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
}

const indianLanguages = [
  { code: "EN", label: "English" },
  { code: "HI", label: "Hindi (हिन्दी)" },
  { code: "BN", label: "Bengali (বাংলা)" },
  { code: "TA", label: "Tamil (தமிழ்)" },
  { code: "TE", label: "Telugu (తెలుగు)" },
  { code: "MR", label: "Marathi (मराठी)" },
  { code: "GU", label: "Gujarati (ગુજરાતી)" },
  { code: "KN", label: "Kannada (ಕನ್ನಡ)" },
  { code: "ML", label: "Malayalam (മലയാളം)" },
  { code: "PA", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "OR", label: "Odia (ଓଡ଼ିଆ)" },
  { code: "UR", label: "Urdu (اردو)" },
  { code: "AS", label: "Assamese (অসমীয়া)" },
  { code: "SA", label: "Sanskrit (संस्कृतम्)" }
];

const Omnibox: React.FC<OmniboxProps> = ({ 
  onSearch, onLiveClick, onSpeakToType, isLoading, disabled = false, language, setLanguage, initialMode, onModeChange 
}) => {
  const [query, setQuery] = useState('');
  const [_isFocused, setIsFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImage(event.target?.result as string);
        setIsMenuOpen(false);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const startSpeakToType = async () => {
    if (disabled || !onSpeakToType || isSpeaking) return;
    setSpeakError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size < 1000) { setIsSpeaking(false); return; }
        try {
          const text = await onSpeakToType(blob);
          if (text) setQuery((q) => (q ? q + ' ' + text : text));
        } catch {
          setSpeakError('Could not transcribe. Try again.');
        }
        setIsSpeaking(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsSpeaking(true);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setSpeakError('Microphone denied. Allow mic in browser and try again.');
      } else if (typeof location !== 'undefined' && location?.protocol !== 'https:' && !location?.hostname?.match(/^localhost$/i)) {
        setSpeakError('Mic needs HTTPS or localhost.');
      } else {
        setSpeakError('Mic unavailable. Check device and permissions.');
      }
      setIsSpeaking(false);
    }
  };

  const stopSpeakToType = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  };

  const handleSubmit = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;
    if ((query.trim() || attachedImage) && !isLoading) {
      onSearch(query, initialMode, language, attachedImage || undefined);
      setQuery('');
      setAttachedImage(null);
      setIsMenuOpen(false);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 80)}px`;
    }
  }, [query]);

  const agents = [
    { mode: AgentMode.STANDARD, label: 'Standard', icon: MessageSquare, color: 'text-white', desc: 'General Chat' },
    { mode: AgentMode.RESEARCH, label: 'Research', icon: Hash, color: 'text-[#FF9933]', desc: 'Reasoning' },
    { mode: AgentMode.CODER, label: 'Coder', icon: Terminal, color: 'text-[#138808]', desc: 'Logic' },
    { mode: AgentMode.EDUCATOR, label: 'Educator', icon: BookOpen, color: 'text-purple-400', desc: 'Learning' },
    { mode: AgentMode.BROWSER, label: 'Browser', icon: Globe, color: 'text-blue-400', desc: 'Real-time' },
    { mode: AgentMode.EXECUTIVE, label: 'Executive', icon: Briefcase, color: 'text-yellow-400', desc: 'Planner' },
    { mode: AgentMode.SHOPPER, label: 'Shopper', icon: ShoppingBag, color: 'text-emerald-400', desc: 'Market' },
  ];

  const currentAgent = agents.find(a => a.mode === initialMode) || agents[0];

  return (
    <div className="relative w-full max-w-2xl mx-auto px-2 sm:px-4">
      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={cameraInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        capture="environment"
        id="omnibox-camera-input"
        className="hidden" 
      />

      {/* Compact Tool Menu */}
      {isMenuOpen && (
        <div 
          ref={menuRef}
          className="absolute bottom-full mb-4 left-0 right-0 max-h-[70vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-2xl sm:rounded-[2rem] shadow-[0_15px_40px_rgba(0,0,0,0.8)] z-[200] animate-in slide-in-from-bottom-2 duration-200 no-scrollbar"
        >
          <div className="p-4 sm:p-5">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-6">
              {[
                { icon: Camera, label: 'Camera', onClick: () => { cameraInputRef.current?.click(); } },
                { icon: ImageIcon, label: 'Photos', onClick: () => { fileInputRef.current?.click(); } },
                { icon: Paperclip, label: 'Files', onClick: () => { fileInputRef.current?.click(); } }
              ].map((tool, idx) => (
                <button 
                  key={idx} 
                  onClick={tool.onClick}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl hover:bg-[#1c2128] transition-all group active:scale-95"
                >
                  <tool.icon size={14} className="text-gray-400 group-hover:text-white" />
                  <span className="text-[9px] font-bold text-gray-500 group-hover:text-white uppercase tracking-widest">{tool.label}</span>
                </button>
              ))}
            </div>

            {/* Units Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
               <Sparkles size={12} className="text-[#FF9933]" />
               <span className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-600">Intelligence Units</span>
            </div>
            
            {/* Unit Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {agents.map((agent) => (
                <button 
                  key={agent.mode}
                  onClick={() => { onModeChange(agent.mode); setIsMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all border ${initialMode === agent.mode ? 'bg-[#FF9933]/10 border-[#FF9933]/40 shadow-sm' : 'bg-[#0d1117] border-[#30363d] hover:bg-[#1c2128]'}`}
                >
                  <div className={`p-1.5 rounded-lg ${initialMode === agent.mode ? 'bg-[#FF9933]/20' : 'bg-[#161b22]'}`}>
                    <agent.icon size={14} className={agent.color} />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-white leading-none">{agent.label}</span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600 mt-1">{agent.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attachment Preview */}
      {attachedImage && (
        <div className="absolute bottom-[calc(100%+16px)] left-4 z-[210] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="relative group">
            <img src={attachedImage} className="w-20 h-20 object-cover rounded-xl border-2 border-[#FF9933] shadow-xl" alt="Preview" />
            <button 
              onClick={() => setAttachedImage(null)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-700 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Compact bar — Cursor-style: one slim row + optional voice row */}
      <div className="rounded-xl sm:rounded-2xl border border-[#FF9933]/40 overflow-hidden bg-[#161b22] shadow-lg">
        <div className="flex items-center gap-2 px-2 sm:px-3 py-2 min-h-0">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            disabled={disabled}
            className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 border rounded-lg flex items-center justify-center transition-all active:scale-90 touch-manual ${
              disabled
                ? "bg-[#0d1117] border-[#30363d] text-gray-700 opacity-60 cursor-not-allowed"
                : isMenuOpen
                  ? "bg-[#FF9933] border-[#FF9933] text-white"
                  : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
            }`}
            title="Modes & attach"
          >
            {isMenuOpen ? <X size={16} /> : <currentAgent.icon size={16} className={currentAgent.color} />}
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            onKeyDown={(e) => !disabled && e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
            placeholder={disabled ? "Sign in to start chatting..." : (initialMode === AgentMode.STANDARD ? "Ask InBharat..." : `Ask ${currentAgent.label}...`)}
            className={`flex-1 bg-transparent text-white placeholder-gray-500 py-1.5 sm:py-2 resize-none outline-none text-sm sm:text-base font-medium min-h-[36px] max-h-[80px] ${
              disabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
            data-testid="chat-input"
          />
          {onSpeakToType && (
            <button
              type="button"
              onClick={isSpeaking ? stopSpeakToType : startSpeakToType}
              disabled={isLoading || disabled}
              className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center touch-manual ${
                disabled
                  ? "bg-[#0d1117] border-[#30363d] text-gray-700 opacity-60 cursor-not-allowed"
                  : isSpeaking
                    ? "bg-red-500/20 border-red-500/50 text-red-400"
                    : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
              }`}
              title={isSpeaking ? 'Stop' : 'Speak'}
            >
              {isSpeaking ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button
            onClick={onLiveClick}
            disabled={disabled}
            className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-all touch-manual ${
              disabled
                ? "bg-[#0d1117] border-[#30363d] text-gray-700 opacity-60 cursor-not-allowed"
                : "bg-[#0d1117] border-[#30363d] text-[#FF9933] hover:bg-[#FF9933] hover:text-white"
            }`}
            title="Live"
          >
            <Mic size={14} />
          </button>
          <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center justify-center relative group ${disabled ? "opacity-60" : ""}`}>
            <Languages size={12} className="text-[#FF9933]" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={disabled}
              className={`absolute inset-0 w-full h-full opacity-0 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
              aria-label="Language"
            >
              {indianLanguages.map(l => <option key={l.code} value={l.code}>{l.code}</option>)}
            </select>
          </div>
          <button 
            onClick={handleSubmit} 
            disabled={disabled || (!query.trim() && !attachedImage) || isLoading}
            className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center touch-manual ${
              disabled
                ? "bg-[#0d1117] border border-[#30363d] text-gray-700 opacity-60 cursor-not-allowed"
                : (query.trim() || attachedImage) && !isLoading
                  ? "bg-[#FF9933] text-white"
                  : "bg-[#0d1117] border border-[#30363d] text-gray-600"
            }`}
          >
            {isLoading ? <Zap size={14} className="animate-spin text-[#FF9933]" /> : <Send size={14} />}
          </button>
        </div>
        {(speakError) && <p className="text-[10px] text-red-400/90 px-3 pb-1">{speakError}</p>}
      </div>
    </div>
  );
};

export default Omnibox;
