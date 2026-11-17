import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { LAUNCH_PAGES, UNOONE_RELEASES, releaseAvailability, type LaunchPath } from '../../content/unooneRelease';
import { UNOONE_PAGES, pageByPath, PRIVATE_AI_EVIDENCE_SCOPE, READINESS_LABELS, type PrivateAiPage } from '../../content/privateAI';

const NAV_LINKS = [
  { to: '/unoone', name: 'UnoOne' },
  { to: '/technology', name: 'How it works' },
  { to: '/unoone/demo', name: 'Demo' },
  { to: '/status', name: 'Status' },
  { to: '/ecosystem', name: 'Ecosystem' },
];

/** Shared product navigation. No CSS import here: Node renders this tree too. */
export const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '');
  const breadcrumbLabel = UNOONE_PAGES.find(page => page.path === path)?.eyebrow
    ?? (Object.hasOwn(LAUNCH_PAGES, path) ? LAUNCH_PAGES[path as LaunchPath].eyebrow : 'UnoOne');
  return <div className="unoone-page-shell" lang="en">
    <a className="unoone-page-skip" href="#main-content">Skip to content</a>
    <header className="unoone-page-header">
      <div className="unoone-page-header-inner">
        <Link to="/" className="unoone-page-brand inbharat-product-masthead" aria-label="InBharat.ai — home"><img src="/inbharat-logo.svg" alt="InBharat.ai logo" width={30} height={30} /><strong>InBharat.ai</strong></Link>
        <nav aria-label="Main navigation" className="unoone-page-nav">
          {NAV_LINKS.map(item => <Link key={item.to} to={item.to} aria-current={pathname.replace(/\/+$/, '') === item.to ? 'page' : undefined}>{item.name}</Link>)}
        </nav>
        <Link to="/get-started" className="unoone-page-button">Get UnoOne <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </header>
    <nav className="unoone-page-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{breadcrumbLabel}</span></nav>
    {children}
    <footer className="unoone-page-footer">
      <div><strong>InBharat.ai</strong><p>Private agentic AI for a private world.<br />UnoOne product guides.</p></div>
      <nav aria-label="Product and company links">
        <Link to="/unoone/power">Power · Windows</Link><Link to="/unoone/mobile">Mobile · Android</Link>
        <Link to="/private-ai">Privacy & permissions</Link><Link to="/unoone/sync">Continuity roadmap</Link>
        <Link to="/about">Company & recognition</Link><Link to="/enterprise-ai">Enterprise AI</Link>
        <Link to="/technology">Research & technology</Link><Link to="/learn-ai-with-reeturaj">Learning hub</Link>
        <Link to="/app">Separate AI console</Link><Link to="/contact">Contact</Link><Link to="/privacy">Website privacy</Link><Link to="/terms">Terms</Link>
      </nav>
    </footer>
  </div>;
};

export function PlatformCards() {
  return <div className="unoone-page-grid unoone-page-grid-two">{UNOONE_RELEASES.map(release => <article className="unoone-page-card" key={release.id}>
    <p className="unoone-page-kicker">{release.platform}</p><h3>{release.name}</h3><p>{release.purpose}</p>
    <p className="unoone-page-note">{releaseAvailability(release)}</p>
    <Link className="unoone-page-text-link" to={release.href}>Explore {release.name} <ArrowRight size={16} aria-hidden="true" /></Link>
  </article>)}</div>;
}

export const PrivateAiPageView: React.FC<{ page: PrivateAiPage }> = ({ page }) => {
  const slug = page.path.replace(/\//g, '-');
  return <PageShell><main id="main-content">
    <section className="unoone-page-hero">
      <div><p className="unoone-page-kicker">{page.eyebrow} · by InBharat.ai</p>
        <h1>{page.h1}</h1><p className="unoone-page-lede">{page.description}</p>
        <div className="unoone-page-actions"><Link to="/get-started" className="unoone-page-button">Get UnoOne <ArrowRight size={17} aria-hidden="true" /></Link><Link to="/unoone/demo" className="unoone-page-button unoone-page-button-secondary">Watch the walkthrough <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      </div>
      <aside className="unoone-page-architecture" aria-label="Explanatory architecture, not a live product screen">
        <p className="unoone-page-kicker">A workspace beyond one model</p>
        <div><span>01 / MODELS</span><strong>Compatible local intelligence</strong></div>
        <div><span>02 / MEMORY</span><strong>Records outside the weights</strong></div>
        <div><span>03 / TOOLS</span><strong>Useful work inside your permissions</strong></div>
        <p className="unoone-page-note">Explanatory diagram. Local stores are per device; connected actions use the network.</p>
      </aside>
    </section>
    {page.path === '/unoone' && <section className="unoone-page-section" aria-labelledby="platform-heading"><h2 id="platform-heading">Two platforms. Different jobs.</h2><PlatformCards /></section>}
    <section className="unoone-page-section" aria-labelledby="capabilities-heading">
      <p className="unoone-page-kicker">{page.audienceTitle ?? 'Built for real work'}</p>
      <h2 id="capabilities-heading">{page.capabilitiesHeading ?? 'What you can build on'}</h2><p className="unoone-page-section-intro">{page.audience}</p>
      <div className="unoone-page-grid">{page.capabilities.map(cap => <article key={cap.name} id={slug + '--' + cap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="unoone-page-card">
        <span className="unoone-page-tag">{READINESS_LABELS[cap.readiness]}</span><h3>{cap.name}</h3><p>{cap.what}</p>
        {cap.evidence && <details className="unoone-page-evidence"><summary>Evidence / validation scope</summary><p>{cap.evidence}</p></details>}
      </article>)}</div>
    </section>
    <section className="unoone-page-section unoone-page-section-tint" aria-labelledby="approach-heading">
      <h2 id="approach-heading">Designed around clear boundaries.</h2>
      <div className="unoone-page-grid">{page.sections.map(section => <article className="unoone-page-narrative" key={section.title}><h3>{section.title}</h3><p>{section.body}</p></article>)}</div>
    </section>
    <section className="unoone-page-section" aria-labelledby="evidence-heading">
      <p className="unoone-page-kicker">Current scope</p><h2 id="evidence-heading">Implementation is not release approval.</h2>
      <p className="unoone-page-section-intro">{page.status}</p><p className="unoone-page-note">{PRIVATE_AI_EVIDENCE_SCOPE}</p>
      <Link className="unoone-page-text-link" to="/status">Read the dated status and compatibility guide <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    <section className="unoone-page-section unoone-page-faq" aria-labelledby="questions-heading"><h2 id="questions-heading">Useful answers.</h2>
      {page.faqs.map(faq => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}
    </section>
    <section className="unoone-page-section"><div className="unoone-page-callout"><div><p className="unoone-page-kicker">Your next step</p><h2>Choose a platform. Start with a real task.</h2><p>Check setup and availability before arranging access. No development package is presented as a final release.</p></div><Link className="unoone-page-button" to="/get-started">Get UnoOne <ArrowRight size={17} aria-hidden="true" /></Link></div></section>
  </main></PageShell>;
};

export const PrivateAiPageNew: React.FC = () => <PrivateAiPageView page={pageByPath('/private-ai')} />;
export const UnoOnePage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone')} />;
export const PowerPage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/power')} />;
export const MobilePage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/mobile')} />;
export const SyncPage: React.FC = () => <PrivateAiPageView page={pageByPath('/unoone/sync')} />;
export const EnterpriseAiPage: React.FC = () => <PrivateAiPageView page={pageByPath('/enterprise-ai')} />;
export const TechnologyPage: React.FC = () => <PrivateAiPageView page={pageByPath('/technology')} />;
export { UNOONE_PAGES };
