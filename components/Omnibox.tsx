import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Languages, Mic, MicOff, Zap, Camera, Image as ImageIcon, 
  Paperclip, X
} from 'lucide-react';
import { AgentMode } from '../types';
import { getSupportedMimeType, getNativeSpeechRecognition, getBCP47Locale } from '../services/openaiService';
import { useTranslation } from 'react-i18next';

interface OmniboxProps {
  onSearch: (query: string, mode: AgentMode, language: string, imageData?: string) => void;
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
  { code: "HI", label: "Hindi (\u0939\u093f\u0928\u094d\u0926\u0940)" },
  { code: "BN", label: "Bengali (\u09ac\u09be\u0982\u09b2\u09be)" },
  { code: "TA", label: "Tamil (\u0ba4\u0bae\u0bbf\u0bb4\u0bcd)" },
  { code: "TE", label: "Telugu (\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41)" },
  { code: "MR", label: "Marathi (\u092e\u0930\u093e\u0920\u0940)" },
  { code: "GU", label: "Gujarati (\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0)" },
  { code: "KN", label: "Kannada (\u0c95\u0ca8\u0ccd\u0ca8\u0ca1)" },
  { code: "ML", label: "Malayalam (\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02)" },
  { code: "PA", label: "Punjabi (\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40)" },
  { code: "OR", label: "Odia (\u0b13\u0b21\u0b3c\u0b3f\u0b06)" },
  { code: "UR", label: "Urdu (\u0627\u0631\u062f\u0648)" },
  { code: "AS", label: "Assamese (\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be)" },
  { code: "SA", label: "Sanskrit (\u0938\u0902\u0938\u094d\u0915\u0943\u0924\u092e\u094d)" }
];

const Omnibox: React.FC<OmniboxProps> = ({ 
  onSearch, onSpeakToType, isLoading, disabled = false, language, setLanguage, initialMode, onModeChange 
}) => {
  const { t } = useTranslation();
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
  const nativeSRRef = useRef<SpeechRecognition | null>(null);

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

    // Try native SpeechRecognition first (instant, no network)
    const SRConstructor = getNativeSpeechRecognition();
    if (SRConstructor) {
      try {
        const sr = new SRConstructor();
        sr.lang = getBCP47Locale(language);
        sr.interimResults = true;
        sr.continuous = false;
        sr.maxAlternatives = 1;
        nativeSRRef.current = sr;
        setIsSpeaking(true);

        sr.onresult = (event: SpeechRecognitionEvent) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (event.results[event.results.length - 1]?.isFinal && transcript.trim()) {
            setQuery((q) => (q ? q + ' ' + transcript.trim() : transcript.trim()));
          }
        };
        sr.onerror = (event: SpeechRecognitionErrorEvent) => {
          // 'no-speech' is not a real error, just silence
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setSpeakError(t('speechError'));
          }
          setIsSpeaking(false);
          nativeSRRef.current = null;
        };
        sr.onend = () => {
          setIsSpeaking(false);
          nativeSRRef.current = null;
        };
        sr.start();
        return;
      } catch {
        // Native failed, fall through to Whisper
      }
    }

    // Fallback: MediaRecorder + Whisper API
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
          setSpeakError(t('transcribeError'));
        }
        setIsSpeaking(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsSpeaking(true);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setSpeakError(t('micDenied'));
      } else if (typeof location !== 'undefined' && location?.protocol !== 'https:' && !location?.hostname?.match(/^localhost$/i)) {
        setSpeakError(t('micHttps'));
      } else {
        setSpeakError(t('micUnavailable'));
      }
      setIsSpeaking(false);
    }
  };

  const stopSpeakToType = () => {
    // Stop native SpeechRecognition if active
    if (nativeSRRef.current) {
      nativeSRRef.current.stop();
      nativeSRRef.current = null;
      return;
    }
    // Stop MediaRecorder if active
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

  // Intelligence Units moved to sidebar — no longer in omnibox menu


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
                { icon: Camera, label: t('camera'), onClick: () => { cameraInputRef.current?.click(); } },
                { icon: ImageIcon, label: t('photos'), onClick: () => { fileInputRef.current?.click(); } },
                { icon: Paperclip, label: t('files'), onClick: () => { fileInputRef.current?.click(); } }
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

      {/* Compact bar Ã¢â‚¬â€ Cursor-style: one slim row + optional voice row */}
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
            title={t('modesAndAttach')}
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
            placeholder={disabled ? t('signInToChat') : (initialMode === AgentMode.STANDARD ? t('askInBharat') : t('askMode', { mode: currentAgent.label }))}
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
              title={isSpeaking ? t('speakStop') : t('speakTitle')}
            >
              {isSpeaking ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
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
        {isSpeaking && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-t border-[#30363d]">
            <Globe size={12} className="text-[#FF9933] flex-shrink-0" />
            <span className="text-[9px] font-bold text-gray-300">{t('listening')}</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1 h-2 bg-[#FF9933] rounded-full animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        {(speakError) && <p className="text-[10px] text-red-400/90 px-3 pb-1">{speakError}</p>}
      </div>
    </div>
  );
};

export default Omnibox;
