import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Monitor, Smartphone } from 'lucide-react';
import { PageShell } from './UnoOnePages';
import UnoOneDemo from '../../components/landing/UnoOneDemo';
import ProductOrbit from '../../components/landing/ProductOrbit';
import { PRODUCT_CATEGORIES, PRODUCT_REGISTRY } from '../../content/productRegistry';
import { approvedArtifact, LAUNCH_PAGES, UNOONE_RELEASES, UNOONE_STATUS, releaseAvailability, type LaunchPath } from '../../content/unooneRelease';

function LaunchHero({ path }: { path: LaunchPath }) {
  const page = LAUNCH_PAGES[path];
  return <header className="unoone-page-hero unoone-page-hero-single"><div>
    <p className="unoone-page-kicker">{page.eyebrow}</p><h1>{page.title}</h1><p className="unoone-page-lede">{page.description}</p>
  </div></header>;
}

export function GetStartedPage() {
  return <PageShell><main id="main-content"><LaunchHero path="/get-started" />
    <section className="unoone-page-section unoone-page-chooser" aria-label="Choose your platform">
      <nav className="unoone-page-grid unoone-page-grid-two" aria-label="Platform choices">{UNOONE_RELEASES.map(release => <a className="unoone-page-choice" key={release.id} href={`#${release.id}`}>
        {release.id === 'windows' ? <Monitor size={28} aria-hidden="true" /> : <Smartphone size={28} aria-hidden="true" />}<span><strong>{release.name}</strong><span>{release.platform} · requirements & setup</span></span><ArrowRight size={20} aria-hidden="true" />
      </a>)}</nav>
      <p className="unoone-page-note">Choose your platform, check compatibility and follow the setup guidance. Published download links and access options appear below.</p>
    </section>
    {UNOONE_RELEASES.map(release => {
      const artifact = approvedArtifact(release);
      return <section className="unoone-page-section unoone-platform-setup" id={release.id} key={release.id} aria-labelledby={`${release.id}-title`}>
        <div className="unoone-page-platform-title"><p className="unoone-page-kicker">{release.platform}</p><h2 id={`${release.id}-title`}>{release.name}</h2><p className="unoone-page-section-intro">{release.purpose}</p></div>
        <div className="unoone-page-grid unoone-page-grid-two">
          <article className="unoone-page-card"><h3>Check your requirements</h3><ul>{(artifact?.requirements ?? release.requirements).map(requirement => <li key={requirement}>{requirement}</li>)}</ul><Link className="unoone-page-text-link" to={release.href}>Explore platform capabilities <ArrowRight size={16} aria-hidden="true" /></Link></article>
          <article className="unoone-page-card"><h3>Your setup path</h3>{artifact ? <><p>Follow the version-specific installation and model setup guide for {release.name} {artifact.version}. Review upgrade, data-preservation and permission guidance before installing.</p><a className="unoone-page-text-link" href={artifact.setupUrl}>Open the approved setup guide <ArrowUpRight size={16} aria-hidden="true" /></a></> : <ol>{release.setup.map(step => <li key={step}>{step}</li>)}</ol>}</article>
        </div>
        <div className="unoone-page-availability"><div><p className="unoone-page-kicker">Availability</p><h3>{releaseAvailability(release)}</h3>
          {artifact ? <><p>Version {artifact.version} · signed by {artifact.signingIdentity} · approved {artifact.approvedOn}</p><p>{artifact.bytes.toLocaleString('en-US')} bytes</p><p className="unoone-page-checksum">SHA-256: <code>{artifact.sha256}</code></p><p><a href={artifact.setupUrl}>Installation guide</a> · <a href={artifact.releaseNotesUrl}>Release notes</a> · <a href={artifact.licenseUrl}>License</a> · <a href={artifact.supportUrl}>Support</a></p></>
            : <p>The public {release.platform} download is not yet published. Contact the team about availability and compatible devices.</p>}
        </div>{artifact ? <a className="unoone-page-button" href={artifact.url}>Download {release.name} {artifact.version} <ArrowUpRight size={17} aria-hidden="true" /></a>
          : <Link className="unoone-page-button" to="/contact">Ask about {release.platform} access <ArrowRight size={17} aria-hidden="true" /></Link>}
        </div>
      </section>;
    })}
    <section className="unoone-page-section unoone-page-section-tint"><h2>Local core. Explicit online choices.</h2><p className="unoone-page-section-intro">Models and speech assets may require initial downloads. Live research and connected providers use the network. Grant only the folders, phone permissions and accounts needed for your task; review outcomes before relying on them.</p><div className="unoone-page-actions"><Link to="/private-ai" className="unoone-page-text-link">Understand data boundaries <ArrowRight size={16} aria-hidden="true" /></Link><Link to="/status" className="unoone-page-text-link">Current evidence & compatibility <ArrowRight size={16} aria-hidden="true" /></Link></div></section>
  </main></PageShell>;
}

export function StatusPage() {
  return <PageShell><main id="main-content"><LaunchHero path="/status" />
    <section className="unoone-page-section unoone-page-chooser" aria-labelledby="availability-title"><p className="unoone-page-kicker"><time dateTime={UNOONE_STATUS.reviewedOn}>{UNOONE_STATUS.reviewLabel}</time></p><h2 id="availability-title">Public availability</h2>
      <div className="unoone-page-grid unoone-page-grid-two">{UNOONE_RELEASES.map(release => <article key={release.id} className="unoone-page-card"><h3>{release.name}</h3><p>{releaseAvailability(release)}</p><p>{release.purpose}</p><a className="unoone-page-text-link" href={`/get-started#${release.id}`}>Requirements & access <ArrowRight size={16} aria-hidden="true" /></a></article>)}</div>
      <p className="unoone-page-note">{UNOONE_STATUS.sourceNote}</p>
    </section>
    <section className="unoone-page-section" aria-labelledby="ledger-heading"><h2 id="ledger-heading">What the evidence supports.</h2><div className="unoone-status-ledger">{UNOONE_STATUS.rows.map(row => <article key={row.name}><div><h3>{row.name}</h3><p className="unoone-page-tag">{row.state}</p></div><p>{row.detail}</p></article>)}</div></section>
    <section className="unoone-page-section unoone-page-section-tint" aria-labelledby="gates-heading"><h2 id="gates-heading">Before a public package appears.</h2><ol className="unoone-release-gates">{UNOONE_STATUS.releaseGates.map(gate => <li key={gate}>{gate}</li>)}</ol><p className="unoone-page-note">Historical test totals are not current-build reliability percentages. A final feature is published only after its source, shipping configuration, device/workflow acceptance and public-release approval agree.</p></section>
    <section className="unoone-page-section"><div className="unoone-page-callout"><div><h2>See the scope behind the story.</h2><p>The film is historical. Platform guides explain the current boundaries; contact the team for access.</p></div><div className="unoone-page-actions"><Link to="/technology" className="unoone-page-button unoone-page-button-secondary">How it works</Link><Link to="/get-started" className="unoone-page-button">Get UnoOne <ArrowRight size={16} aria-hidden="true" /></Link></div></div></section>
  </main></PageShell>;
}

export function EcosystemPage() {
  return <PageShell><main id="main-content"><LaunchHero path="/ecosystem" />
    <section className="unoone-page-section unoone-page-orbit" aria-label="Explore the company product circle"><ProductOrbit /></section>
    <section className="unoone-page-section" aria-labelledby="catalog-heading"><p className="unoone-page-kicker">The complete directory</p><h2 id="catalog-heading">15 products. Six groups.</h2><p className="unoone-page-section-intro">Each destination has its own access and release information. Independent services are not UnoOne modules, and the circle does not depict data moving between products.</p>
      <nav className="unoone-page-category-nav" aria-label="Product categories">{PRODUCT_CATEGORIES.map(category => <a href={`#catalog-${category.key}`} key={category.key}>{category.label}</a>)}</nav>
      {PRODUCT_CATEGORIES.map(category => <section className="unoone-catalog-group" id={`catalog-${category.key}`} key={category.key} aria-labelledby={`heading-${category.key}`}><h3 id={`heading-${category.key}`}>{category.label}</h3><div className="unoone-page-grid">{PRODUCT_REGISTRY.filter(product => product.bucket === category.key).map(product => <article key={product.id} className="unoone-page-card" id={`product-${product.id}`}>
        <span className="unoone-page-tag">{product.relation === 'flagship' ? 'Flagship product' : 'Independent product'}</span><h4>{product.name}</h4><p>{product.description}</p>
        {product.internal ? <Link className="unoone-page-text-link" to={product.href}>Explore {product.name} <ArrowRight size={16} aria-hidden="true" /></Link> : <a className="unoone-page-text-link" href={product.href} {...(product.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>Explore {product.name} <ArrowUpRight size={16} aria-hidden="true" /></a>}
      </article>)}</div></section>)}
    </section>
    <section className="unoone-page-section unoone-page-section-tint"><p className="unoone-page-kicker">Research, separately identified</p><h2>SILT and historical Pocket AI.</h2><p className="unoone-page-section-intro">Research records sit alongside the portfolio, not inside its 15-product count. SILT explores trust-gated capability transfer. Pocket AI is historical portable-architecture research, not the current consumer offer or proof that every UnoOne feature is covered by its filing.</p><Link className="unoone-page-text-link" to="/technology">Explore research and technology <ArrowRight size={16} aria-hidden="true" /></Link></section>
  </main></PageShell>;
}

export function DemoPage() {
  return <PageShell><main id="main-content"><LaunchHero path="/unoone/demo" /><div className="unoone-page-section unoone-page-watch"><UnoOneDemo watchPage /></div>
    <section className="unoone-page-section"><div className="unoone-page-callout"><div><h2>Choose what happens next.</h2><p>Compare the recorded workflows with current platform evidence before arranging access.</p></div><div className="unoone-page-actions"><Link className="unoone-page-button unoone-page-button-secondary" to="/status">Current status</Link><Link className="unoone-page-button" to="/get-started">Get UnoOne <ArrowRight size={16} aria-hidden="true" /></Link></div></div></section>
  </main></PageShell>;
}

export const LAUNCH_COMPONENTS: Record<LaunchPath, React.ComponentType> = {
  '/get-started': GetStartedPage, '/status': StatusPage, '/ecosystem': EcosystemPage, '/unoone/demo': DemoPage,
};
