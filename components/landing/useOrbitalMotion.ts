import { useEffect, useRef, useState, type RefObject } from 'react';
import { UNOONE_CAPABILITIES, UNOONE_CAPABILITY_RINGS } from '../../content/unooneCapabilities';
import { ORBIT_SPEEDS, stepOrbitLabels, type OrbitBox } from './orbitLayout';

/** Animate DOM transforms/connectors only, at <=30 paints/s. React state is
 * reserved for user intent/visibility; no per-frame React renders or timers. */
export function useOrbitalMotion(root: RefObject<HTMLDivElement | null>, running: boolean, reduced: boolean) {
  const phase = useRef(0);
  const positions = useRef<OrbitBox[] | null>(null);
  const geometryKey = useRef('');
  const [layoutAvailable, setLayoutAvailable] = useState(true);
  useEffect(() => {
    const stage = root.current;
    const svg = stage?.querySelector<SVGSVGElement>('.unoone-orbit-rings');
    if (!stage || !svg) return;
    let disposed = false, frame = 0, previousTime = 0, fits = true;
    let width = 0, height = 0, svgLeft = 0, svgTop = 0, svgWidth = 0, svgHeight = 0, core = 80;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nodes = UNOONE_CAPABILITIES.map(capability => [...stage.querySelectorAll<HTMLElement>(`[data-orbit-id="${capability.id}"]`)]);
    const lines = UNOONE_CAPABILITIES.map(capability => svg.querySelector<SVGLineElement>(`[data-orbit-connector="${capability.id}"]`));
    let sizes: { width: number; height: number }[] = [];
    const draw = (seconds: number) => {
      if (!width || !svgWidth || sizes.length !== UNOONE_CAPABILITIES.length) return;
      const targets = UNOONE_CAPABILITIES.map((capability, index) => {
        const angle = capability.angle * Math.PI / 180 + ORBIT_SPEEDS[capability.ring] * phase.current;
        return { x: svgLeft + svgWidth / 2 + svgWidth * UNOONE_CAPABILITY_RINGS[capability.ring] / 100 * Math.cos(angle),
          y: svgTop + svgHeight / 2 + svgHeight * UNOONE_CAPABILITY_RINGS[capability.ring] / 100 * Math.sin(angle), ...sizes[index] };
      });
      positions.current = stepOrbitLabels(targets, positions.current, width, height, core, seconds);
      fits = positions.current !== null;
      if (fits !== layoutAvailable) setLayoutAvailable(fits);
      if (!positions.current) return;
      UNOONE_CAPABILITIES.forEach((capability, index) => {
        const angle = capability.angle * Math.PI / 180;
        const baseX = svgLeft + svgWidth / 2 + svgWidth * UNOONE_CAPABILITY_RINGS[capability.ring] / 100 * Math.cos(angle);
        const baseY = svgTop + svgHeight / 2 + svgHeight * UNOONE_CAPABILITY_RINGS[capability.ring] / 100 * Math.sin(angle);
        const point = positions.current![index];
        for (const element of nodes[index]) {
          const scale = element.classList.contains('unoone-orbit-mobile-label') ? ' scale(.65)' : '';
          element.style.transform = `translate(-50%, -50%) translate3d(${(point.x - baseX).toFixed(3)}px, ${(point.y - baseY).toFixed(3)}px, 0)${scale}`;
        }
        lines[index]?.setAttribute('x2', ((point.x - svgLeft) / svgWidth * 100).toFixed(3));
        lines[index]?.setAttribute('y2', ((point.y - svgTop) / svgHeight * 100).toFixed(3));
      });
    };
    const measure = () => {
      if (disposed) return;
      const box = stage.getBoundingClientRect(), svgBox = svg.getBoundingClientRect();
      const stable = (value: number) => Math.round(value * 100) / 100;
      width = stable(box.width); height = stable(box.height); svgLeft = stable(svgBox.left - box.left); svgTop = stable(svgBox.top - box.top); svgWidth = stable(svgBox.width); svgHeight = stable(svgBox.height);
      core = stable(stage.querySelector('.unoone-orbit-core')?.getBoundingClientRect().width ?? 80);
      sizes = nodes.map(group => {
        const element = group.find(node => getComputedStyle(node).display !== 'none');
        // Transform-space bounds vary by tiny float errors while the layout is
        // unchanged. Use untransformed CSS border-box sizes and known label scale.
        const style = element && getComputedStyle(element);
        const scale = element?.classList.contains('unoone-orbit-mobile-label') ? .65 : 1;
        return { width: stable((parseFloat(style?.width || '') || 94) * scale), height: stable((parseFloat(style?.height || '') || 44) * scale) };
      });
      const key = JSON.stringify([width, height, svgLeft, svgTop, svgWidth, svgHeight, core, sizes]);
      if (key !== geometryKey.current) { geometryKey.current = key; positions.current = null; }
      if (reduced || media.matches) { phase.current = 0; positions.current = null; }
      draw(0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage); nodes.flat().forEach(node => observer.observe(node));
    void document.fonts?.ready.then(() => { if (!disposed) measure(); });
    const stopForReduced = () => { if (media.matches) { cancelAnimationFrame(frame); measure(); } };
    media.addEventListener('change', stopForReduced);
    const tick = (now: number) => {
      if (disposed || media.matches || !running || !fits || document.hidden) return;
      if (!previousTime) previousTime = now;
      const elapsed = now - previousTime;
      if (elapsed >= 1000 / 30) {
        const seconds = Math.min(elapsed / 1000, .1);
        phase.current += seconds; previousTime = now; draw(seconds);
      }
      frame = requestAnimationFrame(tick);
    };
    if (running && !reduced && !media.matches && fits) frame = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', stopForReduced); };
  }, [root, running, reduced, layoutAvailable]);
  return layoutAvailable;
}
