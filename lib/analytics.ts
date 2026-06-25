/**
 * Pluggable analytics surface.
 *
 * NO measurement provider is loaded unless `VITE_GA_MEASUREMENT_ID` is set
 * in the environment. All functions become no-ops when unset, so this file
 * is safe to import anywhere — including SSR-style imports — without any
 * privacy, performance, or CSP impact.
 *
 * When you're ready to turn analytics on:
 *   1. Create a GA4 property at https://analytics.google.com/
 *   2. Copy the Measurement ID (G-XXXXXXXXXX).
 *   3. In Vercel → Settings → Environment Variables, set
 *        VITE_GA_MEASUREMENT_ID = G-XXXXXXXXXX
 *      (Production, Preview, Development as you wish.)
 *   4. Uncomment the GA block in vercel.json's Content-Security-Policy
 *      (script-src + connect-src widening for googletagmanager.com and
 *      *.google-analytics.com).
 *   5. Redeploy. trackPageView/trackEvent will start flowing immediately
 *      because every CTA in the codebase is already wired through this file.
 */

const MEASUREMENT_ID = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
  ?.VITE_GA_MEASUREMENT_ID;

const ENABLED = typeof window !== 'undefined' && !!MEASUREMENT_ID;

type GtagFn = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

let initialised = false;

export function initAnalytics(): void {
  if (!ENABLED || initialised) return;
  initialised = true;

  // If the static HTML shell already baked in the gtag (build-seo.ts injects the
  // loader + config into <head> when VITE_GA_MEASUREMENT_ID is set), reuse that
  // loader + window.gtag instead of double-injecting. The shell's config call
  // already ran `gtag('config', ID, { send_page_view: false })`, so all we need
  // here is to confirm window.gtag exists — page_view events are fired below by
  // trackPageView as the SPA navigates.
  if (typeof window.gtag === 'function') return;

  // No shell-injected gtag (e.g. SPA-only render) — inject the GA loader now
  // (deferred so it never blocks LCP).
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID!)}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  // send_page_view is fired manually per route from React Router below.
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

export function trackPageView(path: string, title?: string): void {
  if (!ENABLED) return;
  if (!initialised) initAnalytics();
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  });
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (!ENABLED) return;
  if (!initialised) initAnalytics();
  window.gtag?.('event', name, params ?? {});
}

/** Useful guard for UI code that wants to know whether analytics is live. */
export const analyticsEnabled = ENABLED;
