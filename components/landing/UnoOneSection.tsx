import { Link } from 'react-router-dom';
import { ArrowRight, Brain, ShieldCheck, FolderOpen } from 'lucide-react';
import UnoOneLogo from '../UnoOneLogo';
import UnoOneDemo from './UnoOneDemo';
import UnoOneCapabilityOrbit from './UnoOneCapabilityOrbit';
import { UNOONE_LANDING } from '../../content/unooneLanding';

/** Product-only presentation. The company header and hero stay in Landing. */
export default function UnoOneSection({ reduceMotion }: { reduceMotion: boolean }) {
  return <div className="unoone-product-section" lang="en">
    <div className="unoone-product-grid">
      <div className="unoone-product-copy">
        <p className="eyebrow-line text-[#96b0c8]">PERSONAL AI · BY INBHARAT.AI</p>
        <UnoOneLogo />
        <h2 id="unoone-product-title">MEET UNOONE</h2>
        <p className="unoone-product-headline">{UNOONE_LANDING.headline[0]}<br /><span>{UNOONE_LANDING.headline[1]}</span></p>
        <p>{UNOONE_LANDING.definition}</p>
        <p className="unoone-product-boundary">{UNOONE_LANDING.networkBoundary}</p>
        <div className="unoone-product-actions">
          <Link className="unoone-product-primary" to="/get-started">Get UnoOne <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/unoone/power">Power · Windows <ArrowRight size={14} aria-hidden="true" /></Link>
          <Link to="/unoone/mobile">Mobile · Android <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>
      <div id="ecosystem" className="unoone-product-orbit">
        <UnoOneCapabilityOrbit reduceMotion={reduceMotion} />
      </div>
    </div>
    <div className="unoone-product-demo">
      <UnoOneDemo />
    </div>
    <div className="unoone-product-features">
      {[
        { title: 'Models on your device', icon: Brain, color: '#f59f4f', body: 'Choose compatible local models that fit your hardware and context budget. Model and device qualification remain platform-specific.' },
        { title: 'Memory that stays yours', icon: ShieldCheck, color: '#10b981', body: 'Keep approved records in an encrypted local vault, separate from model weights. Retrieval is bounded; phone–computer continuity is still in development.' },
        { title: 'Tools with boundaries', icon: FolderOpen, color: '#3b82f6', body: 'Turn supported documents, granted files and research into useful work. Power and Mobile have different tools, permissions and qualification.' },
      ].map(feature => <article key={feature.title} className="glow-card">
        <span className="unoone-feature-icon" style={{ color: feature.color }}><feature.icon size={22} aria-hidden="true" /></span>
        <h3>{feature.title}</h3><p>{feature.body}</p>
      </article>)}
    </div>
    <p className="unoone-product-evidence">{UNOONE_LANDING.evidenceNote} <Link to="/status">Platform status <ArrowRight size={13} aria-hidden="true" /></Link></p>
  </div>;
}
