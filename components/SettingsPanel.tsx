import { useState, useEffect } from "react";
import { X, Volume2, Trash2, Mic } from "lucide-react";
import { getVoiceSettings, setVoiceSettings, VOICE_OPTIONS, type VoiceSettings } from "../lib/settings";
import { clearSearchCache } from "../services/openaiService";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<VoiceSettings>(getVoiceSettings());
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    setSettings(getVoiceSettings());
  }, [isOpen]);

  const update = (partial: Partial<VoiceSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    setVoiceSettings(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label="Settings">
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-lg font-bold text-white">Voice &amp; speech</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-[#30363d] transition-all"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
              <Volume2 size={16} className="text-[#FF9933]" />
              Speech rate
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.speechRate}
              onChange={(e) => update({ speechRate: parseFloat(e.target.value) })}
              className="w-full h-2 bg-[#0d1117] rounded-full appearance-none cursor-pointer accent-[#FF9933]"
            />
            <p className="text-xs text-gray-500 mt-1">{settings.speechRate.toFixed(1)}x</p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
              <Mic size={16} className="text-[#FF9933]" />
              Voice
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => update({ voice: v.value })}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all text-xs ${
                    settings.voice === v.value
                      ? "bg-[#FF9933]/15 border-[#FF9933]/50 text-[#FF9933]"
                      : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-[#FF9933]/30 hover:text-gray-200"
                  }`}
                >
                  <span className="font-bold block">{v.label}</span>
                  <span className="text-[10px] opacity-70">{v.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
              <Volume2 size={16} className="text-[#FF9933]" />
              TTS quality
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update({ ttsModel: "tts-1" })}
                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                  settings.ttsModel === "tts-1"
                    ? "bg-[#FF9933]/15 border-[#FF9933]/50 text-[#FF9933]"
                    : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-[#FF9933]/30"
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => update({ ttsModel: "tts-1-hd" })}
                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                  settings.ttsModel === "tts-1-hd"
                    ? "bg-[#FF9933]/15 border-[#FF9933]/50 text-[#FF9933]"
                    : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-[#FF9933]/30"
                }`}
              >
                HD
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">HD provides higher quality but is slower</p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Auto-read AI responses</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoRead}
              onClick={() => update({ autoRead: !settings.autoRead })}
              className={`relative w-11 h-6 rounded-full transition-colors touch-manual ${settings.autoRead ? "bg-[#FF9933]" : "bg-[#30363d]"}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoRead ? "left-6" : "left-1"}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Push-to-talk (tap to record)</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.pushToTalk}
              onClick={() => update({ pushToTalk: !settings.pushToTalk })}
              className={`relative w-11 h-6 rounded-full transition-colors touch-manual ${settings.pushToTalk ? "bg-[#FF9933]" : "bg-[#30363d]"}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.pushToTalk ? "left-6" : "left-1"}`}
              />
            </button>
          </div>

          <div className="pt-2 border-t border-[#30363d]">
            <button
              type="button"
              onClick={() => {
                clearSearchCache();
                setCacheCleared(true);
                setTimeout(() => setCacheCleared(false), 2000);
              }}
              className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white hover:border-[#FF9933]/50 transition-all text-sm font-medium touch-manual"
            >
              <Trash2 size={16} className="text-[#FF9933]" />
              {cacheCleared ? "Cache cleared" : "Clear search cache"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
