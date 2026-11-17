import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { UNOONE_CAPABILITIES, UNOONE_CAPABILITY_RINGS } from '../../content/unooneCapabilities';

/** The company map's three-ring visual language, scoped to one product.
 * Static positions prevent collision and preserve stable keyboard/touch targets.
 * Only an optional finite ring highlight animates; never per-frame React state.
 */
export default function UnoOneCapabilityOrbit({ reduceMotion }: { reduceMotion: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(UNOONE_CAPABILITIES[0].id);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState({ pointer: false, focus: false, offscreen: true, hidden: false });
  const selected = UNOONE_CAPABILITIES.find(capability => capability.id === selectedId)!;
  const motionPaused = reduceMotion || Object.values(paused).some(Boolean);

  useEffect(() => {
    const visibility = () => setPaused(state => ({ ...state, hidden: document.hidden }));
    visibility();
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      setPaused(state => ({ ...state, offscreen: !entry.isIntersecting }));
    }, { threshold: 0.05 }) : null;
    if (root.current && observer) observer.observe(root.current);
    else setPaused(state => ({ ...state, offscreen: false }));
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  return <div className="unoone-capability-map" lang="en">
    <p className="unoone-map-caption">UNOONE CAPABILITY MAP <span>Illustration · not live telemetry</span></p>
    <p className="unoone-map-instructions" id="unoone-map-help">Select a capability for platform scope. On smaller screens, use the full-size controls below the map.</p>
    <div className="unoone-orbit-scroll" role="region" aria-label="UnoOne capability diagram" aria-describedby="unoone-map-help">
      <div ref={root} className="unoone-orbit-stage"
        onMouseEnter={() => setPaused(state => ({ ...state, pointer: true }))}
        onMouseLeave={() => setPaused(state => ({ ...state, pointer: false }))}
        onFocusCapture={() => setPaused(state => ({ ...state, focus: true }))}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(state => ({ ...state, focus: false })); }}>
        <svg key={replay} viewBox="0 0 100 100" className="unoone-orbit-rings" aria-hidden="true" data-replay={replay > 0 && !reduceMotion ? 'true' : 'false'} style={{ animationPlayState: motionPaused ? 'paused' : 'running' }}>
          {([1, 2, 3] as const).map(ring => <circle key={ring} cx="50" cy="50" r={UNOONE_CAPABILITY_RINGS[ring]} fill="none" stroke="#f59f4f" strokeWidth="0.3" strokeOpacity={ring === 1 ? 0.16 : ring === 2 ? 0.11 : 0.08} strokeDasharray={ring === 1 ? '3 6' : ring === 2 ? '2 8' : '1.5 10'} />)}
          {UNOONE_CAPABILITIES.map(capability => {
            const angle = capability.angle * Math.PI / 180;
            return <line key={capability.id} x1="50" y1="50" x2={50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.cos(angle)} y2={50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.sin(angle)} stroke={capability.color} strokeWidth={selectedId === capability.id ? 0.35 : 0.15} strokeOpacity={selectedId === capability.id ? 0.5 : 0.13} strokeDasharray="1.5 3" />;
          })}
        </svg>
        <div className="unoone-orbit-core"><img className="inbharat-orbit-mark" src="/inbharat-logo.svg" alt="InBharat.ai" width={40} height={40} decoding="async" /></div>
        {UNOONE_CAPABILITIES.map(capability => {
          const angle = capability.angle * Math.PI / 180;
          const x = 50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.cos(angle);
          const y = 50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.sin(angle);
          const position = { left: `calc(${x}% + ${50 - x}px)`, top: `calc(${y}% + ${50 - y}px)`, '--orbit-x': `${x}%`, '--orbit-y': `${y}%`, borderColor: selectedId === capability.id ? capability.color : undefined } as CSSProperties;
          return <Fragment key={capability.id}><button type="button" className="unoone-orbit-pill unoone-orbit-desktop-control" aria-pressed={selectedId === capability.id} aria-controls="unoone-capability-detail" onClick={() => setSelectedId(capability.id)} style={position}>
            <span aria-hidden="true" style={{ background: capability.color }} />{capability.label}
          </button><span className="unoone-orbit-pill unoone-orbit-mobile-label" aria-hidden="true" style={position}><span style={{ background: capability.color }} />{capability.label}</span></Fragment>;
        })}
      </div>
    </div>
    <div className="unoone-mobile-choices" role="group" aria-label="Choose a UnoOne capability">{UNOONE_CAPABILITIES.map(capability => <button key={capability.id} type="button" aria-pressed={selectedId === capability.id} aria-controls="unoone-capability-detail" onClick={() => setSelectedId(capability.id)}><span aria-hidden="true" style={{ background: capability.color }} />{capability.label}</button>)}</div>
    {!reduceMotion && <button type="button" className="unoone-orbit-replay" onClick={() => setReplay(value => value + 1)}><RotateCcw size={13} aria-hidden="true" /> Replay ring highlight</button>}
    <div id="unoone-capability-detail" className="unoone-capability-detail" aria-live="polite" aria-atomic="true">
      <p className="unoone-capability-platform">{selected.platform}</p>
      <h3>{selected.label}</h3><p>{selected.description}</p><p className="unoone-capability-boundary">{selected.boundary}</p>
      <Link to={selected.href}>Scope &amp; availability <ArrowRight size={13} aria-hidden="true" /></Link>
    </div>
    <details className="unoone-capability-list">
      <summary>All 12 capabilities · accessible text list</summary>
      <ul>{UNOONE_CAPABILITIES.map(capability => <li key={capability.id}><h3>{capability.label}</h3><p className="unoone-capability-platform">{capability.platform}</p><p>{capability.description} {capability.boundary}</p><Link to={capability.href}>Platform details <ArrowRight size={13} aria-hidden="true" /></Link></li>)}</ul>
    </details>
    <p className="unoone-map-source">Source scope: Power engineering preprint, 14 November 2026; Mobile source/evidence review, 14–16 November. Implementation is not independent certification or final-release approval. <Link to="/status">Read current status.</Link></p>
  </div>;
}
