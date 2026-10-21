import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CircleDashed, Clock4, ShieldCheck, Mail } from 'lucide-react';
import UnoOneDevices from '../../components/landing/UnoOneDevices';
import { trackEvent } from '../../lib/analytics';
import { UNOONE_PAGES, pageByPath, type PrivateAiPage, type Readiness } from '../../content/privateAI';

const READYNESS_META: Record<Readiness, { label: string; className: string; icon: React.ReactNode }> = {
  working: {
    label: 'Working',
    className: 'border-[#91e7ae]/40 bg-[#91e7ae]/[0.08] text-[#91e7ae]',
    icon: <CheckCircle2 size={12} />,
  },
  'in-development': {
    label: 'In development',
    className: 'border-[#f8b76a]/40 bg-[#f8b76a]/[0.08] text-[#f8b76a]',
    icon: <Clock4 size={12} />,
  },
  planned: {
    label: 'Planned',
    className: 'border-white/20 bg-white/[0.05] text-[#9ab0c3]',
    icon: <CircleDashed size={12} />,
  },
};

const NAV_LINKS = [
  { to: '/private-ai', name: 'PAI' },
  { to: '/unoone', name: 'UnoOne' },
  { to: '/unoone/power', name: 'Power' },
  { to: '/unoone/mobile', name: 'Mobile' },
  { to: '/unoone/sync', name: 'Sync' },
  { to: '/enterprise-ai', name: 'Enterprise AI' },
  { to: '/technology', name: 'Technology' },
];

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return (
  <div className="min-h-screen overflow-x-hidden bg-[#030508] text-white">
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[#f59f4f] focus:p-3 focus:text-black"
    >
      Skip to content
    </a>
    <nav aria-label="Main navigation" className="sticky top-0 z-40 border-b border-white/10 bg-[#030508]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-sm font-bold">
          <img src="/inbharat-logo.svg" width={30} height={30} alt="" />
          InBharat.ai
        </Link>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs sm:text-sm">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.to === pathname.replace(/\/+$/, '') ? 'page' : undefined}
              className={
                item.to === pathname.replace(/\/+$/, '')
                  ? 'font-semibold text-[#f59f4f]'
                  : 'text-[#b4c8de] transition-colors hover:text-white'
              }
            >
              {item.name}
            </Link>
          ))}
        </div>
        <Link
          to="/contact"
          className="rounded-full border border-[#f59f4f]/40 px-4 py-1.5 text-xs font-semibold text-[#f59f4f] transition-colors hover:bg-[#f59f4f]/10"
        >
          Contact
        </Link>
      </div>
    </nav>
    {children}
    <footer className="border-t border-white/10 px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-5 text-sm text-[#9ab0c3]">
        <span>InBharat.ai · Built in Bharat</span>
        <div className="flex flex-wrap gap-5">
          <Link to="/" className="hover:text-white">Home</Link>
          <Link to="/private-ai" className="hover:text-white">PAI</Link>
          <Link to="/about" className="hover:text-white">About</Link>
          <Link to="/app" className="hover:text-white">Launch InBharat AI</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <Link to="/terms" className="hover:text-white">Terms</Link>
        </div>
      </div>
    </footer>
  </div>
  );
};

const PrivateAiPageView: React.FC<{ page: PrivateAiPage; pageKey?: string }> = ({ page }) => {
  const { pathname } = useLocation();
  const slug = pathname.replace(/\/+$/, '').replace(/\//g, '-');
  return (
    <PageShell>
      <main id="main-content">
        <header className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_80%_18%,rgba(245,159,79,0.12),transparent_48%)]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#f59f4f]">{page.eyebrow}</p>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                {page.h1}
              </h1>
              <p className="mt-6 max-w-2xl leading-8 text-[#b4c8de]">{page.description}</p>
              <p className="mt-6 inline-flex max-w-xl items-start gap-2 rounded-2xl border border-[#6fd3a3]/25 bg-[#6fd3a3]/[0.05] px-4 py-3 text-xs leading-6 text-[#b7f0d3]">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                <span>{page.status}</span>
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/contact"
                  onClick={() => trackEvent('private_ai_pilot', { product: page.path })}
                  className="inline-flex items-center gap-2 rounded-full bg-[#f59f4f] px-7 py-3 font-semibold text-[#070909] transition-colors hover:bg-[#f8b56d]"
                >
                  Discuss early access <ArrowRight size={17} />
                </Link>
                <Link
                  to="/unoone"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3 font-semibold transition-colors hover:bg-white/5"
                >
                  Explore UnoOne
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#121d22] to-[#080d12] p-6 sm:p-7">
              <p className="mb-6 text-xs uppercase tracking-[0.2em] text-[#9ab0c3]">Private AI architecture</p>
              <div
                className="space-y-4"
                role="img"
                aria-label="Conceptual diagram of device, permission and data layers, not a product screenshot"
              >
                {[
                  { t: 'DEVICE', d: 'Owned and controlled by you', color: '#f59f4f' },
                  { t: 'AGENT', d: 'Acts only through permitted tools', color: '#6fd3a3' },
                  { t: 'DATA', d: 'Local-first encrypted boundary', color: '#80aef2' },
                ].map(({ t, d, color }, i) => (
                  <div
                    key={t}
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#071016] p-5"
                    style={{ marginLeft: i * 14 }}
                  >
                    <div>
                      <p className="text-xs tracking-widest" style={{ color }}>
                        {t}
                      </p>
                      <p className="mt-1 text-sm font-medium">{d}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs leading-6 text-[#89a1b5]">
                Conceptual illustration. Availability depends on the tested release.
              </p>
            </div>
          </div>
        </header>

        {/* capabilities with readiness labels */}
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f59f4f]">{page.audienceTitle ?? 'Built for real work'}</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">{page.capabilitiesHeading ?? 'Capabilities, with honest readiness'}</h2>
          <p className="mt-5 max-w-3xl leading-8 text-[#b4c8de]">{page.audience}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {page.capabilities.map((cap) => {
              const meta = READYNESS_META[cap.readiness];
              return (
                <article
                  key={cap.name}
                  id={slug + '--' + cap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold">{cap.name}</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${meta.className}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#b4c8de]">{cap.what}</p>
                  {cap.evidence ? (
                    <p className="mt-3 border-t border-white/5 pt-3 text-xs leading-5 text-[#89a1b5]">
                      <span className="text-[#6fd3a3]">Verified:</span> {cap.evidence}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {/* narrative sections */}
        <section className="border-y border-white/10 bg-[#0a1219]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="text-3xl font-semibold">How we approach privacy and trust</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {page.sections.map((section) => (
                <article key={section.title} className="border-l-2 border-[#f59f4f]/70 pl-5">
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#b4c8de]">{section.body}</p>
                </article>
              ))}
            </div>
          </div>

          {pathname.replace(/\/+$/, '') === '/unoone' ? (
            <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
              <UnoOneDevices showCards heading={false} />
            </div>
          ) : null}
        </section>

        {/* FAQs */}
        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-3xl font-semibold">Common questions</h2>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {page.faqs.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="cursor-pointer text-base font-semibold marker:text-[#f59f4f] group-open:text-[#f59f4f]">
                  {faq.q}
                </summary>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#b4c8de]">{faq.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-14 rounded-3xl border border-[#f59f4f]/20 bg-[#f59f4f]/[0.06] p-8 sm:p-12">
            <h2 className="text-2xl font-semibold">Discuss a pilot that fits your situation.</h2>
            <p className="mt-4 text-[#b4c8de]">
              We will explain what is implemented, what has been tested and what still needs qualification.
            </p>
            <Link
              to="/contact"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#f59f4f] px-6 py-3 font-semibold text-[#070909] transition-colors hover:bg-[#f8b56d]"
            >
              Contact InBharat <ArrowRight size={16} />
            </Link>
            <a
              href="mailto:founder@inbharat.ai"
              className="mt-4 inline-flex items-center gap-2 text-sm text-[#9ab0c3] hover:text-white"
            >
              <Mail size={14} /> founder@inbharat.ai
            </a>
          </div>
        </section>
      </main>
    </PageShell>
  );
};

export const PrivateAiPageNew: React.FC = () => <PrivateAiPageView page={pageByPath('/private-ai')} />;
export const UnoOnePage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone')} />;
export const PowerPage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/power')} />;
export const MobilePage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/mobile')} />;
export const SyncPage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/sync')} />;
export const EnterpriseAiPage: React.FC = () => <PrivateAiPageView page={pageByPath('/enterprise-ai')} />;
export const TechnologyPage: React.FC = () => <PrivateAiPageView page={pageByPath('/technology')} />;

export { UNOONE_PAGES };