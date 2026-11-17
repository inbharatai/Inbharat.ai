import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Pause, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localized } from '../../lib/locale-text';
import { PRODUCT_CATEGORIES, PRODUCT_REGISTRY, type ProductRecord } from '../../content/productRegistry';

/** Company portfolio, not a diagram of UnoOne integrations. Selection never navigates. */
export default function ProductOrbit({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState('unoone');
  const [category, setCategory] = useState('all');
  const [running, setRunning] = useState(false);
  const [visible, setVisible] = useState(false);
  const [replay, setReplay] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const selected = PRODUCT_REGISTRY.find(product => product.id === selectedId) || PRODUCT_REGISTRY[0];
  const products = category === 'all' ? PRODUCT_REGISTRY : PRODUCT_REGISTRY.filter(product => product.bucket === category);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; update(); }, { threshold: 0.15 });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

  const select = (product: ProductRecord) => { setSelectedId(product.id); setRunning(false); };
  return (
    <div ref={root} className={`product-orbit${compact ? ' product-orbit--compact' : ''}`} lang="en" onMouseEnter={() => setRunning(false)} onFocusCapture={() => setRunning(false)}>
      <div className="product-orbit-layout">
        <div className="product-orbit-map" aria-label="InBharat.ai company portfolio circle">
          <div key={replay} aria-hidden="true" className={`product-orbit-rings${running ? ' is-replaying' : ''}`} style={{ animationPlayState: visible ? 'running' : 'paused' }} onAnimationEnd={() => setRunning(false)}><i /><i /><i /></div>
          <div className="product-orbit-center"><img src="/inbharat-logo.svg" alt="" width={32} height={32} loading="lazy" /><strong>InBharat.ai</strong><span>Independent products.<br />One company portfolio.</span></div>
          {PRODUCT_REGISTRY.map((product, index) => {
            const angle = (index * 360 / PRODUCT_REGISTRY.length - 90) * Math.PI / 180;
            return <button key={product.id} type="button" className="product-orbit-node" style={{ left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%`, borderColor: selectedId === product.id ? product.color : undefined }} aria-pressed={selectedId === product.id} aria-controls={panelId} aria-label={`Select ${product.name}`} onClick={() => select(product)}><span className="product-orbit-number">{String(index + 1).padStart(2, '0')}</span><span className="product-orbit-name">{product.name}</span></button>;
          })}
        </div>
        <div className="product-orbit-detail" id={panelId} aria-live="polite" aria-atomic="true">
          <span className="product-orbit-kicker">{selected.relation === 'flagship' ? 'Flagship product' : 'Independent portfolio product'}</span>
          {selected.logo && <img className="product-orbit-logo" src={selected.logo} alt="" width={52} height={52} loading="lazy" />}
          <h3>{selected.name}</h3><p>{selected.description}</p>
          <p className="product-orbit-scope">{selected.relation === 'flagship' ? 'Platform requirements and access are detailed on the UnoOne product pages.' : 'Separate product scope. Availability and requirements are maintained at its destination.'}</p>
          <a href={selected.href} {...(selected.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>Explore {selected.name}<ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="product-orbit-toolbar"><p>15 products · 6 categories. The rings show portfolio membership, not data flow.</p><button type="button" onClick={() => { setReplay(value => value + 1); setRunning(!running); }}>{running ? <Pause size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}{running ? 'Pause circle' : 'Replay circle'}</button></div>
      <div className="product-orbit-filters" role="group" aria-label="Filter portfolio categories"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All 15 products</button>{PRODUCT_CATEGORIES.map(item => <button type="button" key={item.key} aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>
      <ul className="product-orbit-list" aria-label="Select a portfolio product">{products.map(product => <li key={product.id}><button type="button" aria-pressed={selectedId === product.id} aria-controls={panelId} onClick={() => select(product)}><span style={{ backgroundColor: product.color }} aria-hidden="true" />{product.name}</button></li>)}</ul>
      <details className="product-orbit-directory" data-product-directory><summary>Complete product directory · {PRODUCT_REGISTRY.length} products</summary><div>{PRODUCT_REGISTRY.map(product => <article key={product.id}><h3>{product.name}</h3><p>{product.description}</p><a href={product.href} {...(product.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>Explore {product.name} <ArrowUpRight size={15} aria-hidden="true" /></a></article>)}</div><aside className="product-orbit-risk-notes" aria-label="Portfolio privacy and safety context"><h3>Data and safety boundaries</h3>{['landSafetyNotice', 'landProdSocialFlowDesc', 'landProdSwasthyaDesc', 'landProdSahaayakSevaDesc'].filter(key => !PRODUCT_REGISTRY.some(product => product.description === t(key))).map(key => <p key={key}>{localized(t(key))}</p>)}</aside></details>
    </div>
  );
}
