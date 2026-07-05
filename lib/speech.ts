/**
 * lib/speech.ts — shared browser voice hooks for the Growth Command Center.
 *
 * useVoiceInput: webkitSpeechRecognition STT → onTranscript(final) + onEnd. Sets
 * the transcript into a textarea (or auto-sends). Graceful no-op when unsupported
 * (Safari/Firefox vary; the hook reports supported:false so the UI can hide the mic).
 * useVoiceOutput: window.speechSynthesis TTS for optional agent-reply read-back
 * (free browser TTS — no OpenAI cost). Both are client-only; safe to import server-
 * side (the hooks no-op when typeof window === 'undefined').
 *
 * Nothing here auto-submits or auto-publishes. Voice only feeds the NL input; the
 * founder still clicks Send (or auto-send-on-end is opt-in) and every publish stays
 * a human click. No new command parser — the model routes NL to tools as today.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceInputOptions {
  locale?: string;
  onFinal?: (transcript: string) => void;
  onInterim?: (transcript: string) => void;
  onEnd?: () => void;
}

export interface VoiceInput {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /** Last final transcript (handy when the hook is used without a callback). */
  transcript: string;
}

/**
 * Mic → STT. Returns a control object. Call toggle() from a mic button; the
 * final transcript is delivered via onFinal + reflected in `transcript`.
 * Auto-restarts on accidental early stop while the user hasn't toggled off.
 */
export function useVoiceInput(opts: VoiceInputOptions = {}): VoiceInput {
  const Ctor = getRecognitionCtor();
  const supported = Ctor !== null;
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantOnRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    if (!recRef.current) {
      const rec = new Ctor();
      rec.lang = optsRef.current.locale ?? "en-IN";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let finalText = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interimText += r[0].transcript;
        }
        if (interimText) optsRef.current.onInterim?.(interimText);
        if (finalText) {
          setTranscript((prev) => (prev ? prev + " " : "") + finalText.trim());
          optsRef.current.onFinal?.(finalText.trim());
        }
      };
      rec.onend = () => {
        // If the user hasn't toggled off, restart so a pause doesn't kill the
        // session mid-sentence. The browser sometimes fires onend spuriously.
        if (wantOnRef.current) {
          try { rec.start(); return; } catch { /* fall through */ }
        }
        setListening(false);
        optsRef.current.onEnd?.();
      };
      rec.onerror = () => {
        wantOnRef.current = false;
        setListening(false);
      };
      recRef.current = rec;
    }
    wantOnRef.current = true;
    try { recRef.current.start(); setListening(true); } catch { /* already started */ }
  }, [Ctor]);

  const toggle = useCallback(() => { if (listening) stop(); else start(); }, [listening, start, stop]);

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ignore */ } }, []);

  return { supported, listening, start, stop, toggle, transcript };
}

export interface VoiceOutput {
  supported: boolean;
  speaking: boolean;
  speak: (text: string) => void;
  cancel: () => void;
}

/** Optional TTS read-back of agent replies via the free browser speechSynthesis. */
export function useVoiceOutput(): VoiceOutput {
  const supported = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
  const [speaking, setSpeaking] = useState(false);

  const cancel = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-IN";
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
      setSpeaking(true);
    } catch { /* ignore */ }
  }, [supported]);

  useEffect(() => () => { try { supported && window.speechSynthesis.cancel(); } catch { /* ignore */ } }, [supported]);

  return { supported, speaking, speak, cancel };
}

/**
 * Build a compact "screen awareness" context block the founder can append to a
 * voice command so the agent knows where they are. Pure + sync — reads the
 * current route + a few counts the UI passes in. Returns "" when nothing useful.
 */
export function buildContextBlock(opts: {
  pathname: string;
  pendingDraftCount?: number;
  lastOutcomeDelta?: number | null;
  activeThreadTitle?: string | null;
}): string {
  const bits: string[] = [];
  // Article slug when the founder is viewing a published article page.
  const m = opts.pathname.match(/\/learn-ai-with-reeturaj\/([a-z0-9-]+)/i);
  if (m) bits.push(`viewing article slug: ${m[1]}`);
  if (typeof opts.pendingDraftCount === "number" && opts.pendingDraftCount > 0) {
    bits.push(`${opts.pendingDraftCount} pending draft(s) awaiting review`);
  }
  if (opts.lastOutcomeDelta != null) bits.push(`last published article SEO delta: ${opts.lastOutcomeDelta}`);
  if (opts.activeThreadTitle) bits.push(`active thread: "${opts.activeThreadTitle}"`);
  return bits.length ? `Context: ${bits.join("; ")}.` : "";
}