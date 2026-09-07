import React, { useEffect, useId, useRef, useState } from 'react';

/** Literal port of the approved edge-contour preview; one inert, masked SVG. */
const HeroEdgeDepth: React.FC<{ language: string }> = ({ language }) => {
  const id = useId().replace(/:/g, '');
  const layerRef = useRef<HTMLDivElement>(null);
  const exclusionsRef = useRef<SVGGElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const layer = layerRef.current;
    const exclusions = exclusionsRef.current;
    const hero = layer?.closest('header');
    if (!layer || !exclusions || !hero) return;
    let disposed = false;
    let pending = 0;
    let followup = 0;
    let entranceStart = 0;
    let entranceFrame = 0;
    let entranceComplete = false;
    // Include standalone badge text as well as the preview's full text/control
    // rectangles. Nested spans already protected by a parent need no extra box.
    const boxes = Array.from(hero.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,select,ul,span')).filter(
      element => !layer.contains(element) && (element.tagName !== 'SPAN' || (
        !element.parentElement?.closest('h1,h2,h3,p,a,button,select,ul') &&
        Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      )),
    );
    let lastGeometry = '';
    const geometryKey = () => {
      const area = hero.getBoundingClientRect();
      return JSON.stringify([area.width, area.height, ...boxes.map(element => {
        const box = element.getBoundingClientRect();
        return [box.left - area.left, box.top - area.top, box.width, box.height];
      })]);
    };
    const protectText = () => {
      if (disposed) return;
      const rect = hero.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const fragment = document.createDocumentFragment();
      for (const element of boxes) {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', String((box.left - rect.left - 10) / rect.width * 1440));
        r.setAttribute('y', String((box.top - rect.top - 10) / rect.height * 1360));
        r.setAttribute('width', String((box.width + 20) / rect.width * 1440));
        r.setAttribute('height', String((box.height + 20) / rect.height * 1360));
        r.setAttribute('rx', '6');
        r.setAttribute('fill', 'black');
        fragment.append(r);
      }
      exclusions.replaceChildren(fragment);
      lastGeometry = geometryKey();
      layer.dataset.ready = entranceComplete ? 'true' : 'false';
    };
    // Read after the existing Motion hero transforms. Event-driven/coalesced,
    // not a perpetual drawing loop; both frames and late font promises are safe
    // across StrictMode cleanup, language changes, and route unmounts.
    const align = () => {
      if (disposed) return;
      // Never display stale exclusions while fonts, viewport or hero content
      // are moving. Hide immediately, then reveal only after fresh rectangles
      // are measured; text clarity takes priority over decorative continuity.
      layer.dataset.ready = 'false';
      if (pending || followup) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (disposed) return;
        followup = requestAnimationFrame(() => { followup = 0; protectText(); });
      });
    };
    // Global font events can concern fonts this hero never uses. Do not blank
    // a correct layer unless the actual protected rectangles have changed.
    const alignIfChanged = () => {
      if (!disposed && geometryKey() !== lastGeometry) align();
    };
    layer.dataset.ready = 'false';
    const observer = new ResizeObserver(alignIfChanged);
    observer.observe(hero);
    boxes.forEach(element => observer.observe(element));
    align();
    document.fonts.ready.then(alignIfChanged);
    document.fonts.addEventListener('loadingdone', alignIfChanged);
    window.addEventListener('resize', align);
    window.addEventListener('scroll', align, { passive: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.addEventListener('change', align);
    // Original delayed text entrances move without resize/scroll events.
    // Keep the *added* decoration hidden until those finite animations finish,
    // then align against their final geometry. The original page never waits.
    entranceStart = requestAnimationFrame(() => {
      entranceStart = 0;
      entranceFrame = requestAnimationFrame(() => {
        entranceFrame = 0;
        if (disposed) return;
        const entrances = hero.getAnimations({ subtree: true }).filter(animation => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && !layer.contains(target) &&
            animation.effect?.getComputedTiming().iterations !== Infinity;
        });
        void Promise.all(entrances.map(animation => animation.finished.catch(() => undefined))).then(() => {
          if (disposed) return;
          entranceComplete = true;
          align();
        });
      });
    });
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', alignIfChanged);
      window.removeEventListener('resize', align);
      window.removeEventListener('scroll', align);
      reduced.removeEventListener('change', align);
      cancelAnimationFrame(entranceStart);
      cancelAnimationFrame(entranceFrame);
      cancelAnimationFrame(pending);
      cancelAnimationFrame(followup);
    };
  }, [language]);

  return (
    <>
      <div ref={layerRef} className="hero-edge-depth" aria-hidden="true" data-paused={paused}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1360" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id={`${id}-side-mask`}><stop stopColor="white" /><stop offset=".13" stopColor="white" stopOpacity=".6" /><stop offset=".23" stopColor="black" /><stop offset=".77" stopColor="black" /><stop offset=".87" stopColor="white" stopOpacity=".6" /><stop offset="1" stopColor="white" /></linearGradient>
            <mask id={`${id}-quiet-centre`}><rect width="1440" height="1360" fill={`url(#${id}-side-mask)`} /><g ref={exclusionsRef} data-text-exclusions="true" /></mask>
            <linearGradient id={`${id}-saffron-metal`} x1="0" x2="1" y2="1"><stop stopColor="#f59f4f" stopOpacity=".20" /><stop offset=".34" stopColor="#fde8d0" stopOpacity=".10" /><stop offset=".65" stopColor="#18202e" stopOpacity=".12" /><stop offset="1" stopColor="#f59f4f" stopOpacity=".015" /></linearGradient>
            <linearGradient id={`${id}-slate-metal`} x1="1" x2="0" y2="1"><stop stopColor="#7d9cc5" stopOpacity=".19" /><stop offset=".52" stopColor="#6fd3a3" stopOpacity=".075" /><stop offset="1" stopColor="#213755" stopOpacity=".03" /></linearGradient>
          </defs>
          <g mask={`url(#${id}-quiet-centre)`}>
            <g className="hero-edge-left">
              <path d="M-140 -190 C380 115 288 430 116 735 C-52 1038 160 1210 338 1410 L320 1410 C140 1210 -73 1035 98 731 C269 424 359 118 -160 -180Z" fill={`url(#${id}-saffron-metal)`} />
              <path d="M-140 -190 C380 115 288 430 116 735 C-52 1038 160 1210 338 1410" fill="none" stroke="#f5b76f" strokeOpacity=".16" strokeWidth="1.1" />
              <path d="M-270 -120 C260 205 170 400 16 697 C-149 1010 53 1250 246 1420" fill="none" stroke="#778ba9" strokeOpacity=".14" strokeWidth="1" />
              <path d="M-185 -140 C320 169 229 416 65 717 C-95 1024 105 1230 292 1410" fill="none" stroke="#f59f4f" strokeOpacity=".065" strokeWidth="1" />
            </g>
            <g className="hero-edge-right">
              <path d="M1640 -160 C1190 136 1335 410 1336 625 C1337 880 1100 1050 1250 1430 L1268 1430 C1118 1050 1356 880 1353 625 C1350 410 1210 140 1658 -150Z" fill={`url(#${id}-slate-metal)`} />
              <path d="M1640 -160 C1190 136 1335 410 1336 625 C1337 880 1100 1050 1250 1430" fill="none" stroke="#9eb6d5" strokeOpacity=".15" strokeWidth="1.1" />
              <path d="M1740 -120 C1304 192 1440 456 1435 658 C1430 940 1196 1110 1350 1440" fill="none" stroke="#6fd3a3" strokeOpacity=".11" strokeWidth="1" />
              <path d="M1690 -140 C1250 164 1386 434 1385 641 C1383 910 1150 1080 1300 1435" fill="none" stroke="#8da4c5" strokeOpacity=".07" strokeWidth="1" />
            </g>
          </g>
        </svg>
      </div>
      <button type="button" className="hero-edge-pause" lang="en" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
        {paused ? 'Resume edge motion' : 'Pause edge motion'}
      </button>
    </>
  );
};

export default HeroEdgeDepth;
