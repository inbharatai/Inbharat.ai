const STORAGE_KEY = "inbharat_voice_settings";

export type VoiceName = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export const VOICE_OPTIONS: { value: VoiceName; label: string; description: string }[] = [
  { value: "nova", label: "Nova", description: "Warm, natural female voice" },
  { value: "shimmer", label: "Shimmer", description: "Soft, expressive female voice" },
  { value: "alloy", label: "Alloy", description: "Balanced, neutral voice" },
  { value: "echo", label: "Echo", description: "Clean, clear male voice" },
  { value: "fable", label: "Fable", description: "Narrative, storytelling voice" },
  { value: "onyx", label: "Onyx", description: "Deep, authoritative male voice" },
];

export interface VoiceSettings {
  speechRate: number;
  autoRead: boolean;
  pushToTalk: boolean;
  voice: VoiceName;
  ttsModel: "tts-1" | "tts-1-hd";
}

const defaults: VoiceSettings = {
  speechRate: 1,
  autoRead: false,
  pushToTalk: true,
  voice: "nova",
  ttsModel: "tts-1",
};

export function getVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      speechRate: typeof parsed.speechRate === "number" && parsed.speechRate >= 0.5 && parsed.speechRate <= 2 ? parsed.speechRate : defaults.speechRate,
      autoRead: typeof parsed.autoRead === "boolean" ? parsed.autoRead : defaults.autoRead,
      pushToTalk: typeof parsed.pushToTalk === "boolean" ? parsed.pushToTalk : defaults.pushToTalk,
      voice: VOICE_OPTIONS.some(v => v.value === parsed.voice) ? parsed.voice as VoiceName : defaults.voice,
      ttsModel: parsed.ttsModel === "tts-1-hd" ? "tts-1-hd" : defaults.ttsModel,
    };
  } catch {
    return defaults;
  }
}

export function setVoiceSettings(partial: Partial<VoiceSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getVoiceSettings();
    const next = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
