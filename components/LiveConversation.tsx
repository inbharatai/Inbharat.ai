import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Volume2, VolumeX, Sparkles, AlertCircle, ChevronDown, Languages, Loader2 } from 'lucide-react';
import TricolourStar from './TricolourStar';
import { NexusAgent } from '../services/openaiService';

interface LiveConversationProps {
  onClose: () => void;
  language: string;
}

const languageMetadata: Record<string, { name: string; native: string; script: string }> = {
  "EN": { name: "English", native: "English", script: "Latin" },
  "HI": { name: "Hindi", native: "हिन्दी", script: "Devanagari" },
  "BN": { name: "Bengali", native: "বাংলা", script: "Bengali" },
  "TA": { name: "Tamil", native: "தமிழ்", script: "Tamil" },
  "TE": { name: "Telugu", native: "తెలుగు", script: "Telugu" },
  "MR": { name: "Marathi", native: "मराठी", script: "Devanagari" },
  "GU": { name: "Gujarati", native: "ગુજરાતી", script: "Gujarati" },
  "KN": { name: "Kannada", native: "ಕನ್ನಡ", script: "Kannada" },
  "ML": { name: "Malayalam", native: "മലയാളം", script: "Malayalam" },
  "PA": { name: "Punjabi", native: "ਪੰਜਾਬੀ", script: "Gurmukhi" },
  "OR": { name: "Odia", native: "ଓଡ଼ିଆ", script: "Odia" },
  "UR": { name: "Urdu", native: "اردو", script: "Urdu" },
  "AS": { name: "Assamese", native: "অসমীয়া", script: "Assamese" },
  "SA": { name: "Sanskrit", native: "संस्कृतम्", script: "Devanagari" }
};

const LiveConversation: React.FC<LiveConversationProps> = ({ onClose, language: initialLanguage }) => {
  const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'speaking' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserInRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentRef = useRef(new NexusAgent());
  const animationIdRef = useRef<number>(0);
  const isOutputMutedRef = useRef(false);
  useEffect(() => { isOutputMutedRef.current = isOutputMuted; }, [isOutputMuted]);

  const requestMic = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone not supported in this browser.');
      setStatus('error');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef.current) audioContextRef.current.close();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserInRef.current = analyser;
      return true;
    } catch (err: any) {
      setErrorMessage(err?.name === 'NotAllowedError' ? 'Microphone access denied. Allow mic in browser settings and try again.' : 'Could not access microphone. Use HTTPS or localhost and check permissions.');
      setStatus('error');
      return false;
    }
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (status !== 'recording' || !isMicMuted) return;
    const stopRecording = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
    return () => stopRecording();
  }, [isMicMuted, status]);

  const startRecording = async () => {
    if (!streamRef.current) {
      const ok = await requestMic();
      if (!ok) return;
    }
    setUserText('');
    setAiText('');
    setErrorMessage('');
    setStatus('recording');
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(streamRef.current, options);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      setStatus('processing');
      try {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          setStatus('idle');
          return;
        }
        const text = await agentRef.current.transcribe(blob);
        setUserText(text);
        if (!text.trim()) {
          setStatus('idle');
          return;
        }
        const { text: aiReply, audioBase64 } = await agentRef.current.liveReply(text, currentLanguage);
        setAiText(aiReply);
        setStatus('speaking');
        if (audioBase64 && !isOutputMutedRef.current) {
          const binary = atob(audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
          const audio = new Audio(url);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setStatus('idle');
          };
          await audio.play();
        } else {
          setStatus('idle');
        }
      } catch (err: any) {
        console.error('Live conversation error:', err);
        const msg = err?.message || err?.error?.message || '';
        if (msg.includes('OPENAI_API_KEY') || msg.includes('api_key') || msg.includes('Incorrect API key')) {
          setErrorMessage('Invalid or missing OpenAI API key. Check your .env file.');
        } else if (msg.includes('rate') || msg.includes('quota')) {
          setErrorMessage('API rate limit reached. Please try again in a moment.');
        } else {
          setErrorMessage(msg.slice(0, 120) || 'Voice request failed. Check connection and try again.');
        }
        setStatus('error');
      }
    };
    recorder.start(200);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleMicClick = () => {
    if (status === 'processing') return;
    if (status === 'recording') {
      setIsMicMuted(true);
      stopRecording();
      return;
    }
    if (status === 'idle') {
      setIsMicMuted(false);
      startRecording();
    }
  };

  useEffect(() => {
    const draw = () => {
      if (!canvasRef.current || !analyserInRef.current) {
        animationIdRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvasRef.current.getContext('2d')!;
      const data = new Uint8Array(analyserInRef.current.fftSize);
      analyserInRef.current.getByteTimeDomainData(data);
      const cx = canvasRef.current.width / 2;
      const cy = canvasRef.current.height / 2;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const val = (data[i] - 128) / 128;
        const radius = 85 + val * 60;
        const angle = (i / data.length) * Math.PI * 2;
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.strokeStyle = status === 'recording' ? '#FF9933' : '#30363d';
      ctx.lineWidth = status === 'recording' ? 4 : 2;
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const val = (data[i] - 128) / 128;
        const radius = 110 + val * 80;
        const angle = (i / data.length) * Math.PI * 2;
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.strokeStyle = status === 'speaking' ? '#138808' : '#30363d';
      ctx.lineWidth = status === 'speaking' ? 4 : 2;
      ctx.stroke();

      animationIdRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationIdRef.current);
  }, [status]);

  const statusLabel = status === 'recording' ? 'Listening...' : status === 'processing' ? 'Thinking...' : status === 'speaking' ? aiText || 'Speaking...' : 'Tap mic to speak';

  return (
    <div className="fixed inset-0 z-[600] bg-[#050505] flex flex-col items-center justify-center p-4 sm:p-6 safe-top safe-bottom animate-in fade-in duration-500 overflow-auto">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(234,88,12,0.06),transparent_70%)] pointer-events-none" />

      <button onClick={onClose} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 min-h-[44px] min-w-[44px] bg-[#161b22] border border-[#30363d] rounded-full text-gray-500 hover:text-white transition-all z-[610] shadow-lg touch-manual" aria-label="Close">
        <X size={20} />
      </button>

      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-[620]">
        <button
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 min-h-[44px] bg-[#161b22] border border-[#30363d] rounded-xl sm:rounded-2xl text-white hover:border-[#FF9933]/50 transition-all shadow-xl group touch-manual"
        >
          <Languages size={18} className="text-[#FF9933] flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-black tracking-widest truncate max-w-[120px] sm:max-w-none">{languageMetadata[currentLanguage].native}</span>
          <ChevronDown size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${showLangMenu ? 'rotate-180' : ''}`} />
        </button>
        {showLangMenu && (
          <div className="absolute top-full mt-2 left-0 w-64 max-h-[60vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl sm:rounded-2xl shadow-2xl no-scrollbar animate-in zoom-in-95 duration-200">
            {Object.entries(languageMetadata).map(([code, meta]) => (
              <button
                key={code}
                onClick={() => { setCurrentLanguage(code); setShowLangMenu(false); }}
                className={`w-full text-left px-4 sm:px-5 py-3.5 min-h-[44px] text-xs font-bold hover:bg-[#1c2128] transition-all flex items-center justify-between touch-manual ${currentLanguage === code ? 'text-[#FF9933] bg-[#FF9933]/10' : 'text-gray-400'}`}
              >
                <span>{meta.name} ({meta.native})</span>
                {currentLanguage === code && <div className="w-1.5 h-1.5 bg-[#FF9933] rounded-full" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-6 sm:gap-12 w-full max-w-xl relative flex-1 justify-center min-h-0 py-4">
        <div className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 flex items-center justify-center flex-shrink-0">
          <canvas ref={canvasRef} width={600} height={600} className="absolute inset-0 w-full h-full opacity-70" />
          <div className={`relative w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 bg-[#0a0a0a] border-4 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${status === 'recording' ? 'border-[#FF9933] shadow-[#FF9933]/30' : status === 'speaking' ? 'border-[#138808] shadow-[#138808]/30 scale-105' : 'border-[#30363d]'}`}>
            <TricolourStar size={72} className={`w-14 h-14 sm:w-16 sm:h-16 md:w-[72px] md:h-[72px] ${status === 'recording' ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        <div className="text-center space-y-4 sm:space-y-6 w-full px-2">
          <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-2.5 bg-[#FF9933]/10 border border-[#FF9933]/40 rounded-full animate-in zoom-in-95">
            <Sparkles size={16} className="text-[#FF9933] animate-pulse flex-shrink-0" />
            <span className="text-[11px] sm:text-[13px] font-black tracking-[0.3em] sm:tracking-[0.4em] text-white">
              {languageMetadata[currentLanguage].name} Voice • OpenAI
            </span>
          </div>

          <div className="min-h-[5rem] sm:min-h-[7rem] px-4 sm:px-10">
            {status === 'error' ? (
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="text-red-500" size={44} />
                <p className="text-red-500 font-black text-xl uppercase tracking-widest">Something went wrong</p>
                {errorMessage && (
                  <p className="text-gray-400 text-sm max-w-md px-4">{errorMessage}</p>
                )}
                <button
                  onClick={async () => { setErrorMessage(''); setStatus('idle'); await requestMic(); }}
                  className="mt-2 px-6 py-3 min-h-[44px] bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold rounded-xl transition-colors touch-manual"
                >
                  Try again
                </button>
              </div>
            ) : status === 'processing' ? (
              <div className="flex items-center justify-center gap-3">
                <Loader2 size={32} className="animate-spin text-[#FF9933]" />
                <span className="text-xl font-bold text-white">Thinking...</span>
              </div>
            ) : (
              <h2 className={`text-2xl sm:text-4xl md:text-5xl font-black leading-tight animate-in fade-in duration-500 break-words ${status === 'recording' ? 'text-[#FF9933]' : status === 'speaking' ? 'text-[#138808]' : 'text-white'}`}>
                {aiText || userText || statusLabel}
              </h2>
            )}
          </div>

          <div className="flex justify-center min-h-[3rem] sm:h-12">
            {userText && (
              <p className="text-sm sm:text-lg font-bold text-white/80 italic animate-in slide-in-from-bottom-4 duration-500 px-2 break-words">
                &quot;{userText}&quot;
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-8 sm:gap-12 mt-2 sm:mt-4 pb-4 sm:pb-8">
          <button
            onClick={() => setIsOutputMuted(!isOutputMuted)}
            className={`w-14 h-14 sm:w-16 sm:h-16 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center border transition-all shadow-2xl touch-manual ${isOutputMuted ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-[#161b22] border-[#30363d] text-gray-400 hover:text-white'}`}
          >
            {isOutputMuted ? <VolumeX size={28} className="sm:w-8 sm:h-8" /> : <Volume2 size={28} className="sm:w-8 sm:h-8" />}
          </button>

          <button
            onClick={handleMicClick}
            disabled={status === 'processing'}
            className={`w-24 h-24 sm:w-28 sm:h-28 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl touch-manual ${status === 'recording' ? 'bg-[#FF9933] text-white animate-pulse' : status === 'processing' ? 'bg-[#161b22] border-2 border-[#30363d] text-gray-500 cursor-not-allowed' : 'bg-[#161b22] border-2 border-[#30363d] text-gray-400 hover:border-[#FF9933] hover:text-white'}`}
          >
            {status === 'processing' ? <Loader2 size={40} className="animate-spin sm:w-11 sm:h-11" /> : status === 'recording' ? <MicOff size={40} className="sm:w-11 sm:h-11" /> : <Mic size={40} className="sm:w-11 sm:h-11" />}
          </button>
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 -mt-2 sm:-mt-4">Tap mic to start, tap again to send</p>
      </div>
    </div>
  );
};

export default LiveConversation;
