import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useReducedMotion } from 'motion/react';

type Connection = EventTarget & { saveData?: boolean };

/** The poster is independent of the optional loop: media never gates the page. */
export function FieldMedia() {
  const reduced = useReducedMotion();
  const figure = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [eligible, setEligible] = useState(false);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const update = () => setEligible(desktop.matches && !preference.matches && !connection?.saveData && !reduced);
    update();
    desktop.addEventListener('change', update);
    preference.addEventListener('change', update);
    connection?.addEventListener('change', update);
    return () => {
      desktop.removeEventListener('change', update);
      preference.removeEventListener('change', update);
      connection?.removeEventListener('change', update);
    };
  }, [reduced]);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 });
    if (figure.current) observer.observe(figure.current);
    return () => {
      document.removeEventListener('visibilitychange', update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let cancelled = false;
    if (eligible && inView && visible && !paused && !failed) {
      element.muted = true;
      void element.play().catch(() => { if (!cancelled) setPaused(true); });
    } else element.pause();
    return () => { cancelled = true; element.pause(); };
  }, [eligible, inView, visible, paused, failed]);

  return (
    <figure ref={figure} className="field-media" aria-label="Conceptual engineering study">
      <div className="field-media-fallback" aria-hidden="true">
        <div className="field-sculpture"><i /><i /><i /><i /></div>
      </div>
      <img src="/field-lab/hero-poster.webp" width="1600" height="900" fetchPriority="high"
        className={`field-media-poster${posterFailed ? ' field-media-unavailable' : ''}`}
        alt="Abstract architectural study of private AI infrastructure; not real hardware"
        onError={() => setPosterFailed(true)} />
      {eligible && !failed && <video ref={video} src="/field-lab/hero-loop.mp4"
        className={`field-media-video${playing ? ' is-playing' : ''}`} muted playsInline loop
        preload="none" poster="/field-lab/hero-poster.webp" aria-hidden="true" tabIndex={-1}
        onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => { setFailed(true); setPlaying(false); }} />}
      <div className="field-media-scale" aria-hidden="true">INB / FIELD STUDY 01 <span>FORM · STATE · TRUST</span></div>
      <figcaption>Conceptual engineering study <span>Not real hardware or a product demo.</span></figcaption>
      {eligible && !failed && <button type="button" className="field-media-control"
        aria-label={paused ? 'Resume conceptual animation' : 'Pause conceptual animation'}
        onClick={() => setPaused((value) => !value)}>
        {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
        <span>{paused ? 'Resume' : 'Pause'}</span>
      </button>}
    </figure>
  );
}
