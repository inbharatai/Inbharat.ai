const STORAGE_KEY = "inbharat_voice_settings";

export interface VoiceSettings {
  speechRate: number;
  autoRead: boolean;
  pushToTalk: boolean;
}

const defaults: VoiceSettings = {
  speechRate: 1,
  autoRead: false,
  pushToTalk: true,
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
