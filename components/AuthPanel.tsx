import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

type Mode = "signin" | "signup" | "magiclink" | "forgot";

type AuthPanelProps = { onSuccess?: () => void };

export default function AuthPanel({ onSuccess }: AuthPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (mode === "forgot" || mode === "magiclink") return true;
    return password.length >= 6;
  }, [email, password, mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const baseRedirect =
        (import.meta as any).env?.VITE_AUTH_REDIRECT_URL as string | undefined;
      const redirectTo =
        typeof window !== "undefined"
          ? (baseRedirect && baseRedirect.trim()) || `${window.location.origin}/app`
          : undefined;

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setMessage(t("authSignedIn"));
        onSuccess?.();
      } else if (mode === "magiclink") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
        });
        if (error) throw error;
        setMessage(t("authCheckEmail"));
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
        });
        if (error) throw error;
        if (data.session) {
          setMessage(t("authAccountCreated"));
          onSuccess?.();
        } else {
          setMessage(t("authAccountCreatedVerify"));
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirectTo || undefined,
        });
        if (error) throw error;
        setMessage(t("authResetSent"));
      }
    } catch (err: unknown) {
      const text =
        (err as { message?: string })?.message ||
        t("authError");
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  const isModal = !!onSuccess;
  return (
    <div className={`flex items-center justify-center px-4 py-6 ${isModal ? "min-h-0 py-4" : "min-h-[70vh] py-10"}`}>
      <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl p-6 shadow-2xl">
        <h2 className="text-xl font-black text-white mb-2">{t("signInToInBharat")}</h2>
        <p className="text-sm text-gray-400 mb-5">
          {t("signInSubtitle")}
        </p>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
              mode === "signin"
                ? "bg-[#FF9933]/15 border-[#FF9933]/40 text-white"
                : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
            }`}
          >
            {t("signIn")}
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
              mode === "signup"
                ? "bg-[#FF9933]/15 border-[#FF9933]/40 text-white"
                : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
            }`}
          >
            {t("signUp")}
          </button>
          <button
            type="button"
            onClick={() => setMode("magiclink")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
              mode === "magiclink"
                ? "bg-[#FF9933]/15 border-[#FF9933]/40 text-white"
                : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
            }`}
          >
            {t("magicLink")}
          </button>
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
              mode === "forgot"
                ? "bg-[#FF9933]/15 border-[#FF9933]/40 text-white"
                : "bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-white"
            }`}
          >
            {t("resetPassword")}
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{t("emailLabel")}</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className="mt-2 w-full px-4 py-3 rounded-xl bg-[#0d1117] border border-[#30363d] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#FF9933]/60"
              disabled={busy}
            />
          </label>

          {mode !== "forgot" && mode !== "magiclink" && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                {t("passwordLabel")}
              </span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={t("passwordPlaceholder")}
                className="mt-2 w-full px-4 py-3 rounded-xl bg-[#0d1117] border border-[#30363d] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#FF9933]/60"
                disabled={busy}
              />
              {mode === "signup" && (
                <p className="mt-2 text-xs text-gray-500">{t("passwordHint")}</p>
              )}
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="w-full py-3 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] disabled:opacity-50 text-white font-black transition-all"
          >
            {busy ? t("pleaseWait") : mode === "signin" ? t("signIn") : mode === "signup" ? t("createAccount") : mode === "magiclink" ? t("sendMagicLink") : t("sendResetEmail")}
          </button>
        </form>

        {message && (
          <div className="mt-5 text-sm text-gray-300 bg-black/30 border border-[#30363d] rounded-xl p-3">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

