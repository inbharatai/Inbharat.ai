import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { useOrbitalMotion } from './useOrbitalMotion';
import { UNOONE_CAPABILITIES, UNOONE_CAPABILITY_RINGS } from '../../content/unooneCapabilities';

/** Restore the original orbiting visual language with upright labels.
 * Motion starts in view, suspends on interaction/background/offscreen, and is
 * static for reduced motion. Layout/DOM updates never use per-frame React state.
 */
export default function UnoOneCapabilityOrbit({ reduceMotion }: { reduceMotion: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(UNOONE_CAPABILITIES[0].id);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [paused, setPaused] = useState({ pointer: false, focus: false, offscreen: true, hidden: false });
  const selected = UNOONE_CAPABILITIES.find(capability => capability.id === selectedId)!;
  const motionPaused = reduceMotion || manuallyPaused || Object.values(paused).some(Boolean);
  const layoutAvailable = useOrbitalMotion(root, !motionPaused, reduceMotion);

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

  return <div className="unoone-capability-map" lang="en" data-orbit-fit={layoutAvailable ? 'ready' : 'fallback'}>
    <p className="unoone-map-caption">UNOONE CAPABILITY MAP <span>Illustration · not live telemetry</span></p>
    <p className="unoone-map-instructions" id="unoone-map-help">The labels orbit slowly around the InBharat star. Hover or focus pauses the map. On smaller screens, use the full-size controls below.</p>
    <div className="unoone-orbit-toolbar">{!layoutAvailable ? <span className="unoone-orbit-motion-note">At this text size, use the complete capability list below.</span> : reduceMotion ? <span className="unoone-orbit-motion-note">Animation is off for your reduced-motion setting.</span> : <button type="button" className="unoone-orbit-replay" aria-pressed={manuallyPaused} onClick={() => setManuallyPaused(value => !value)}>{manuallyPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}{manuallyPaused ? 'Resume orbit animation' : 'Pause orbit animation'}</button>}</div>
    <div className="unoone-orbit-scroll" role="region" aria-label="UnoOne capability diagram" aria-describedby="unoone-map-help">
      <div ref={root} className="unoone-orbit-stage" data-orbit-state={reduceMotion ? 'reduced' : motionPaused || !layoutAvailable ? 'paused' : 'running'} style={{ '--orbit-play-state': motionPaused || !layoutAvailable ? 'paused' : 'running' } as CSSProperties}
        onFocusCapture={() => setPaused(state => ({ ...state, focus: true }))}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(state => ({ ...state, focus: false })); }}>
        <svg viewBox="0 0 100 100" className="unoone-orbit-rings" aria-hidden="true">
          {([1, 2, 3] as const).map(ring => <circle key={ring} cx="50" cy="50" r={UNOONE_CAPABILITY_RINGS[ring]} fill="none" stroke="#f59f4f" strokeWidth="0.3" strokeOpacity={ring === 1 ? 0.16 : ring === 2 ? 0.11 : 0.08} strokeDasharray={ring === 1 ? '3 6' : ring === 2 ? '2 8' : '1.5 10'} />)}
          {UNOONE_CAPABILITIES.map(capability => {
            const angle = capability.angle * Math.PI / 180;
            return <line key={capability.id} data-orbit-connector={capability.id} x1="50" y1="50" x2={50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.cos(angle)} y2={50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.sin(angle)} stroke={capability.color} strokeWidth={selectedId === capability.id ? 0.35 : 0.15} strokeOpacity={selectedId === capability.id ? 0.5 : 0.13} strokeDasharray="1.5 3" />;
          })}
        </svg>
        <div className="unoone-orbit-core"><img className="inbharat-orbit-mark" src="/inbharat-logo.svg" alt="InBharat.ai" width={40} height={40} decoding="async" /></div>
        {UNOONE_CAPABILITIES.map(capability => {
          const angle = capability.angle * Math.PI / 180;
          const x = 50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.cos(angle);
          const y = 50 + UNOONE_CAPABILITY_RINGS[capability.ring] * Math.sin(angle);
          const position = { left: `calc(${x}% + ${50 - x}px)`, top: `calc(${y}% + ${50 - y}px)`, '--orbit-x': `${x}%`, '--orbit-y': `${y}%`, borderColor: selectedId === capability.id ? capability.color : undefined } as CSSProperties;
          return <Fragment key={capability.id}><button type="button" data-orbit-id={capability.id} className="unoone-orbit-pill unoone-orbit-desktop-control" onMouseEnter={() => setPaused(state => ({ ...state, pointer: true }))} onMouseLeave={() => setPaused(state => ({ ...state, pointer: false }))} aria-pressed={selectedId === capability.id} aria-controls="unoone-capability-detail" onClick={() => setSelectedId(capability.id)} style={position}>
            <span aria-hidden="true" style={{ background: capability.color }} />{capability.label}
          </button><span data-orbit-id={capability.id} className="unoone-orbit-pill unoone-orbit-mobile-label" aria-hidden="true" style={position}><span style={{ background: capability.color }} />{capability.label}</span></Fragment>;
        })}
      </div>
    </div>
    <div className="unoone-mobile-choices" role="group" aria-label="Choose a UnoOne capability" onFocusCapture={() => setPaused(state => ({ ...state, focus: true }))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(state => ({ ...state, focus: false })); }}>{UNOONE_CAPABILITIES.map(capability => <button key={capability.id} type="button" aria-pressed={selectedId === capability.id} aria-controls="unoone-capability-detail" onClick={() => setSelectedId(capability.id)}><span aria-hidden="true" style={{ background: capability.color }} />{capability.label}</button>)}</div>
    <div id="unoone-capability-detail" className="unoone-capability-detail" aria-live="polite" aria-atomic="true">
      <p className="unoone-capability-platform">{selected.platform}</p>
      <h3>{selected.label}</h3><p>{selected.description}</p><p className="unoone-capability-boundary">{selected.boundary}</p>
      <Link to={selected.href}>Scope &amp; availability <ArrowRight size={13} aria-hidden="true" /></Link>
    </div>
    <details className="unoone-capability-list" open={!layoutAvailable || undefined}>
      <summary>All 12 capabilities · accessible text list</summary>
      <ul>{UNOONE_CAPABILITIES.map(capability => <li key={capability.id}><h3>{capability.label}</h3><p className="unoone-capability-platform">{capability.platform}</p><p>{capability.description} {capability.boundary}</p><Link to={capability.href}>Platform details <ArrowRight size={13} aria-hidden="true" /></Link></li>)}</ul>
    </details>
    <p className="unoone-map-source">Source scope: Power engineering preprint, 14 November 2026; Mobile source/evidence review, 14–16 November. Implementation is not independent certification or final-release approval. <Link to="/status">Read current status.</Link></p>
  </div>;
}
