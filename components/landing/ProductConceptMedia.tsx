import { useEffect, useRef, useState } from 'react';

type Connection = EventTarget & { saveData?: boolean };

/** Decorative concept footage, never a hardware demonstration. No src until admitted in-view. */
export function ProductConceptMedia({ id, label }: { id: 'silt' | 'pai'; label: string }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [policy, setPolicy] = useState({ ready: false, reduced: true, automatic: false, saveData: false });
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [intent, setIntent] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    const mobile = matchMedia('(max-width: 767px)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const update = () => setPolicy({ ready: true, reduced: reduced.matches,
      automatic: !mobile.matches && !connection?.saveData, saveData: !!connection?.saveData });
    const visibility = () => setHidden(document.hidden);
    update();
    mobile.addEventListener('change', update);
    reduced.addEventListener('change', update);
    connection?.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    const card = layerRef.current?.closest('article');
    if (card) observer.observe(card);
    return () => {
      observer.disconnect();
      mobile.removeEventListener('change', update);
      reduced.removeEventListener('change', update);
      connection?.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const shouldPlay = policy.ready && !policy.reduced && !failed && visible && !hidden && (intent ?? policy.automatic);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    if (!shouldPlay) {
      video.pause();
    } else if (!loaded) {
      setLoaded(true);
    } else {
      // Rejections preserve the poster and expose a deliberate retry, rather than retrying every scroll.
      video.play().catch(() => { if (!cancelled) setIntent(false); });
    }
    return () => { cancelled = true; video.pause(); };
  }, [shouldPlay, loaded]);

  useEffect(() => {
    const layer = layerRef.current;
    const card = layer?.closest('article');
    if (!layer || !card) return;
    let disposed = false;
    let url = '';
    let pendingUrl = '';
    let signature = '';
    let generation = 0;
    let frame = 0;
    // Glyph-line ranges leave genuine negative space available; badges, icons and actions
    // are additionally protected as whole boxes. Coordinates stay card-relative on hover.
    const protect = () => {
      if (disposed) return;
      frame = 0;
      const bounds = layer.getBoundingClientRect();
      const rects: number[][] = [];
      const add = (r: DOMRect, pad: number) => {
        if (r.width && r.height) rects.push([r.left - bounds.left - pad, r.top - bounds.top - pad, r.width + pad * 2, r.height + pad * 2].map(n => Math.round(n * 10) / 10));
      };
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim() || layer.contains(node) || node.parentElement?.closest('script,style')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) add(rect, 5);
      }
      card.querySelectorAll('a,button,svg,[data-concept-protect]').forEach(element => {
        if (!layer.contains(element)) add(element.getBoundingClientRect(), 7);
      });
      const next = JSON.stringify([bounds.width, bounds.height, rects]);
      if (next === signature) return; // Avoid blanking on same-geometry translations or callbacks.
      signature = next;
      layer.dataset.ready = 'false';
      const current = ++generation;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><defs><mask id="protect" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/>${rects.map(r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="5" fill="black"/>`).join('')}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#protect)"/></svg>`;
      const nextUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      pendingUrl = nextUrl;
      const image = new Image();
      image.onload = () => {
        if (disposed || current !== generation) return;
        layer.style.maskImage = `url("${nextUrl}")`;
        layer.style.webkitMaskImage = `url("${nextUrl}")`;
        layer.dataset.maskCount = String(rects.length);
        layer.dataset.ready = 'true';
        if (url) URL.revokeObjectURL(url);
        url = nextUrl;
        pendingUrl = '';
      };
      image.onerror = () => { if (current === generation) layer.dataset.ready = 'false'; };
      image.src = nextUrl;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(protect); };
    const resize = new ResizeObserver(protect);
    resize.observe(card);
    const content = card.querySelector('[data-concept-content]');
    const note = card.querySelector('.product-concept-note');
    if (content) resize.observe(content);
    const mutations = new MutationObserver(protect);
    if (content) mutations.observe(content, { subtree: true, childList: true, characterData: true, attributes: true });
    if (note) mutations.observe(note, { subtree: true, childList: true, characterData: true, attributes: true });
    const language = new MutationObserver(protect);
    language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
    document.fonts.addEventListener('loading', protect);
    document.fonts.addEventListener('loadingdone', protect);
    document.fonts.ready.then(() => { if (!disposed) protect(); });
    window.addEventListener('resize', schedule);
    protect();
    return () => {
      disposed = true;
      generation++;
      cancelAnimationFrame(frame);
      resize.disconnect(); mutations.disconnect(); language.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loading', protect);
      document.fonts.removeEventListener('loadingdone', protect);
      if (url) URL.revokeObjectURL(url);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, []);

  return <>
    <div ref={layerRef} className="product-concept-layer" aria-hidden="true" data-ready="false" data-product={id}>
      <div className="product-concept-stage">
        <img src={`/product-concepts/${id}.webp`} alt="" loading="lazy" decoding="async" />
        <video ref={videoRef} src={loaded ? `/product-concepts/${id}.mp4` : undefined}
          muted playsInline loop preload="none" tabIndex={-1}
          className={frameReady && !failed ? 'is-ready' : ''}
          onLoadedData={() => setFrameReady(true)} onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)} onError={() => { setFailed(true); setFrameReady(false); }} />
      </div>
    </div>
    <div className="product-concept-note">
      <span>Concept animation · not actual hardware or a demonstration.</span>
      <span className="product-concept-control-slot">
        {policy.ready && !policy.reduced && !failed && <button type="button"
          aria-label={`${playing ? 'Pause' : 'Play'} ${label} concept animation${policy.saveData && !playing ? ' (loads video)' : ''}`}
          onClick={() => setIntent(!playing)}>{playing ? 'Pause' : policy.saveData ? 'Play (loads video)' : 'Play'}</button>}
      </span>
    </div>
  </>;
}
