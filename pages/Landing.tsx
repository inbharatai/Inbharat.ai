import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform, useInView } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import HeroGitaQuote from '../components/HeroGitaQuote';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight,
  BookOpen,
  Brain,
  ChevronDown,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Menu,
  MessageCircle,
  Monitor,
  Network,
  Play,
  Search,
  ShieldCheck,
  Share2,
  Sparkles,
  Target,
  Twitter,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { SITE } from '../seo.config';
import { trackEvent } from '../lib/analytics';

gsap.registerPlugin(ScrollTrigger);

/* ═══════════════════════════════════════════════════════
   ANIMATION PRIMITIVES
   ═══════════════════════════════════════════════════════ */

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const revealSection = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease },
  },
};

const staggerChildren = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const itemReveal = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.65, delay: i * 0.08, ease },
  }),
};

/* ── Reveal wrapper ── */
type SectionProps = { id?: string; className?: string; children: React.ReactNode };

const Reveal: React.FC<SectionProps> = ({ id, className = '', children }) => (
  <motion.section
    id={id}
    className={className}
    variants={revealSection}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.06 }}
  >
    {children}
  </motion.section>
);

/* ── Word-by-word slide-up ── */
const WordReveal: React.FC<{ text: string; className?: string; delay?: number }> = ({
  text,
  className = '',
  delay = 0,
}) => {
  const prefersReduced = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={`inline ${className}`} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', overflow: 'hidden', lineHeight: 'inherit', verticalAlign: 'top' }}
        >
          <motion.span
            style={{ display: 'inline-block' }}
            initial={prefersReduced ? undefined : { y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.8, delay: delay + i * 0.055, ease }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? '\u00a0' : ''}
        </motion.span>
      ))}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════
   ANIMATED AI ENTITY — Premium hero visualization
   A glowing AI core with orbiting data rings, streaming
   particles, and intelligence pulses.
   ═══════════════════════════════════════════════════════ */

const AIEntity: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduceMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let time = 0;

    // Particles orbiting the core
    const particles: { angle: number; radius: number; speed: number; size: number; color: string; trail: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 80 + Math.random() * 120,
        speed: 0.003 + Math.random() * 0.008,
        size: 0.5 + Math.random() * 2,
        color: ['#f59f4f', '#6366f1', '#10b981', '#3b82f6'][Math.floor(Math.random() * 4)],
        trail: 3 + Math.random() * 8,
      });
    }

    // Data stream lines
    const streams: { y: number; speed: number; x: number; length: number; opacity: number }[] = [];
    for (let i = 0; i < 12; i++) {
      streams.push({
        y: Math.random() * 600,
        speed: 0.5 + Math.random() * 1.5,
        x: 60 + Math.random() * 480,
        length: 30 + Math.random() * 80,
        opacity: 0.04 + Math.random() * 0.08,
      });
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      time += 0.016;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // === OUTER GLOW ===
      const glowRadius = 140 + Math.sin(time * 0.5) * 20;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glow.addColorStop(0, 'rgba(245, 159, 79, 0.08)');
      glow.addColorStop(0.4, 'rgba(99, 102, 241, 0.04)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // === DATA STREAMS (vertical) ===
      streams.forEach((s) => {
        s.y -= s.speed;
        if (s.y + s.length < 0) {
          s.y = h + 20;
          s.x = 60 + Math.random() * (w - 120);
        }
        const grad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.length);
        grad.addColorStop(0, `rgba(99, 102, 241, ${s.opacity})`);
        grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + s.length);
        ctx.stroke();
      });

      // === ORBITAL RINGS ===
      for (let ring = 0; ring < 3; ring++) {
        const ringRadius = 60 + ring * 45;
        const ringOpacity = 0.06 - ring * 0.015;
        const rotation = time * (0.15 - ring * 0.04);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.strokeStyle = `rgba(245, 159, 79, ${ringOpacity})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 8 + ring * 4]);
        ctx.beginPath();
        ctx.ellipse(0, 0, ringRadius, ringRadius * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // === ORBITING PARTICLES ===
      particles.forEach((p) => {
        p.angle += p.speed;
        const px = cx + Math.cos(p.angle) * p.radius;
        const py = cy + Math.sin(p.angle) * (p.radius * 0.3);

        // Only draw if in viewport
        if (px > -10 && px < w + 10 && py > -10 && py < h + 10) {
          // Particle trail
          const trailX = cx + Math.cos(p.angle - p.speed * p.trail) * p.radius;
          const trailY = cy + Math.sin(p.angle - p.speed * p.trail) * (p.radius * 0.3);
          const trailGrad = ctx.createLinearGradient(trailX, trailY, px, py);
          trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
          trailGrad.addColorStop(1, p.color + '40');
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = p.size * 0.6;
          ctx.beginPath();
          ctx.moveTo(trailX, trailY);
          ctx.lineTo(px, py);
          ctx.stroke();

          // Particle dot
          ctx.fillStyle = p.color + '90';
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // === CORE ===
      const coreRadius = 28 + Math.sin(time * 1.2) * 3;

      // Core outer glow
      const coreGlow = ctx.createRadialGradient(cx, cy, coreRadius * 0.5, cx, cy, coreRadius * 2.5);
      coreGlow.addColorStop(0, 'rgba(245, 159, 79, 0.15)');
      coreGlow.addColorStop(0.5, 'rgba(99, 102, 241, 0.06)');
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Core body
      const coreFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      coreFill.addColorStop(0, 'rgba(245, 159, 79, 0.3)');
      coreFill.addColorStop(0.6, 'rgba(99, 102, 241, 0.15)');
      coreFill.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
      ctx.fillStyle = coreFill;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Core border
      ctx.strokeStyle = 'rgba(245, 159, 79, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner pulse ring
      const pulseScale = 1 + ((time * 0.4) % 1) * 1.5;
      const pulseOpacity = 0.2 * (1 - ((time * 0.4) % 1));
      ctx.strokeStyle = `rgba(245, 159, 79, ${pulseOpacity})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * pulseScale, 0, Math.PI * 2);
      ctx.stroke();

      // Second pulse (offset)
      const pulse2Scale = 1 + (((time * 0.4) + 0.5) % 1) * 1.5;
      const pulse2Opacity = 0.15 * (1 - (((time * 0.4) + 0.5) % 1));
      ctx.strokeStyle = `rgba(99, 102, 241, ${pulse2Opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * pulse2Scale, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduceMotion]);

  // Static fallback for reduced motion
  if (reduceMotion) {
    return (
      <div className="absolute inset-0 z-[1] flex items-center justify-center opacity-30">
        <div className="h-40 w-40 rounded-full border border-[#f59f4f]/20 bg-[radial-gradient(circle,rgba(245,159,79,0.1)_0%,transparent_70%)]" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[1] h-full w-full"
      style={{ opacity: 0.7 }}
      aria-hidden="true"
    />
  );
};

/* ═══════════════════════════════════════════════════════
   MARQUEE TICKER
   ═══════════════════════════════════════════════════════ */

const TICKER_NAMES = [
  'InBharat AI', 'KathaKitaab.AI', 'Agent Arcade', 'Phoring',
  'Sahaayak AI', 'UniAssist', 'TestsPrep.in', 'UniBot',
  'SocialFlow', 'OpenClawFix', 'SahaayakSeva',
];

const Marquee: React.FC<{ reverse?: boolean }> = ({ reverse = false }) => {
  const doubled = [...TICKER_NAMES, ...TICKER_NAMES];
  return (
    <div className="overflow-hidden py-4" aria-hidden="true">
      <div className={`flex gap-12 whitespace-nowrap ${reverse ? 'marquee-rtl' : 'marquee-ltr'}`}>
        {doubled.map((name, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.28em] text-[#8ab4d8]"
          >
            <span className="h-1 w-1 rounded-full bg-[#f59f4f]/40 flex-shrink-0" />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   COUNT-UP ANIMATION
   ═══════════════════════════════════════════════════════ */

const CountUp: React.FC<{ target: string; reduceMotion: boolean }> = ({ target, reduceMotion }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const numericMatch = target.match(/^([\d,.]+)/);
    if (!numericMatch) return;
    const end = parseFloat(numericMatch[1].replace(/,/g, ''));
    const suffix = target.slice(numericMatch[1].length);
    const hasDecimal = numericMatch[1].includes('.');
    const duration = 1400;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const val = eased * end;
      setDisplay((hasDecimal ? val.toFixed(1) : Math.round(val).toLocaleString()) + suffix);
      if (progress < 1) requestAnimationFrame(step);
    };
    setDisplay((hasDecimal ? '0.0' : '0') + target.slice(numericMatch[1].length));
    requestAnimationFrame(step);
  }, [inView, reduceMotion, target]);

  return <span ref={ref}>{display}</span>;
};

/* ═══════════════════════════════════════════════════════
   PHORING SCENARIO GRAPH — Animated intelligence pipeline
   Adapted from phoring.in's ScenarioGraph canvas visualization.
   Renders the real data-flow: Documents → Knowledge Graph →
   Multi-Agent Simulation → Source-Cited Intelligence Report
   ═══════════════════════════════════════════════════════ */

const GRAPH_BLUE: [number, number, number] = [16, 185, 129];   // emerald
const GRAPH_CYAN: [number, number, number] = [34, 211, 238];
const GRAPH_AMBER: [number, number, number] = [245, 159, 79];
const GRAPH_GREEN: [number, number, number] = [52, 211, 153];
const GRAPH_PURPLE: [number, number, number] = [147, 51, 234];
const GRAPH_ROSE: [number, number, number] = [244, 63, 94];

interface GNode { x: number; y: number; r: number; color: [number, number, number]; label: string; tech?: string; baseAlpha: number }
interface GEdge { from: number; to: number }
interface GSignal { edgeIdx: number; progress: number; speed: number; size: number }

const G_NODES: GNode[] = [
  { x: 0.50, y: 0.92, r: 9, color: GRAPH_BLUE, label: 'DOCUMENTS', tech: 'PDF · MD · TXT', baseAlpha: 1.0 },
  { x: 0.30, y: 0.76, r: 6, color: GRAPH_CYAN, label: 'ONTOLOGY', tech: 'LLM', baseAlpha: 0.85 },
  { x: 0.70, y: 0.76, r: 7, color: GRAPH_BLUE, label: 'ZEP GRAPH', tech: 'Zep Cloud', baseAlpha: 0.9 },
  { x: 0.12, y: 0.55, r: 4.5, color: GRAPH_GREEN, label: 'ENTITIES', tech: 'Zep', baseAlpha: 0.7 },
  { x: 0.37, y: 0.52, r: 5, color: GRAPH_PURPLE, label: 'PROFILES', tech: 'LLM + OASIS', baseAlpha: 0.75 },
  { x: 0.63, y: 0.52, r: 5, color: GRAPH_AMBER, label: 'WEB INTEL', tech: 'Serper · News', baseAlpha: 0.75 },
  { x: 0.88, y: 0.55, r: 4.5, color: GRAPH_CYAN, label: 'CONFIG', tech: 'LLM', baseAlpha: 0.7 },
  { x: 0.50, y: 0.36, r: 8, color: GRAPH_AMBER, label: 'SIMULATION', tech: 'OASIS · CAMEL', baseAlpha: 0.9 },
  { x: 0.32, y: 0.20, r: 5.5, color: GRAPH_GREEN, label: 'REPORT AGENT', tech: 'ReACT Loop', baseAlpha: 0.8 },
  { x: 0.68, y: 0.20, r: 4.5, color: GRAPH_BLUE, label: 'ZEP TOOLS', tech: 'Search · Query', baseAlpha: 0.7 },
  { x: 0.50, y: 0.08, r: 6, color: GRAPH_ROSE, label: 'CONSENSUS', tech: 'Multi-AI', baseAlpha: 0.85 },
];

const G_EDGES: GEdge[] = [
  { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 2 },
  { from: 2, to: 3 }, { from: 2, to: 4 }, { from: 2, to: 5 }, { from: 2, to: 6 },
  { from: 3, to: 4 },
  { from: 3, to: 7 }, { from: 4, to: 7 }, { from: 5, to: 7 }, { from: 6, to: 7 },
  { from: 7, to: 8 }, { from: 7, to: 9 }, { from: 9, to: 8 }, { from: 8, to: 10 },
];

function gBezier(ax: number, ay: number, bx: number, by: number, t: number) {
  const mx = (ax + bx) / 2, my = ay - (ay - by) * 0.6;
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * mx + t * t * bx, y: u * u * ay + 2 * u * t * my + t * t * by };
}

const PhoringScenarioGraph: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = 0, h = 0, raf = 0;
    const phases = G_NODES.map(() => Math.random() * Math.PI * 2);
    const signals: GSignal[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    if (reduceMotion) {
      // Static render: draw edges + nodes once
      const nx = (v: number) => v * w, ny = (v: number) => v * h;
      for (const e of G_EDGES) {
        const a = G_NODES[e.from], b = G_NODES[e.to];
        const [r, g, bb] = b.color;
        ctx.beginPath();
        for (let s = 0; s <= 50; s++) { const t = s / 50; const p = gBezier(nx(a.x), ny(a.y), nx(b.x), ny(b.y), t); s === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
        ctx.strokeStyle = `rgba(${r},${g},${bb},0.18)`; ctx.lineWidth = 1.2; ctx.stroke();
      }
      for (const n of G_NODES) {
        const [r, g, b] = n.color; const px = nx(n.x), py = ny(n.y);
        const cg = ctx.createRadialGradient(px, py, 0, px, py, n.r);
        cg.addColorStop(0, `rgba(${r},${g},${b},${n.baseAlpha * 0.9})`);
        cg.addColorStop(1, `rgba(${r},${g},${b},${n.baseAlpha * 0.2})`);
        ctx.beginPath(); ctx.arc(px, py, n.r, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        ctx.font = `600 ${Math.max(7, Math.min(9.5, w * 0.012))}px "Sora","Manrope",sans-serif`;
        ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.fillText(n.label, px, py - n.r - 10);
        if (n.tech) { ctx.font = `400 ${Math.max(6, Math.min(7.5, w * 0.009))}px "Sora","Manrope",sans-serif`; ctx.fillStyle = `rgba(${r},${g},${b},0.55)`; ctx.fillText(n.tech, px, py - n.r - 1); }
      }
      return () => window.removeEventListener('resize', resize);
    }

    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      ctx.clearRect(0, 0, w, h);
      const intro = Math.min(elapsed / 4000, 1);
      const eased = 1 - Math.pow(1 - intro, 3);
      const nx = (v: number) => v * w, ny = (v: number) => v * h;

      // Edges
      for (const e of G_EDGES) {
        const a = G_NODES[e.from], b = G_NODES[e.to];
        const [r, g, bb] = b.color;
        const df = 1 - b.y, ed = df * 0.5;
        const ei = Math.max(0, Math.min((eased - ed) / (1 - ed), 1));
        if (ei <= 0) continue;
        const steps = 50, draw = Math.floor(steps * ei);
        ctx.beginPath();
        for (let s = 0; s <= draw; s++) { const t = s / steps; const p = gBezier(nx(a.x), ny(a.y), nx(b.x), ny(b.y), t); s === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
        ctx.strokeStyle = `rgba(${r},${g},${bb},${0.18 * ei})`; ctx.lineWidth = 1.2; ctx.stroke();
        if (ei > 0.5) { ctx.beginPath(); for (let s = 0; s <= draw; s++) { const t = s / steps; const p = gBezier(nx(a.x), ny(a.y), nx(b.x), ny(b.y), t); s === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); } ctx.strokeStyle = `rgba(${r},${g},${bb},${0.04 * ei})`; ctx.lineWidth = 4; ctx.stroke(); }
      }

      // Nodes
      for (let i = 0; i < G_NODES.length; i++) {
        const n = G_NODES[i];
        phases[i] += 0.015 + (i % 3) * 0.003;
        const df = 1 - n.y, nd = df * 0.5;
        const ni = Math.max(0, Math.min((eased - nd) / (1 - nd), 1));
        if (ni <= 0) continue;
        const pulse = Math.sin(phases[i]) * 0.3 + 0.7;
        const alpha = n.baseAlpha * ni * pulse;
        const [r, g, b] = n.color;
        const px = nx(n.x), py = ny(n.y), rr = n.r * ni;

        // Atmospheric glow
        const og = ctx.createRadialGradient(px, py, 0, px, py, rr * 6);
        og.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.12})`);
        og.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.03})`);
        og.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(px, py, rr * 6, 0, Math.PI * 2); ctx.fillStyle = og; ctx.fill();

        // Mid glow ring
        ctx.beginPath(); ctx.arc(px, py, rr * 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.12})`; ctx.lineWidth = 0.8; ctx.stroke();

        // Core
        const cg = ctx.createRadialGradient(px, py, 0, px, py, rr);
        cg.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.9})`);
        cg.addColorStop(0.7, `rgba(${r},${g},${b},${alpha * 0.6})`);
        cg.addColorStop(1, `rgba(${r},${g},${b},${alpha * 0.2})`);
        ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, rr * 0.35, 0, Math.PI * 2); ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`; ctx.fill();

        // Pulse rings for key nodes
        if ((i === 0 || i === 7 || i === 10) && ni > 0.5) {
          const ra = Math.sin(time * 0.002 + i) * 0.3 + 0.5;
          ctx.beginPath(); ctx.arc(px, py, rr * 3 * ni, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${ra * 0.15 * ni})`; ctx.lineWidth = 0.7; ctx.stroke();
        }

        // Labels
        if (ni > 0.6) {
          const la = (ni - 0.6) / 0.4;
          ctx.font = `600 ${Math.max(7, Math.min(9.5, w * 0.012))}px "Sora","Manrope",sans-serif`;
          ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${r},${g},${b},${la * 0.92})`;
          ctx.fillText(n.label, px, py - rr - 10);
          if (n.tech) { ctx.font = `400 ${Math.max(6, Math.min(7.5, w * 0.009))}px "Sora","Manrope",sans-serif`; ctx.fillStyle = `rgba(${r},${g},${b},${la * 0.60})`; ctx.fillText(n.tech, px, py - rr - 1); }
        }
      }

      // Data signals
      if (eased > 0.5 && signals.length < 18 && Math.random() < 0.04) {
        signals.push({ edgeIdx: Math.floor(Math.random() * G_EDGES.length), progress: 0, speed: 0.003 + Math.random() * 0.005, size: 1.5 + Math.random() * 2 });
      }
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i]; s.progress += s.speed;
        if (s.progress > 1) { signals.splice(i, 1); continue; }
        const e = G_EDGES[s.edgeIdx]; const a = G_NODES[e.from], b = G_NODES[e.to];
        const pos = gBezier(nx(a.x), ny(a.y), nx(b.x), ny(b.y), s.progress);
        const [r, g, bb] = b.color; const fa = Math.sin(s.progress * Math.PI);
        const tg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, s.size * 6);
        tg.addColorStop(0, `rgba(${r},${g},${bb},${fa * 0.25})`); tg.addColorStop(1, `rgba(${r},${g},${bb},0)`);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, s.size * 6, 0, Math.PI * 2); ctx.fillStyle = tg; ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, s.size, 0, Math.PI * 2); ctx.fillStyle = `rgba(${r},${g},${bb},${fa * 0.85})`; ctx.fill();
      }

      // Stage labels on left
      if (eased > 0.85) {
        const ra = (eased - 0.85) / 0.15;
        ctx.font = `500 ${Math.max(6.5, Math.min(8, w * 0.009))}px "Sora","Manrope",sans-serif`;
        ctx.textAlign = 'left';
        for (const st of [
          { y: 0.92, label: 'INPUT', color: GRAPH_BLUE },
          { y: 0.76, label: 'STAGE 1 · KNOWLEDGE GRAPH', color: GRAPH_CYAN },
          { y: 0.53, label: 'STAGE 2 · ENVIRONMENT', color: GRAPH_PURPLE },
          { y: 0.36, label: 'STAGE 3 · MULTI-AGENT SIM', color: GRAPH_AMBER },
          { y: 0.20, label: 'STAGE 4 · REPORT', color: GRAPH_GREEN },
          { y: 0.08, label: 'OUTPUT · VALIDATION', color: GRAPH_ROSE },
        ]) { const [r, g, b] = st.color; ctx.fillStyle = `rgba(${r},${g},${b},${ra * 0.55})`; ctx.fillText(st.label, 6, ny(st.y) + 3); }
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />;
};

/* ═══════════════════════════════════════════════════════
   ECOSYSTEM ORBITAL — Premium 3-ring system map

   Layout logic:
   - Ring 1 (r=28%): 3 flagship products, speed 0.06 rad/s
   - Ring 2 (r=38%): 4 ecosystem tools, speed -0.04 rad/s
   - Ring 3 (r=46%): 4 supporting tools, speed 0.025 rad/s
   - All positions computed from polar coordinates
   - Pills stay upright (no rotation), only translate
   - Differential ring speeds create depth parallax
   ═══════════════════════════════════════════════════════ */

type OrbitalModule = {
  label: string;
  color: string;
  ring: 1 | 2 | 3;
  baseAngle: number; // degrees, evenly distributed per ring
  flagship?: boolean;
};

// Ring 1: 3 flagships, evenly spaced at 120 degrees
// Ring 2: 4 ecosystem, evenly spaced at 90 degrees
// Ring 3: 4 supporting, evenly spaced at 90 degrees
const ORBITAL_MODULES: OrbitalModule[] = [
  // Ring 1 — flagships
  { label: 'InBharat AI',    color: '#f59f4f', ring: 1, baseAngle: 270, flagship: true },
  { label: 'KathaKitaab.AI', color: '#f97316', ring: 1, baseAngle: 30,  flagship: true },
  { label: 'Sahaayak AI',    color: '#ff9933', ring: 1, baseAngle: 150, flagship: true },
  // Ring 2 — ecosystem
  { label: 'UniBot',       color: '#25D366', ring: 2, baseAngle: 0 },
  { label: 'UniAssist',    color: '#3b82f6', ring: 2, baseAngle: 90 },
  { label: 'TestsPrep',    color: '#f43f5e', ring: 2, baseAngle: 180 },
  { label: 'Phoring',      color: '#10b981', ring: 2, baseAngle: 270 },
  // Ring 3 — supporting
  { label: 'Agent Arcade',  color: '#4C8BF5', ring: 3, baseAngle: 45 },
  { label: 'SocialFlow',    color: '#7C3AED', ring: 3, baseAngle: 135 },
  { label: 'OpenClawFix',   color: '#14b8a6', ring: 3, baseAngle: 225 },
  { label: 'SahaayakSeva',  color: '#059669', ring: 3, baseAngle: 315 },
];

const RING_CONFIG = {
  1: { radius: 28, speed: 0.06, opacity: 0.10, dash: '3 6' },
  2: { radius: 38, speed: -0.04, opacity: 0.07, dash: '2 8' },
  3: { radius: 46, speed: 0.025, opacity: 0.05, dash: '1.5 10' },
} as const;

const EcosystemOrbital: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [positions, setPositions] = useState<{ x: number; y: number }[]>(
    () => ORBITAL_MODULES.map((m) => {
      const cfg = RING_CONFIG[m.ring];
      const rad = (m.baseAngle * Math.PI) / 180;
      return { x: 50 + cfg.radius * Math.cos(rad), y: 50 + cfg.radius * Math.sin(rad) };
    })
  );

  // Animate orbital positions via rAF for smooth 60fps
  useEffect(() => {
    if (reduceMotion) return;
    let raf: number;
    let t = 0;

    const tick = () => {
      t += 0.016; // ~60fps
      const next = ORBITAL_MODULES.map((m) => {
        const cfg = RING_CONFIG[m.ring];
        const angle = ((m.baseAngle * Math.PI) / 180) + cfg.speed * t;
        return {
          x: 50 + cfg.radius * Math.cos(angle),
          y: 50 + cfg.radius * Math.sin(angle),
        };
      });
      setPositions(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto aspect-square w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[500px]"
    >
      {/* SVG layer: orbit rings, connector lines, signal pulses */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59f4f" stopOpacity="0.15" />
            <stop offset="40%" stopColor="#6366f1" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center glow */}
        <circle cx="50" cy="50" r="18" fill="url(#core-glow)" />

        {/* Orbit ring lines */}
        {([1, 2, 3] as const).map((ring) => {
          const cfg = RING_CONFIG[ring];
          return (
            <circle
              key={`ring-${ring}`}
              cx="50" cy="50" r={cfg.radius}
              fill="none"
              stroke="#f59f4f"
              strokeWidth="0.3"
              strokeOpacity={cfg.opacity}
              strokeDasharray={cfg.dash}
            />
          );
        })}

        {/* Connector lines from modules to center */}
        {ORBITAL_MODULES.map((m, i) => (
          <line
            key={`conn-${i}`}
            x1="50" y1="50"
            x2={positions[i].x} y2={positions[i].y}
            stroke={m.color}
            strokeWidth={hoveredIdx === i ? '0.4' : '0.15'}
            strokeOpacity={hoveredIdx === i ? 0.5 : 0.15}
            strokeDasharray="1.5 3"
            style={{ transition: 'stroke-opacity 0.3s, stroke-width 0.3s' }}
          />
        ))}

        {/* Signal pulses — only for flagship products */}
        {!reduceMotion && ORBITAL_MODULES.map((m, i) => {
          if (!m.flagship) return null;
          return (
            <circle
              key={`pulse-${i}`}
              cx={positions[i].x} cy={positions[i].y}
              r="1"
              fill={m.color}
              opacity="0.6"
            >
              <animate
                attributeName="r" values="0.5;2.5;0.5"
                dur="3s" begin={`${i * 1}s`} repeatCount="indefinite"
              />
              <animate
                attributeName="opacity" values="0.6;0;0.6"
                dur="3s" begin={`${i * 1}s`} repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>

      {/* Center core (DOM for crispness) */}
      <div className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#080d16] shadow-[0_0_60px_rgba(245,159,79,0.18),0_0_120px_rgba(99,102,241,0.08)] sm:h-20 sm:w-20">
        <motion.img
          src="/inbharat-logo.svg"
          alt="InBharat logo"
          className="h-8 w-8 object-contain sm:h-10 sm:w-10"
          animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Pulsing energy ring around core */}
      {!reduceMotion && (
        <motion.div
          className="absolute left-1/2 top-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f59f4f]/20 sm:h-20 sm:w-20"
          animate={{ scale: [1, 2, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Module pills (DOM elements, always upright) */}
      {ORBITAL_MODULES.map((m, i) => {
        const isHovered = hoveredIdx === i;
        return (
          <div
            key={m.label}
            className="absolute z-10"
            style={{
              left: `${positions[i].x}%`,
              top: `${positions[i].y}%`,
              transform: 'translate(-50%, -50%)',
              // No will-change to avoid layer explosion on mobile
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div
              className="whitespace-nowrap rounded-lg px-2 py-1 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-sm sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-[10px]"
              style={{
                backgroundColor: isHovered ? `${m.color}20` : 'rgba(12, 20, 34, 0.92)',
                border: `1px solid ${isHovered ? m.color + '50' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: isHovered
                  ? `0 0 20px ${m.color}25, 0 4px 12px rgba(0,0,0,0.3)`
                  : '0 2px 8px rgba(0,0,0,0.2)',
                transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2"
                style={{
                  backgroundColor: m.color,
                  boxShadow: isHovered ? `0 0 6px ${m.color}` : 'none',
                }}
              />
              {m.label}
              {m.flagship && (
                <span className="ml-1 text-[7px] opacity-50 sm:text-[8px]">*</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   PRODUCT DEFINITIONS
   ═══════════════════════════════════════════════════════ */

type ProductLogoProps = {
  logo: string | null;
  name: string;
  color: string;
  icon?: React.FC<{ size?: number; color?: string; className?: string }>;
};

const ProductLogo: React.FC<ProductLogoProps> = ({ logo, name, color, icon: Icon }) => {
  if (logo) {
    return <img src={logo} alt={`${name} logo`} className="h-10 w-10 object-contain opacity-95" width={40} height={40} loading="lazy" decoding="async" />;
  }
  if (Icon) {
    return <Icon size={40} color={color} className="opacity-90" />;
  }
  const initials = name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white select-none"
      style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}40` }}
    >
      {initials}
    </div>
  );
};

const TypeBadge: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
    style={{ backgroundColor: `${color}12`, color, border: `1px solid ${color}25` }}
  >
    {children}
  </span>
);

const PRODUCT_DEFS = [
  { name: 'InBharat AI', tagKey: 'landProdInbharatTag', descKey: 'landProdInbharatDesc', ctaKey: 'landProdInbharatCta', typeKey: 'landProdInbharatType', href: '/app', logo: '/inbharat-logo.svg', internal: true, color: '#f59f4f', tech: ['React 19', 'TypeScript', 'Vercel', 'OpenAI'] },
  { name: 'KathaKitaab.AI', tagKey: 'landProdKathakitaabTag', descKey: 'landProdKathakitaabDesc', ctaKey: 'landProdKathakitaabCta', typeKey: 'landProdKathakitaabType', href: 'https://kathakitaab-ai.vercel.app/', logo: null, icon: FileText, internal: false, color: '#f97316', tech: ['React', 'Vercel', 'Indian Languages', 'AI'] },
  { name: 'Agent Arcade', tagKey: 'landProdArcadeTag', descKey: 'landProdArcadeDesc', ctaKey: 'landProdArcadeCta', typeKey: 'landProdArcadeType', href: 'https://github.com/inbharatai/agent-arcade-gateway', logo: null, internal: false, color: '#4C8BF5', tech: ['Bun', 'Next.js', 'Socket.IO', 'SQLite'] },
  { name: 'Phoring', tagKey: 'landProdPhoringTag', descKey: 'landProdPhoringDesc', ctaKey: 'landProdPhoringCta', typeKey: 'landProdPhoringType', href: 'https://phoring.onrender.com', logo: '/phoring-logo.png', internal: false, color: '#10b981', tech: ['Python', 'Vue 3', 'OASIS', 'Zep Cloud'] },
  { name: 'Sahaayak AI', tagKey: 'landProdSahaayakTag', descKey: 'landProdSahaayakDesc', ctaKey: 'landProdSahaayakCta', typeKey: 'landProdSahaayakType', href: 'https://github.com/inbharatai/sahaayak-ai', logo: null, icon: Monitor, internal: false, color: '#ff9933', tech: ['FastAPI', 'Next.js', 'Whisper', 'Vosk'] },
  { name: 'SahaayakSeva', tagKey: 'landProdSahaayakSevaTag', descKey: 'landProdSahaayakSevaDesc', ctaKey: 'landProdSahaayakSevaCta', typeKey: 'landProdSahaayakSevaType', href: 'https://github.com/inbharatai/SahaayakSeva', logo: null, icon: Users, internal: false, color: '#059669', tech: ['FastAPI', 'Next.js 14', 'GPT-4o Vision', 'WHO Data'] },
  { name: 'UniAssist.ai', tagKey: 'landProdUniassistTag', descKey: 'landProdUniassistDesc', ctaKey: 'landProdUniassistCta', typeKey: 'landProdUniassistType', href: 'https://www.uniassist.ai', logo: '/uniassist-logo.png', internal: false, color: '#3b82f6', tech: ['React', 'Node.js', 'AI Matching'] },
  { name: 'TestsPrep.in', tagKey: 'landProdTestsprepTag', descKey: 'landProdTestsprepDesc', ctaKey: 'landProdTestsprepCta', typeKey: 'landProdTestsprepType', href: 'https://testsprep.in', logo: '/testsprep-logo.png', internal: false, color: '#f43f5e', tech: ['React', 'AI Analytics', 'Adaptive'] },
  { name: 'UniBot', tagKey: 'landProdUnibotTag', descKey: 'landProdUnibotDesc', ctaKey: 'landProdUnibotCta', typeKey: 'landProdUnibotType', href: '#chatbot', logo: '/unibot-logo.png', internal: false, color: '#25D366', tech: ['WhatsApp API', 'NLP', 'Multilingual'] },
  { name: 'SocialFlow', tagKey: 'landProdSocialFlowTag', descKey: 'landProdSocialFlowDesc', ctaKey: 'landProdSocialFlowCta', typeKey: 'landProdSocialFlowType', href: 'https://github.com/inbharatai/SocialFlow', logo: null, icon: Share2, internal: false, color: '#7C3AED', tech: ['FastAPI', 'Playwright', 'AES-256', '12 Platforms'] },
  { name: 'OpenClawFix', tagKey: 'landProdOpenclawTag', descKey: 'landProdOpenclawDesc', ctaKey: 'landProdOpenclawCta', typeKey: 'landProdOpenclawType', href: 'https://openclawfix.pro', logo: '/openclawfix-logo.png', internal: false, color: '#14b8a6', tech: ['Next.js', 'Docker', 'PayPal', 'Razorpay'] },
] as const;

/* ═══════════════════════════════════════════════════════
   MAIN LANDING COMPONENT
   ═══════════════════════════════════════════════════════ */

const Landing: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isSignedIn, user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('#ecosystem');
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = Boolean(prefersReducedMotion);
  const shellRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Parallax scroll for hero
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 1200], [0, 100]);
  const heroOpacity = useTransform(scrollY, [0, 400, 1000], [1, 1, 0]);

  /* Cursor glow */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || reduceMotion) return;
    const handleMove = (e: MouseEvent) => {
      shell.style.setProperty('--mx', `${e.clientX}px`);
      shell.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, [reduceMotion]);

  /* GSAP scroll-triggered animations */
  useEffect(() => {
    if (reduceMotion) return;
    const ctx = gsap.context(() => {
      // Animate section headers on scroll
      gsap.utils.toArray<HTMLElement>('.gsap-header').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          }
        );
      });
    }, shellRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  const navItems = useMemo(
    () => [
      { href: '#ecosystem', label: t('landNavEcosystem') },
      { href: '#kathakitaab', label: t('landNavKathakitaab') },
      { href: '#phoring', label: t('landNavPhoring') },
      { href: '#products', label: t('landNavProducts') },
      { href: '#why', label: t('landNavWhy') },
      { href: '#mission', label: t('landNavMission') },
      { href: '#contact', label: t('landNavContact') },
    ],
    [t],
  );

  const ALL_PRODUCTS = useMemo(
    () =>
      PRODUCT_DEFS.map((p) => ({
        ...p,
        tagline: t(p.tagKey),
        desc: t(p.descKey),
        cta: t(p.ctaKey),
        type: t(p.typeKey),
        iconComp: (p as any).icon as ProductLogoProps['icon'] | undefined,
      })),
    [t],
  );

  /* Smooth scroll handler */
  useEffect(() => {
    const clickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = anchor.getAttribute('href');
      if (!id) return;
      const section = document.querySelector(id);
      if (!section) return;
      event.preventDefault();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  }, []);

  /* Active section tracking */
  useEffect(() => {
    const sections = navItems
      .map((item) => document.querySelector(item.href))
      .filter((node): node is Element => Boolean(node));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveSection(`#${visible.target.id}`);
        }
      },
      { threshold: [0.2, 0.4, 0.6], rootMargin: '-16% 0px -58% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [navItems]);

  return (
    <div ref={shellRef} className="landing-shell min-h-screen overflow-x-hidden bg-[#030508] text-[#e8eef8]">
      {/* Atmospheric layers */}
      <div className="landing-atmosphere" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />
      {!reduceMotion && <div className="landing-grain" aria-hidden="true" />}
      {!reduceMotion && <div className="cursor-glow" aria-hidden="true" />}

      {/* Floating orbs */}
      {!reduceMotion && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div className="orb-float-a absolute -left-48 top-[15%] h-[600px] w-[600px] rounded-full bg-[#f59f4f]/[0.035] blur-[120px]" />
          <div className="orb-float-b absolute -right-40 top-[35%] h-[500px] w-[500px] rounded-full bg-[#4c8bf5]/[0.04] blur-[100px]" />
          <div className="orb-float-c absolute bottom-[15%] left-[25%] h-[450px] w-[450px] rounded-full bg-[#10b981]/[0.03] blur-[100px]" />
        </div>
      )}

      {/* ═══════════════ NAVIGATION ═══════════════ */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030508]/70 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <div className="logo-badge flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18] shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-all duration-400 group-hover:border-[#f59f4f]/40 group-hover:shadow-[0_12px_36px_rgba(245,159,79,0.15)]">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5.5 w-5.5 object-contain" width={22} height={22} />
            </div>
            <div>
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">INBHARAT</p>
              <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">{t('landBrandSub')}</p>
            </div>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`relative rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold tracking-wide transition-all duration-300 ${
                  activeSection === item.href
                    ? 'text-white'
                    : 'text-[#9aafc6] hover:text-[#b0c0d8]'
                }`}
              >
                {item.label}
                {activeSection === item.href && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-full bg-white/[0.07] border border-white/[0.1]"
                    style={{ zIndex: -1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={i18n.language}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="hidden rounded-full border border-white/10 bg-[#0a0f18] px-3 py-1.5 text-[11px] font-semibold text-[#c0cfe0] outline-none transition-colors hover:border-[#f59f4f]/40 hover:text-white sm:block"
              style={{ colorScheme: 'dark' }}
              aria-label={t('langSwitcher')}
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-[#0a0f18] text-[#c0cfe0]">
                  {lang.native}
                </option>
              ))}
            </select>

            {isSignedIn ? (
              <>
                <div className="hidden rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-[#7a8da8] md:block">
                  {user?.email ?? t('guest')}
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold text-[#c0cfe0] transition-all hover:border-white/20 hover:text-white"
                >
                  {t('signOut')}
                </button>
              </>
            ) : (
              <Link
                to="/app"
                className="rounded-full bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-5 py-1.5 text-[11px] font-bold text-[#0a0c10] shadow-[0_0_20px_rgba(245,159,79,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(245,159,79,0.4)]"
              >
                {t('signIn')}
              </Link>
            )}

            <button
              type="button"
              className="rounded-lg border border-white/8 p-1.5 text-[#b4c8de] transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={t('openMenu')}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-white/[0.06] bg-[#050810]/98 px-5 py-4 backdrop-blur-2xl lg:hidden"
          >
            <div className="grid gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    activeSection === item.href ? 'bg-white/[0.08] text-white' : 'text-[#b4c8de] hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <select
                value={i18n.language}
                onChange={(e) => void i18n.changeLanguage(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-2.5 text-sm font-semibold text-[#c0cfe0] outline-none"
                style={{ colorScheme: 'dark' }}
                aria-label={t('langSwitcher')}
              >
                {supportedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-[#0a0f18] text-[#c0cfe0]">
                    {lang.native}
                  </option>
                ))}
              </select>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ═══════════════ HERO ═══════════════ */}
      <header ref={heroRef} className="relative z-10 overflow-hidden">
        {/* Animated background */}
        <div className="hero-mesh" aria-hidden="true" />
        <AIEntity reduceMotion={reduceMotion} />

        {/* Scanline */}
        <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(245,159,79,0.02) 30%, transparent 60%, rgba(99,102,241,0.015) 80%, transparent 100%)' }}
        />

        {/* Bhagavad Gita Quote — hero top */}
        <HeroGitaQuote />

        <motion.div
          className="relative z-10 mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"
          style={reduceMotion ? {} : { y: heroY, opacity: heroOpacity }}
        >
          <div className="flex flex-col items-center pt-8 pb-12 text-center sm:pt-12 sm:pb-16 md:pt-16 md:pb-20 lg:pt-20 lg:pb-24">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease }}
            >
              <span className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#a8bfd4] backdrop-blur-sm">
                <motion.span
                  animate={reduceMotion ? undefined : { scale: [1, 1.3, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59f4f] shadow-[0_0_8px_rgba(245,159,79,0.5)]"
                />
                {t('landHeroBadge')}
              </span>
            </motion.div>

            {/* Headline */}
            <h1 className="hero-headline mt-8 max-w-5xl text-white sm:mt-10">
              <WordReveal text={t('landHeroTitle1')} delay={0.1} />
              <span className="block mt-1 bg-gradient-to-r from-[#f59f4f] via-[#fde8d0] to-[#6fd3a3] bg-clip-text text-transparent">
                <WordReveal text={t('landHeroTitle2')} delay={0.3} />
              </span>
            </h1>

            {/* Subheadline */}
            <motion.p
              className="mt-6 max-w-2xl text-[15px] leading-relaxed text-[#9aafc6] sm:text-[16px] sm:leading-[1.7]"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.55, ease }}
            >
              {t('landHeroDesc')}
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease }}
            >
              <Link
                to="/app"
                onClick={() => trackEvent('cta_hero_try_app')}
                className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-8 py-3.5 text-sm font-bold text-[#0a0c10] shadow-[0_0_40px_rgba(245,159,79,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(245,159,79,0.45)]"
              >
                {t('landHeroCta1')}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#ecosystem"
                className="group inline-flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-8 py-3.5 text-sm font-semibold text-[#c0cfe0] backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                {t('landHeroCta2')}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </motion.div>

            {/* Metrics */}
            <motion.div
              className="mt-14 grid w-full max-w-xl gap-4 sm:grid-cols-3"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85, ease }}
            >
              {[
                { value: t('landMetric1Val'), label: t('landMetric1Label') },
                { value: t('landMetric2Val'), label: t('landMetric2Label') },
                { value: t('landMetric3Val'), label: t('landMetric3Label') },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-sm"
                >
                  <p className="metric-num bg-gradient-to-br from-white to-[#c8d8ea] bg-clip-text text-transparent">
                    <CountUp target={metric.value} reduceMotion={reduceMotion} />
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#96b0c8]">{metric.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </header>

      {/* Marquee */}
      <div className="relative z-10 border-y border-white/[0.04] bg-[#030508]/80" aria-hidden="true">
        <Marquee />
      </div>

      {/* ═══════════════ ECOSYSTEM ═══════════════ */}
      <Reveal id="ecosystem" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16 items-center">
            {/* Left: Content */}
            <div>
              <p className="eyebrow-line text-[#96b0c8] gsap-header">{t('landEcoLabel')}</p>
              <h2 className="mt-4 text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-[44px] gsap-header">
                {t('landEcoTitle')}
              </h2>

              <div className="mt-10 space-y-4">
                {[
                  { title: t('landEcoLayer1Title'), desc: t('landEcoLayer1Desc'), icon: Brain, color: '#f59f4f' },
                  { title: t('landEcoLayer2Title'), desc: t('landEcoLayer2Desc'), icon: MessageCircle, color: '#6366f1' },
                  { title: t('landEcoLayer3Title'), desc: t('landEcoLayer3Desc'), icon: Target, color: '#10b981' },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    custom={i}
                    variants={itemReveal}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-400 hover:border-white/[0.12] hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08]"
                        style={{ backgroundColor: `${item.color}10` }}
                      >
                        <item.icon size={18} style={{ color: item.color }} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">{item.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-[#9aafc6]">{item.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Platform pulse */}
              <div className="mt-8 grid grid-cols-2 gap-2.5">
                {[
                  t('landEcoPulse1'),
                  t('landEcoPulse2'),
                  t('landEcoPulse3'),
                  t('landEcoPulse4'),
                ].map((line) => (
                  <div key={line} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3 text-[12px] leading-relaxed text-[#a8bfd4]">
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Orbital visualization */}
            <motion.div
              className="flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease }}
            >
              <EcosystemOrbital reduceMotion={reduceMotion} />
            </motion.div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />


      {/* ═══════════════ WHY INBHARAT ═══════════════ */}
      <Reveal id="why" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="text-center mb-14">
            <p className="eyebrow-line justify-center text-[#96b0c8] gsap-header">{t('landNavWhy')}</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold leading-[1.1] text-white sm:text-4xl gsap-header">
              {t('landWhy1Title').split(' ').slice(0, 3).join(' ')}
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              { title: t('landWhy1Title'), text: t('landWhy1Desc'), icon: ShieldCheck, color: '#f59f4f' },
              { title: t('landWhy2Title'), text: t('landWhy2Desc'), icon: Globe, color: '#6366f1' },
              { title: t('landWhy3Title'), text: t('landWhy3Desc'), icon: Sparkles, color: '#10b981' },
            ].map((item, i) => (
              <motion.article
                key={item.title}
                custom={i}
                variants={itemReveal}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="group glow-card rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-7 transition-all duration-400"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08]"
                  style={{ backgroundColor: `${item.color}08` }}
                >
                  <item.icon size={22} style={{ color: item.color }} />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-[1.7] text-[#9aafc6]">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ KATHAKITAAB SPOTLIGHT ═══════════════ */}
      <Reveal id="kathakitaab" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-[#f97316]/20 bg-gradient-to-br from-[#1a0d05] via-[#120a06] to-[#0a0703]">
                        {/* Background battle scene image */}
                        <div
                          className="pointer-events-none absolute inset-0 opacity-15"
                          style={{
                            backgroundImage: 'url(/kathakitaab/scene_battle_lanka.png)',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center right',
                            filter: 'blur(2px)',
                          }}
                        />
            {/* Ambient glows */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 800px 450px at 10% -15%,rgba(249,115,22,0.18),transparent 50%),radial-gradient(ellipse 600px 350px at 95% 110%,rgba(236,72,153,0.12),transparent 50%)' }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'linear-gradient(to right,rgba(249,115,22,0.7) 1px,transparent 1px),linear-gradient(to bottom,rgba(249,115,22,0.7) 1px,transparent 1px)', backgroundSize: '48px 48px' }}
            />

            <div className="relative p-6 sm:p-8 md:p-12 lg:p-14">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
                {/* Left */}
                <div>
                  <div className="mb-6 flex flex-wrap items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#f97316]/30 bg-[#f97316]/10">
                      <BookOpen size={20} className="text-[#fb923c]" />
                    </div>
                    <span className="rounded-full border border-[#f97316]/30 bg-[#f97316]/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#fb923c]">
                      Living Story Engine
                    </span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-1 text-[10px] font-bold text-emerald-400">
                      Live Now
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold leading-[1.06] tracking-tight text-white sm:text-3xl lg:text-[48px] lg:leading-[1.02]">
                    Where Stories
                    <br />
                    <span className="bg-gradient-to-r from-[#fb923c] via-[#fde68a] to-[#f9a8d4] bg-clip-text text-transparent">
                      Come Alive
                    </span>
                  </h2>

                  <p className="mt-5 max-w-xl text-sm leading-[1.7] text-[#9aafc6]">
                    Not a flipbook. An interactive story engine. Click characters, trigger hidden details. Watch figures breathe, move, and react. Experience Indian epics and fables as living books — or cinematic films. Three visual styles: photoreal Bollywood, storybook watercolour, or Pixar animation.
                  </p>

                  {/* Stats */}
                  <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {([
                      { val: 'Ramayana', label: 'Curated · 12 scenes' },
                      { val: '3+', label: 'AI-Generated books' },
                      { val: '2 Modes', label: 'Interactive + Movie' },
                    ] as const).map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        custom={i}
                        variants={itemReveal}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="rounded-xl border border-[#f97316]/15 bg-[#f97316]/[0.05] p-3.5 text-center"
                      >
                        <p className="text-lg font-bold leading-none text-white">{stat.val}</p>
                        <p className="mt-1.5 text-[10px] leading-tight text-[#9aafc6]">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Feature chips */}
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {[
                      'Interactive click-to-explore',
                      'Verb-aware AI animations',
                      'Photoreal + Watercolour + Animation',
                      'Emotional Sarvam narration',
                      'Cinematic movie cuts',
                      'AI-generated story branches',
                    ].map((feat) => (
                      <span
                        key={feat}
                        className="rounded-full border border-[#f97316]/20 bg-[#f97316]/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-[#fb923c]"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>

                  {/* CTAs */}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href="https://kathakitaab-ai.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-6 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(249,115,22,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#fb923c] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)]"
                    >
                      Enter Ramayana
                      <ExternalLink size={14} />
                    </a>
                    <a
                      href="https://kathakitaab-ai.vercel.app/books/ramayana/movie"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/[0.08]"
                    >
                      Watch as Movie
                      <Play size={14} />
                    </a>
                  </div>
                </div>

                {/* Right: Visual showcase */}
                <div className="space-y-5">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, ease }}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a0d05] to-[#0a0703]"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#f97316]/60">Ramayana LiveBook</span>
                      <div className="flex gap-2 text-[10px] font-semibold text-[#9aafc6]">
                        <span className="text-[#fb923c]">Photoreal</span>
                        <span className="text-[#f97316]/40">/</span>
                        <span>Interactive</span>
                      </div>
                    </div>
                    <div className="relative h-48 overflow-hidden bg-black/40">
                      <picture>
                        <source srcSet="/kathakitaab/scene_ayodhya_intro.webp" type="image/webp" />
                        <img
                          src="/kathakitaab/scene_ayodhya_intro.png"
                          alt="Ramayana — opening scene of Ayodhya rendered for the KathaKitaab.AI living storybook"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          width={1536}
                          height={1024}
                        />
                      </picture>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a0d05] via-transparent to-transparent opacity-40" />
                    </div>
                  </motion.div>

                  {/* How it works */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1, ease }}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
                  >
                    <div className="relative h-40 overflow-hidden bg-black/30">
                      <picture>
                        <source srcSet="/kathakitaab/scene_mithila_bow.webp" type="image/webp" />
                        <img
                          src="/kathakitaab/scene_mithila_bow.png"
                          alt="Ramayana — Mithila bow scene rendered for the KathaKitaab.AI living storybook"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          width={1536}
                          height={1024}
                        />
                      </picture>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a0d05] via-transparent to-transparent opacity-50" />
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {[
                        { num: '1', label: 'Hand-painted scenes' },
                        { num: '2', label: 'Click highlighted elements' },
                        { num: '3', label: 'Pick a verb — world reacts' },
                        { num: '4', label: 'Or watch as cinema' },
                      ].map((step) => (
                        <div key={step.num} className="flex items-center gap-3 px-4 py-3 text-[12px]">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f97316]/20 text-[#fb923c] text-[10px] font-bold">{step.num}</span>
                          <span className="text-[#a8bfd4]">{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ PHORING SPOTLIGHT ═══════════════ */}
      <Reveal id="phoring" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-[#10b981]/20 bg-gradient-to-br from-[#041f18] via-[#060f12] to-[#040a10]">
            {/* Ambient glows */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 800px 450px at 10% -15%,rgba(16,185,129,0.16),transparent 50%),radial-gradient(ellipse 600px 350px at 95% 110%,rgba(6,182,212,0.10),transparent 50%)' }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'linear-gradient(to right,rgba(16,185,129,0.7) 1px,transparent 1px),linear-gradient(to bottom,rgba(16,185,129,0.7) 1px,transparent 1px)', backgroundSize: '48px 48px' }}
            />

            <div className="relative p-6 sm:p-8 md:p-12 lg:p-14">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:items-stretch">
                {/* Left */}
                <div>
                  <div className="mb-6 flex flex-wrap items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#10b981]/30 bg-[#10b981]/10">
                      <img src="/phoring-logo.png" alt="Phoring logo" className="h-6 w-6 rounded object-contain" width={24} height={24} loading="lazy" decoding="async" />
                    </div>
                    <span className="rounded-full border border-[#10b981]/30 bg-[#10b981]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#34d399]">
                      {t('landPhoringBadgeOpen')}
                    </span>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/8 px-3 py-1 text-[10px] font-bold text-cyan-400">
                      Scenario Engine
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold leading-[1.06] tracking-tight text-white sm:text-3xl lg:text-[48px] lg:leading-[1.02]">
                    {t('landPhoringTitle')}
                    <br />
                    <span className="bg-gradient-to-r from-[#34d399] via-[#a7f3d0] to-[#d1fae5] bg-clip-text text-transparent">
                      {t('landPhoringTitle2')}
                    </span>
                  </h2>

                  <p className="mt-5 max-w-xl text-sm leading-[1.7] text-[#9aafc6]">
                    {t('landPhoringDesc')}
                  </p>

                  {/* Stats */}
                  <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      { val: '4', label: t('landPhoringStat1') },
                      { val: '3', label: t('landPhoringStat2') },
                      { val: '100%', label: t('landPhoringStat3') },
                      { val: '11', label: t('landPhoringStat4') },
                    ] as const).map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        custom={i}
                        variants={itemReveal}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="rounded-xl border border-[#10b981]/15 bg-[#10b981]/[0.05] p-3.5 text-center"
                      >
                        <p className="text-2xl font-bold leading-none text-white">{stat.val}</p>
                        <p className="mt-1.5 text-[10px] leading-tight text-[#9aafc6]">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Feature chips */}
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {[
                      t('landPhoringFeat1'), t('landPhoringFeat2'), t('landPhoringFeat3'),
                      t('landPhoringFeat4'), t('landPhoringFeat5'), t('landPhoringFeat6'),
                      t('landPhoringFeat7'), t('landPhoringFeat8'), t('landPhoringFeat9'),
                    ].map((feat) => (
                      <span
                        key={feat}
                        className="rounded-full border border-[#10b981]/20 bg-[#10b981]/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-[#6ee7b7]"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>

                  {/* Use cases callout */}
                  <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#06b6d4]/20 bg-[#06b6d4]/[0.06] px-4 py-2.5 text-sm text-[#67e8f9]">
                    <Target size={14} className="flex-shrink-0 text-[#06b6d4]" />
                    {t('landPhoringUseCases')}
                  </div>

                  {/* CTAs */}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href="https://phoring.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#10b981] px-6 py-3 text-sm font-bold text-[#022c22] shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#34d399] hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                    >
                      {t('landPhoringCta1')}
                      <ExternalLink size={14} />
                    </a>
                    <a
                      href="https://phoring.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/[0.08]"
                    >
                      <Sparkles size={14} />
                      {t('landPhoringCta2')}
                    </a>
                    <a
                      href="https://github.com/inbharatai/phoring"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-[#9aafc6] transition-all hover:text-white"
                    >
                      <Github size={14} />
                      {t('landPhoringCta3')}
                    </a>
                  </div>
                </div>

                {/* Right: Scenario Intelligence Graph — live pipeline visualization */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.1, ease }}
                  className="relative overflow-hidden rounded-2xl border border-[#10b981]/15 bg-[#030808] min-h-[400px] lg:min-h-0 lg:self-stretch"
                >
                  <PhoringScenarioGraph reduceMotion={reduceMotion} />
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ PRODUCTS ═══════════════ */}
      <Reveal id="products" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow-line text-[#96b0c8] gsap-header">{t('landProdLabel')}</p>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl gsap-header">{t('landProdTitle')}</h2>
            </div>
            <a
              href="https://github.com/inbharatai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 self-start rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[11px] font-semibold text-[#b4c8de] transition-all hover:border-white/20 hover:text-white sm:self-auto"
            >
              <Github size={14} />
              {t('landProdGithub')}
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ALL_PRODUCTS.map((product, i) => (
              <motion.article
                key={product.name}
                custom={i}
                variants={itemReveal}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.15 }}
                className="glow-card group flex h-full flex-col rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-5 transition-all duration-400 hover:border-white/[0.12]"
              >
                <div className="mb-4 flex h-20 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent">
                  <ProductLogo
                    logo={product.logo as string | null}
                    name={product.name}
                    color={product.color}
                    icon={product.iconComp}
                  />
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <TypeBadge color={product.color}>{product.type}</TypeBadge>
                  <h3 className="text-[14px] font-semibold text-white">{product.name}</h3>
                </div>
                <p className="text-[10px] font-medium text-[#a8bfd4]">{product.tagline}</p>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#9aafc6]">{product.desc}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {product.tech.map((t) => (
                    <span key={t} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium text-[#96b0c8]">{t}</span>
                  ))}
                </div>
                {product.internal ? (
                  <Link
                    to={product.href}
                    className="mt-4 inline-flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] font-semibold text-[#c0cfe0] transition-all hover:border-[#f59f4f]/30 hover:text-white"
                  >
                    {product.cta}
                    <ArrowRight size={14} />
                  </Link>
                ) : (
                  <a
                    href={product.href}
                    target={product.href.startsWith('http') ? '_blank' : undefined}
                    rel={product.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="mt-4 inline-flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] font-semibold text-[#c0cfe0] transition-all hover:border-[#f59f4f]/30 hover:text-white"
                  >
                    {product.cta}
                    <ExternalLink size={14} />
                  </a>
                )}
              </motion.article>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Reverse marquee */}
      <div className="relative z-10 border-y border-white/[0.04] bg-[#030508]/80" aria-hidden="true">
        <Marquee reverse />
      </div>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ MISSION ═══════════════ */}
      <Reveal id="mission" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Mission */}
            <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-7 sm:p-9">
              <p className="eyebrow-line text-[#96b0c8]">{t('landMissionLabel')}</p>
              <h2 className="mt-4 text-2xl font-bold leading-[1.1] text-white sm:text-3xl">
                {t('landMissionTitle')}
              </h2>
              <p className="mt-5 text-sm leading-[1.7] text-[#9aafc6]">
                {t('landMissionDesc')}
              </p>
              <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                {[
                  t('landMissionBullet1'),
                  t('landMissionBullet2'),
                  t('landMissionBullet3'),
                  t('landMissionBullet4'),
                ].map((line) => (
                  <div key={line} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3 text-[13px] text-[#b4c8de]">
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Trust */}
            <div className="rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-[#0a1020]/80 to-[#060810]/80 p-7 sm:p-9">
              <p className="eyebrow-line text-[#96b0c8]">{t('landTrustLabel')}</p>
              <div className="mt-6 space-y-4">
                {[
                  { title: t('landTrust1Title'), desc: t('landTrust1Desc') },
                  { title: t('landTrust2Title'), desc: t('landTrust2Desc') },
                  { title: t('landTrust3Title'), desc: t('landTrust3Desc') },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#9aafc6]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ CHATBOT ═══════════════ */}
      <Reveal id="chatbot" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.06] bg-gradient-to-br from-[#0c1420] via-[#080e18] to-[#050810]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(245,159,79,0.15),transparent_40%),radial-gradient(circle_at_88%_82%,rgba(76,139,245,0.15),transparent_38%)]" />

            <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:p-12">
              <div>
                <p className="eyebrow-line text-[#96b0c8]">{t('landChatLabel')}</p>
                <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                  {t('landChatTitle')}
                </h2>
                <p className="mt-5 max-w-2xl text-sm leading-[1.7] text-[#9aafc6]">
                  {t('landChatDesc')}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/app"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-6 py-3 text-sm font-bold text-[#0a0c10] shadow-[0_0_28px_rgba(245,159,79,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(245,159,79,0.4)]"
                  >
                    {t('landChatCta1')}
                    <ArrowRight size={15} />
                  </Link>
                  <a
                    href={t('unibotWhatsAppUrl')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-sm font-semibold text-[#c0cfe0] transition-all hover:border-white/20 hover:text-white"
                  >
                    {t('landChatCta2')}
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  t('landChatBullet1'),
                  t('landChatBullet2'),
                  t('landChatBullet3'),
                ].map((point, i) => (
                  <motion.div
                    key={point}
                    initial={{ opacity: 0, x: 14 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm leading-relaxed text-[#b4c8de]"
                  >
                    {point}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ FAQ ═══════════════ */}
      <Reveal id="faq" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-10">
          <div className="text-center">
            <p className="eyebrow-line justify-center text-[#96b0c8]">{t('landFaqLabel')}</p>
            <h2 className="mt-4 text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-[44px]">
              {t('landFaqTitle')}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-[1.7] text-[#9aafc6]">
              {t('landFaqDesc')}
            </p>
          </div>

          <div className="mt-12 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <details
                key={n}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.025] px-5 py-4 transition-colors open:border-[#f59f4f]/30 open:bg-white/[0.04]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                  <span className="text-[15px] font-semibold text-white sm:text-[16px]">
                    {t(`faqQ${n}` as const)}
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-[#9aafc6] transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-[14px] leading-[1.7] text-[#b4c8de]">
                  {t(`faqA${n}` as const)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ CONTACT ═══════════════ */}
      <Reveal id="contact" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-8 text-center sm:p-14">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_600px_300px_at_50%_-10%,rgba(245,159,79,0.1),transparent_55%)]" />

            <div className="relative">
              <p className="eyebrow-line justify-center text-[#96b0c8]">{t('landContactLabel')}</p>
              <h2 className="mx-auto mt-4 max-w-3xl text-2xl font-bold leading-[1.1] text-white sm:text-3xl lg:text-4xl">
                {t('landContactTitle')}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-[1.7] text-[#9aafc6]">
                {t('landContactDesc')}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/app"
                  onClick={() => trackEvent('cta_contact_try_app')}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-8 py-3.5 text-sm font-bold text-[#0a0c10] shadow-[0_0_40px_rgba(245,159,79,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(245,159,79,0.45)]"
                >
                  {t('landContactCta1')}
                  <ArrowRight size={16} />
                </Link>
                <a
                  href="https://github.com/inbharatai"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('cta_contact_github')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-8 py-3.5 text-sm font-semibold text-[#c0cfe0] transition-all hover:border-white/20 hover:text-white"
                >
                  {t('landContactCta2')}
                  <Github size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ═══════════════ STATUS BAR ═══════════════ */}
      <div className="relative z-10 border-y border-white/[0.05] bg-[#030508]/90 py-3.5">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-7 gap-y-2 px-5 text-[11px] sm:px-6 lg:px-10">
          <span className="inline-flex items-center gap-2 font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 status-pulse" />
            {t('landStatusOperational')}
          </span>
          <span className="text-[#7a9ab8]">22 Languages</span>
          <span className="text-[#7a9ab8]">11 Products</span>
        </div>
      </div>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 sm:px-6 lg:px-10">
          <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" width={20} height={20} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aafc6]">InBharat.ai</p>
            </div>
            <p className="text-[11px] text-[#7a9ab8] sm:text-center">{t('landFooterTagline')}</p>
            <div className="flex items-center gap-2 text-[#96b0c8]">
              <a
                href={SITE.social.instagram}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on Instagram"
                onClick={() => trackEvent('footer_social_instagram')}
                className="rounded-full p-2 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Instagram size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.linkedin}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="Reeturaj Goswami on LinkedIn"
                onClick={() => trackEvent('footer_social_linkedin')}
                className="rounded-full p-2 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Linkedin size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.twitter}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on X"
                onClick={() => trackEvent('footer_social_x')}
                className="rounded-full p-2 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Twitter size={16} aria-hidden="true" />
              </a>
              <a
                href={SITE.social.github}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label="InBharat on GitHub"
                onClick={() => trackEvent('footer_social_github')}
                className="rounded-full p-2 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Github size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.04] pt-5 text-[11px] text-[#7a9ab8]">
            <Link to="/about" className="transition-colors hover:text-white">{t('navAbout')}</Link>
            <Link to="/contact" className="transition-colors hover:text-white">{t('navContact')}</Link>
            <Link to="/privacy" className="transition-colors hover:text-white">{t('navPrivacy')}</Link>
            <Link to="/terms" className="transition-colors hover:text-white">{t('navTerms')}</Link>
            <Link to="/app" className="transition-colors hover:text-white">{t('landFooterInbharat')}</Link>
            <span className="text-[#5a738f]">©  InBharat AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
