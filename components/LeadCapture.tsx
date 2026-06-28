import React, { useState } from "react";
import { trackEvent } from "../lib/analytics";

/**
 * <LeadCapture /> — reusable lead-capture form (the capture layer of the Lead
 * Generation design, docs/LEAD_GENERATION.md). Posts to /api/growth/leads with
 * full attribution stamped client-side (source_path from window.location,
 * utm_* parsed from the query string, referrer from document.referrer).
 *
 * Props:
 *   kind         — the lead intent, e.g. 'newsletter' | 'contact' | 'waitlist:unoone'
 *   sourceSlug   — article slug if embedded on an article page (optional)
 *   ctaLabel     — the submit button label
 *   placeholder — the email input placeholder
 *   consentText  — the consent statement the user agrees to (required, stored on the row)
 *   compact      — one-line newsletter style (footer); default is the fuller form
 *   showNameCompany — show optional name + company fields (contact style)
 *
 * The hidden `website` field is a honeypot — real users never see it; bots fill it
 * and the API silently discards the submission. Never auto-publishes, never sends
 * email — the endpoint only stores the lead for the (human-gated) Growth Agent to
 * later reason about. See docs/LEAD_GENERATION.md §7.
 */
interface LeadCaptureProps {
  kind: string;
  sourceSlug?: string;
  ctaLabel?: string;
  placeholder?: string;
  consentText: string;
  compact?: boolean;
  showNameCompany?: boolean;
}

type Status = "idle" | "submitting" | "ok" | "error";

function readUtms(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => p.get(k) ?? "";
  return {
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"),
    utm_term: get("utm_term"),
  };
}

const LeadCapture: React.FC<LeadCaptureProps> = ({
  kind,
  sourceSlug,
  ctaLabel = "Subscribe",
  placeholder = "you@example.com",
  consentText,
  compact = false,
  showNameCompany = false,
}) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!consent) {
      setError("Please accept the consent note to continue.");
      return;
    }
    setStatus("submitting");
    trackEvent(`lead_submit_${kind}`);
    try {
      const utm = readUtms();
      const res = await fetch("/api/growth/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email, name: name || undefined, company: company || undefined,
          kind, sourceSlug,
          sourcePath: typeof window !== "undefined" ? window.location.pathname : undefined,
          referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
          consent: true, consentText, website,
          ...utm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setStatus("ok");
        setEmail(""); setName(""); setCompany(""); setConsent(false);
      } else {
        setStatus("error");
        setError(res.status === 429
          ? "Too many attempts — please try again in a minute."
          : "We couldn't save your details. Please email info@inbharat.ai instead.");
      }
    } catch {
      setStatus("error");
      setError("Network error. Please email info@inbharat.ai instead.");
    }
  };

  if (status === "ok") {
    return (
      <p className="rounded-2xl border border-[#f59f4f]/30 bg-[#f59f4f]/10 p-4 text-[13.5px] leading-snug text-[#f5b76f]">
        ✓ Thank you — we&apos;ll be in touch. (Check your inbox for a confirmation.)
      </p>
    );
  }

  const inputCls = "w-full rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-2.5 text-[14px] text-white placeholder:text-[#5d728a] outline-none transition-colors focus:border-[#f59f4f]/50";

  if (compact) {
    return (
      <form onSubmit={submit} className="space-y-2" aria-label="Newsletter signup">
        {/* honeypot — visually hidden, not display:none (bots often skip hidden) */}
        <input type="text" name="website" value={website} tabIndex={-1} autoComplete="off"
          onChange={(e) => setWebsite(e.target.value)}
          aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={placeholder} required aria-label="Email address"
            className={inputCls + " flex-1"} />
          <button type="submit" disabled={status === "submitting"}
            className="rounded-xl bg-[#f59f4f] px-5 py-2.5 text-[14px] font-bold text-[#0a0f18] transition-colors hover:bg-[#f5b76f] disabled:opacity-50">
            {status === "submitting" ? "…" : ctaLabel}
          </button>
        </div>
        <label className="flex items-start gap-2 text-[11.5px] leading-snug text-[#7a9ab8]">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-[#f59f4f]" />
          <span>{consentText}</span>
        </label>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5" aria-label="Lead capture form">
      <input type="text" name="website" value={website} tabIndex={-1} autoComplete="off"
        onChange={(e) => setWebsite(e.target.value)}
        aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder={placeholder} required aria-label="Email address"
        className={inputCls} />
      {showNameCompany && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)" aria-label="Name"
            className={inputCls} />
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional)" aria-label="Company"
            className={inputCls} />
        </div>
      )}
      <label className="flex items-start gap-2 text-[12px] leading-snug text-[#9aafc6]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-[#f59f4f]" />
        <span>{consentText}</span>
      </label>
      {error && <p className="text-[12.5px] text-red-400">{error}</p>}
      <button type="submit" disabled={status === "submitting"}
        className="w-full rounded-xl bg-[#f59f4f] px-5 py-2.5 text-[14px] font-bold text-[#0a0f18] transition-colors hover:bg-[#f5b76f] disabled:opacity-50">
        {status === "submitting" ? "Sending…" : ctaLabel}
      </button>
    </form>
  );
};

export default LeadCapture;