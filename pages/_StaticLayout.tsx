import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Github, Instagram, Linkedin, Twitter } from 'lucide-react';
import { useDocumentHead } from '../lib/useDocumentHead';
import { SITE } from '../seo.config';

type Props = {
  title: string;
  description?: string;
  /** Optional eyebrow label shown above the H1 (e.g. "Legal", "Company"). */
  eyebrow?: string;
  /** Last-updated date for legal pages (rendered in the page header). */
  updated?: string;
  children: React.ReactNode;
};

/**
 * Brand-consistent chrome for the small static pages (Privacy/Terms/About/Contact/404).
 * Reuses the landing visual language without pulling in any landing-only animations.
 */
const StaticLayout: React.FC<Props> = ({ title, description, eyebrow, updated, children }) => {
  const { t } = useTranslation();
  useDocumentHead();

  return (
    <div className="landing-shell relative min-h-screen overflow-hidden bg-[#030508] text-white">
      <div className="landing-atmosphere" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030508]/70 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18]">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" width={20} height={20} />
            </div>
            <div>
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">INBHARAT</p>
              <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">AI Ecosystem</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#c0cfe0]">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 transition-all hover:border-white/20 hover:text-white"
            >
              <ArrowLeft size={12} aria-hidden="true" />
              Back to home
            </Link>
            <Link
              to="/app"
              className="hidden rounded-full bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-4 py-1.5 text-[#0a0c10] shadow-[0_0_20px_rgba(245,159,79,0.25)] transition-all hover:-translate-y-0.5 sm:inline-flex"
            >
              Try InBharat AI
            </Link>
          </div>
        </div>
      </nav>

      {/* Page body */}
      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
        <header className="mb-10">
          {eyebrow && (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-[#f59f4f]">
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-bold leading-[1.08] text-white sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.7] text-[#a8bfd4]">{description}</p>
          )}
          {updated && (
            <p className="mt-5 text-[12px] text-[#7a9ab8]">Last updated: {updated}</p>
          )}
        </header>

        <div className="prose-static space-y-6 text-[15px] leading-[1.75] text-[#c8d6e8]">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 sm:px-6 lg:px-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" width={20} height={20} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aafc6]">InBharat.ai</p>
            </div>
            <p className="text-[11px] text-[#7a9ab8]">{t('landFooterTagline') || 'Built in Bharat for India and the world.'}</p>
            <div className="flex items-center gap-3 text-[#96b0c8]">
              <a
                href={SITE.social.instagram}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on Instagram"
                className="rounded-full p-1.5 transition-colors hover:text-white"
              >
                <Instagram size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.linkedin}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="Reeturaj Goswami on LinkedIn"
                className="rounded-full p-1.5 transition-colors hover:text-white"
              >
                <Linkedin size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.twitter}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on X"
                className="rounded-full p-1.5 transition-colors hover:text-white"
              >
                <Twitter size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.github}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on GitHub"
                className="rounded-full p-1.5 transition-colors hover:text-white"
              >
                <Github size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#7a9ab8]">
            <Link to="/" className="transition-colors hover:text-white">Home</Link>
            <Link to="/about" className="transition-colors hover:text-white">About</Link>
            <Link to="/contact" className="transition-colors hover:text-white">Contact</Link>
            <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link to="/app" className="transition-colors hover:text-white">InBharat AI</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StaticLayout;
