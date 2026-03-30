import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import {
  ArrowRight,
  Brain,
  Code2,
  Download,
  ExternalLink,
  Github,
  Globe,
  Menu,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Share2,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react';

/* ─── Animation variants ─── */
const revealSection = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

const itemFade = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

type SectionProps = { id?: string; className?: string; children: React.ReactNode };

const Reveal: React.FC<SectionProps> = ({ id, className = '', children }) => (
  <motion.section
    id={id}
    className={className}
    variants={revealSection}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.05 }}
  >
    {children}
  </motion.section>
);

/* ─── Ecosystem orbital visualization ─── */
const EcosystemOrbital: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const products = [
    { label: 'InBharat AI',  angle: 0,   color: '#f59f4f', radius: 38 },
    { label: 'CodeIn.pro',   angle: 33,  color: '#6366f1', radius: 38 },
    { label: 'Agent Arcade', angle: 65,  color: '#4C8BF5', radius: 38 },
    { label: 'Phoring',      angle: 98,  color: '#10b981', radius: 38 },
    { label: 'Sahaayak AI',  angle: 131, color: '#ff9933', radius: 38 },
    { label: 'SahaayakSeva', angle: 164, color: '#059669', radius: 38 },
    { label: 'UniAssist',    angle: 196, color: '#3b82f6', radius: 38 },
    { label: 'TestsPrep',    angle: 229, color: '#f43f5e', radius: 38 },
    { label: 'UniBot',       angle: 262, color: '#25D366', radius: 38 },
    { label: 'SocialFlow',   angle: 295, color: '#7C3AED', radius: 38 },
    { label: 'OpenClawFix',  angle: 327, color: '#14b8a6', radius: 38 },
  ];

  return (
    <div className="relative mx-auto h-[380px] w-[380px] sm:h-[440px] sm:w-[440px]">
      {/* Orbital rings */}
      {[1, 0.72, 0.44].map((scale, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border"
          style={{
            borderColor: `rgba(245,159,79,${0.12 - i * 0.03})`,
            transform: `scale(${scale})`,
            top: `${(1 - scale) * 50}%`,
            left: `${(1 - scale) * 50}%`,
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
          }}
          animate={reduceMotion ? undefined : { rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{ duration: 40 + i * 20, ease: 'linear', repeat: Infinity }}
        />
      ))}

      {/* Center core */}
      <div className="absolute left-1/2 top-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#131d2d] shadow-[0_0_60px_rgba(245,159,79,0.25),0_0_120px_rgba(71,125,255,0.15)]">
        <motion.img
          src="/inbharat-logo.svg"
          alt="InBharat logo"
          className="h-12 w-12 object-contain"
          animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Pulsing ring around core */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f59f4f]/30"
        animate={reduceMotion ? undefined : { scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 96, height: 96 }}
      />

      {/* Product nodes */}
      {products.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const x = 50 + p.radius * Math.cos(rad);
        const y = 50 + p.radius * Math.sin(rad);

        return (
          <React.Fragment key={p.label}>
            {/* Connection line */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100">
              <motion.line
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke={p.color}
                strokeWidth="0.3"
                strokeDasharray="2 2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ duration: 0.8, delay: i * 0.12 }}
              />
            </svg>

            {/* Node */}
            <motion.div
              className="absolute z-10 rounded-xl border border-white/20 bg-[#0f1827]/90 px-2.5 py-1.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -4, 0] }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.1, y: { duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut' } }}
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.label}
            </motion.div>

            {/* Signal pulse from center to node */}
            {!reduceMotion && (
              <motion.div
                className="absolute h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}`, left: '50%', top: '50%' }}
                animate={{ left: [`50%`, `${x}%`], top: [`50%`, `${y}%`], opacity: [0, 1, 0] }}
                transition={{ duration: 2, delay: i * 0.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 4 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ─── Glowing badge for product type ─── */
const TypeBadge: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
    style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
  >
    {children}
  </span>
);

/* ─── Equal-size logo cell for every product card ─── */
type ProductLogoProps = {
  logo: string | null;
  name: string;
  color: string;
  icon?: React.FC<{ size?: number; color?: string; className?: string }>;
};
const ProductLogo: React.FC<ProductLogoProps> = ({ logo, name, color, icon: Icon }) => {
  if (logo) {
    return (
      <img
        src={logo}
        alt={`${name} logo`}
        className="h-12 w-12 object-contain opacity-95"
      />
    );
  }
  if (Icon) {
    return <Icon size={48} color={color} className="opacity-90" />;
  }
  const initials = name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white select-none"
      style={{ backgroundColor: `${color}28`, border: `1.5px solid ${color}50` }}
    >
      {initials}
    </div>
  );
};

/* ─── All products in the InBharat ecosystem ─── */
const PRODUCT_DEFS = [
  { name: 'InBharat AI',   tagKey: 'landProdInbharatTag',     descKey: 'landProdInbharatDesc',     ctaKey: 'landProdInbharatCta',     typeKey: 'landProdInbharatType',     href: '/app',                                               logo: '/inbharat-logo.svg',   internal: true,  color: '#f59f4f', tech: ['React 19', 'TypeScript', 'Vercel', 'OpenAI'] },
  { name: 'CodeIn.pro',    tagKey: 'landProdCodeinTag',       descKey: 'landProdCodeinDesc',       ctaKey: 'landProdCodeinCta',       typeKey: 'landProdCodeinType',       href: 'https://codein.pro',                                 logo: '/codein-logo.svg',     internal: false, color: '#6366f1', tech: ['Electron', 'llama.cpp', '60+ LLMs', '22 Languages'] },
  { name: 'Agent Arcade',  tagKey: 'landProdArcadeTag',       descKey: 'landProdArcadeDesc',       ctaKey: 'landProdArcadeCta',       typeKey: 'landProdArcadeType',       href: 'https://github.com/inbharatai/agent-arcade-gateway', logo: null,                   internal: false, color: '#4C8BF5', tech: ['Bun', 'Next.js', 'Socket.IO', 'SQLite'] },
  { name: 'Phoring',       tagKey: 'landProdPhoringTag',      descKey: 'landProdPhoringDesc',      ctaKey: 'landProdPhoringCta',      typeKey: 'landProdPhoringType',      href: 'https://phoring.onrender.com',                       logo: '/phoring-logo.png',    internal: false, color: '#10b981', tech: ['Python', 'Vue 3', 'OASIS', 'Zep Cloud'] },
  { name: 'Sahaayak AI',   tagKey: 'landProdSahaayakTag',     descKey: 'landProdSahaayakDesc',     ctaKey: 'landProdSahaayakCta',     typeKey: 'landProdSahaayakType',     href: 'https://github.com/inbharatai/sahaayak-ai',          logo: null,     icon: Monitor,   internal: false, color: '#ff9933', tech: ['FastAPI', 'Next.js', 'Whisper', 'Vosk'] },
  { name: 'SahaayakSeva',  tagKey: 'landProdSahaayakSevaTag', descKey: 'landProdSahaayakSevaDesc', ctaKey: 'landProdSahaayakSevaCta', typeKey: 'landProdSahaayakSevaType', href: 'https://github.com/inbharatai/SahaayakSeva',         logo: null,     icon: Users,     internal: false, color: '#059669', tech: ['FastAPI', 'Next.js 14', 'GPT-4o Vision', 'WHO Data'] },
  { name: 'UniAssist.ai',  tagKey: 'landProdUniassistTag',    descKey: 'landProdUniassistDesc',    ctaKey: 'landProdUniassistCta',    typeKey: 'landProdUniassistType',    href: 'https://www.uniassist.ai',                           logo: '/uniassist-logo.png',  internal: false, color: '#3b82f6', tech: ['React', 'Node.js', 'AI Matching'] },
  { name: 'TestsPrep.in',  tagKey: 'landProdTestsprepTag',    descKey: 'landProdTestsprepDesc',    ctaKey: 'landProdTestsprepCta',    typeKey: 'landProdTestsprepType',    href: 'https://testsprep.in',                               logo: '/testsprep-logo.png',  internal: false, color: '#f43f5e', tech: ['React', 'AI Analytics', 'Adaptive'] },
  { name: 'UniBot',        tagKey: 'landProdUnibotTag',       descKey: 'landProdUnibotDesc',       ctaKey: 'landProdUnibotCta',       typeKey: 'landProdUnibotType',       href: '#chatbot',                                           logo: '/unibot-logo.png',     internal: false, color: '#25D366', tech: ['WhatsApp API', 'NLP', 'Multilingual'] },
  { name: 'SocialFlow',    tagKey: 'landProdSocialFlowTag',   descKey: 'landProdSocialFlowDesc',   ctaKey: 'landProdSocialFlowCta',   typeKey: 'landProdSocialFlowType',   href: 'https://github.com/inbharatai/SocialFlow',           logo: null,     icon: Share2,    internal: false, color: '#7C3AED', tech: ['FastAPI', 'Playwright', 'AES-256', '12 Platforms'] },
  { name: 'OpenClawFix',   tagKey: 'landProdOpenclawTag',     descKey: 'landProdOpenclawDesc',     ctaKey: 'landProdOpenclawCta',     typeKey: 'landProdOpenclawType',     href: 'https://openclawfix.pro',                            logo: '/openclawfix-logo.png',internal: false, color: '#14b8a6', tech: ['Next.js', 'Docker', 'PayPal', 'Razorpay'] },
] as const;

const Landing: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isSignedIn, user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('#ecosystem');
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = Boolean(prefersReducedMotion);

  const navItems = useMemo(
    () => [
      { href: '#ecosystem', label: t('landNavEcosystem') },
      { href: '#codein',    label: t('landNavCodein') },
      { href: '#products',  label: t('landNavProducts') },
      { href: '#why',       label: t('landNavWhy') },
      { href: '#mission',   label: t('landNavMission') },
      { href: '#contact',   label: t('landNavContact') },
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
    <div className="landing-shell min-h-screen overflow-x-hidden bg-[#05060a] text-[#e8eef8]">
      <div className="landing-atmosphere" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#06080d]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <div className="logo-badge flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-[#0f1520] shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-all duration-300 group-hover:border-[#f59f4f]/45 group-hover:shadow-[0_18px_45px_rgba(245,159,79,0.22)]">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-6 w-6 object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-white">INBHARAT</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#95a9cf]">{t('landBrandSub')}</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-300 ${
                  activeSection === item.href
                    ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'
                    : 'text-[#9fb2d8] hover:bg-white/8 hover:text-white'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={i18n.language}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="hidden rounded-full border border-white/15 bg-[#101621] px-3 py-1.5 text-xs font-semibold text-[#d5dff2] outline-none transition-colors hover:border-[#f59f4f]/55 sm:block"
              aria-label={t('langSwitcher')}
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native}
                </option>
              ))}
            </select>

            {isSignedIn ? (
              <>
                <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#c9d5ed] md:block">
                  {user?.email ?? t('guest')}
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-full border border-white/15 bg-[#121929] px-4 py-1.5 text-xs font-semibold text-[#dae3f4] transition-all hover:border-white/30 hover:text-white"
                >
                  {t('signOut')}
                </button>
              </>
            ) : (
              <Link
                to="/app"
                className="rounded-full border border-[#f59f4f]/80 bg-[#f59f4f] px-4 py-1.5 text-xs font-bold text-[#13161d] transition-all hover:-translate-y-0.5 hover:bg-[#ffb36f]"
              >
                {t('signIn')}
              </Link>
            )}

            <button
              type="button"
              className="rounded-lg border border-white/10 p-1.5 text-[#dce6f7] transition-colors hover:bg-white/8 lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={t('openMenu')}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#06080d]/96 px-4 py-3 lg:hidden">
            <div className="grid gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                    activeSection === item.href ? 'bg-white/12 text-white' : 'text-[#c9d6ee] hover:bg-white/8 hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </nav>

      <header className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-4 pb-20 pt-14 sm:px-6 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b5c5e2]">
            <Sparkles size={14} className="text-[#f59f4f]" />
            {t('landHeroBadge')}
          </p>

          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.02] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[72px] lg:leading-[0.95]">
            {t('landHeroTitle1')}
            <span className="block bg-[linear-gradient(92deg,#f59f4f,#f8fbff,#70d3a7)] bg-clip-text text-transparent">
              {t('landHeroTitle2')}
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#a8b9d8] sm:text-base">
            {t('landHeroDesc')}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/app"
              className="group inline-flex items-center gap-2 rounded-full border border-[#f59f4f]/80 bg-[#f59f4f] px-6 py-3 text-sm font-bold text-[#12141a] transition-all hover:-translate-y-0.5 hover:bg-[#ffb56f]"
            >
              {t('landHeroCta1')}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#ecosystem"
              className="group inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/6 px-6 py-3 text-sm font-semibold text-[#e1e9f8] transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              {t('landHeroCta2')}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { value: t('landMetric1Val'), label: t('landMetric1Label') },
              { value: t('landMetric2Val'), label: t('landMetric2Label') },
              { value: t('landMetric3Val'), label: t('landMetric3Label') },
            ].map((metric) => (
              <div
                key={metric.label}
                className="premium-card rounded-2xl border border-white/10 bg-[#0f151f]/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <p className="text-2xl font-semibold text-white">{metric.value}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8ea4c9]">{metric.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.08, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <EcosystemOrbital reduceMotion={reduceMotion} />
        </motion.div>
      </header>

      <div className="landing-seam" aria-hidden="true" />

      <Reveal id="ecosystem" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8fa3c8]">{t('landEcoLabel')}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
              {t('landEcoTitle')}
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.16fr_0.84fr]">
            <div className="rounded-[28px] border border-white/10 bg-[#0d121c]/82 p-6 sm:p-8">
              <div className="space-y-5">
                {[
                  {
                    title: t('landEcoLayer1Title'),
                    desc: t('landEcoLayer1Desc'),
                    icon: Brain,
                  },
                  {
                    title: t('landEcoLayer2Title'),
                    desc: t('landEcoLayer2Desc'),
                    icon: MessageCircle,
                  },
                  {
                    title: t('landEcoLayer3Title'),
                    desc: t('landEcoLayer3Desc'),
                    icon: Target,
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    custom={i}
                    variants={itemFade}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.24 }}
                    className="group rounded-2xl border border-white/12 bg-white/5 p-5 transition-all duration-300 hover:border-[#f59f4f]/50 hover:bg-white/8"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-[#111b2c] text-[#f59f4f]">
                        <item.icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-[#afc0de]">{item.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(175deg,#10192b,#0b111a)] p-6 sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8ea5cd]">{t('landEcoPulseLabel')}</p>
              <div className="mt-5 space-y-4">
                {[
                  t('landEcoPulse1'),
                  t('landEcoPulse2'),
                  t('landEcoPulse3'),
                  t('landEcoPulse4'),
                ].map((line) => (
                  <div key={line} className="rounded-xl border border-white/12 bg-white/5 p-3 text-sm leading-relaxed text-[#cad8ef]">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      <Reveal id="why" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                title: t('landWhy1Title'),
                text: t('landWhy1Desc'),
                icon: ShieldCheck,
              },
              {
                title: t('landWhy2Title'),
                text: t('landWhy2Desc'),
                icon: Globe,
              },
              {
                title: t('landWhy3Title'),
                text: t('landWhy3Desc'),
                icon: Sparkles,
              },
            ].map((item, i) => (
              <motion.article
                key={item.title}
                custom={i}
                variants={itemFade}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                whileHover={reduceMotion ? undefined : { y: -5 }}
                className="premium-card rounded-[25px] border border-white/10 bg-[#0e141f]/84 p-6 transition-all duration-300 hover:border-[#f59f4f]/35"
              >
                <item.icon size={20} className="text-[#f59f4f]" />
                <h3 className="mt-5 text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#b0c1df]">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ CODEIN SPOTLIGHT ═══════════════ */}
      <Reveal id="codein" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-[#818cf8]">
            {t('landCodeinLabel')}
          </p>

          <div className="relative overflow-hidden rounded-[32px] border border-[#6366f1]/35 bg-[linear-gradient(148deg,#0d0e20_0%,#0a0c1e_50%,#07090f_100%)]">
            {/* Ambient glows */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 900px 500px at 15% -10%,rgba(99,102,241,0.22),transparent 55%),radial-gradient(ellipse 700px 400px at 95% 115%,rgba(139,92,246,0.18),transparent 55%)' }}
            />
            {/* Grid texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.055]"
              style={{ backgroundImage: 'linear-gradient(to right,rgba(99,102,241,0.7) 1px,transparent 1px),linear-gradient(to bottom,rgba(99,102,241,0.7) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <div className="relative p-8 sm:p-12">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">

                {/* ── Left column ── */}
                <div>
                  {/* Logo + badges row */}
                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#6366f1]/40 bg-[#6366f1]/15">
                      <img src="/codein-logo.svg" alt="CodeIn logo" className="h-7 w-7 object-contain" />
                    </div>
                    <span className="rounded-full border border-[#6366f1]/40 bg-[#6366f1]/12 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#818cf8]">
                      {t('landCodeinBadgeOpen')}
                    </span>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400">
                      v1.0.3-beta
                    </span>
                    <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#9fb4d4]">
                      Apache-2.0
                    </span>
                  </div>

                  {/* Headline */}
                  <h2 className="text-4xl font-bold leading-[1.04] tracking-tight text-white sm:text-[46px] lg:text-[52px]">
                    {t('landCodeinTitle')}
                    <br />
                    <span className="bg-[linear-gradient(88deg,#818cf8_0%,#c4b5fd_55%,#e0e7ff_100%)] bg-clip-text text-transparent">
                      {t('landCodeinTitle2')}
                    </span>
                  </h2>

                  <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#a5b4cb]">
                    {t('landCodeinDesc')}
                  </p>

                  {/* Stats grid */}
                  <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      { val: '22',  label: t('landCodeinStat1') },
                      { val: '60+', label: t('landCodeinStat2') },
                      { val: '46',  label: t('landCodeinStat3') },
                      { val: '$0',  label: t('landCodeinStat4') },
                    ] as const).map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        custom={i}
                        variants={itemFade}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="rounded-2xl border border-[#6366f1]/20 bg-[#6366f1]/8 p-4 text-center"
                      >
                        <p className="text-[28px] font-bold leading-none text-white">{stat.val}</p>
                        <p className="mt-1.5 text-[11px] leading-tight text-[#8ea4c9]">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Feature chips */}
                  <div className="mt-6 flex flex-wrap gap-2">
                    {[
                      t('landCodeinFeat1'), t('landCodeinFeat2'), t('landCodeinFeat3'),
                      t('landCodeinFeat4'), t('landCodeinFeat5'), t('landCodeinFeat6'),
                      t('landCodeinFeat7'), t('landCodeinFeat8'), t('landCodeinFeat9'),
                    ].map((feat, i) => (
                      <motion.span
                        key={feat}
                        custom={i}
                        variants={itemFade}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="rounded-full border border-[#6366f1]/28 bg-[#6366f1]/8 px-3 py-1 text-[11px] font-semibold text-[#a5b4fc]"
                      >
                        {feat}
                      </motion.span>
                    ))}
                  </div>

                  {/* Savings callout */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-[#f59f4f]/30 bg-[#f59f4f]/8 px-4 py-3 text-sm text-[#fcd084]"
                  >
                    <Zap size={14} className="flex-shrink-0 text-[#f59f4f]" />
                    {t('landCodeinVs')}
                  </motion.div>

                  {/* CTAs */}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href="https://codein.pro"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[#6366f1] bg-[#6366f1] px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#818cf8]"
                    >
                      {t('landCodeinCta1')}
                      <ExternalLink size={15} />
                    </a>
                    <a
                      href="https://github.com/inbharat-ai/codein.pro/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition-all hover:border-white/35 hover:bg-white/12"
                    >
                      <Download size={15} />
                      {t('landCodeinCta2')}
                    </a>
                    <a
                      href="https://github.com/inbharat-ai/codein.pro"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-[#9fb4d4] transition-all hover:text-white"
                    >
                      <Github size={15} />
                      {t('landCodeinCta3')}
                    </a>
                  </div>
                </div>

                {/* ── Right column: editor mockup + comparison table ── */}
                <div className="space-y-5">
                  {/* Code editor mockup */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-[#07090e] font-mono text-[13px]"
                  >
                    {/* Window chrome */}
                    <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.03] px-4 py-2.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                      <span className="ml-auto text-[11px] text-[#455060]">project/main.py — CodeIn</span>
                    </div>
                    <div className="space-y-1.5 p-5">
                      <p className="text-[#3d5070]"># {t('landCodeinEditorComment')}</p>
                      <p>
                        <span className="text-[#818cf8]">from</span>{' '}
                        <span className="text-[#10b981]">codein</span>{' '}
                        <span className="text-[#818cf8]">import</span>{' '}
                        <span className="text-white">Agent</span>
                      </p>
                      <p className="mt-2">
                        <span className="text-[#f59f4f]">agent</span>
                        {' = '}
                        <span className="text-white">Agent</span>
                        {'(lang='}
                        <span className="text-[#22d3ee]">"hi"</span>
                        {')'}
                      </p>
                      <p>
                        <span className="text-[#f59f4f]">agent</span>
                        {'.build('}
                        <span className="text-[#22d3ee]">"dashboard with auth"</span>
                        {')'}
                      </p>
                      <motion.div
                        className="mt-3 rounded-xl border border-[#6366f1]/30 bg-[#6366f1]/15 px-4 py-3 text-[#a5b4fc]"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <Code2 size={13} className="mr-1.5 inline text-[#6366f1]" />
                        {t('landCodeinEditorOutput')}
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Comparison table */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-white/4"
                  >
                    <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[#8ea4c9]">
                        {t('landCodeinVsTitle')}
                      </p>
                      <div className="flex gap-5 text-[10px] font-bold">
                        <span className="text-[#818cf8]">{t('landCodeinVsCodeinCol')}</span>
                        <span className="text-[#596780]">{t('landCodeinVsOthersCol')}</span>
                      </div>
                    </div>
                    <div className="divide-y divide-white/6">
                      {[
                        { f: t('landCodeinCompRow1'), ci: '✓', o: '✗' },
                        { f: t('landCodeinCompRow2'), ci: '✓', o: '✗' },
                        { f: t('landCodeinCompRow3'), ci: '✓', o: '✗' },
                        { f: t('landCodeinCompRow4'), ci: '✓', o: '✗' },
                        { f: t('landCodeinCompRow5'), ci: '✓', o: '✗' },
                        { f: t('landCodeinCompRow6'), ci: t('landCodeinCompRow6Ci'), o: t('landCodeinCompRow6Others') },
                      ].map((row) => (
                        <div key={row.f} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                          <span className="text-[#b0c0db]">{row.f}</span>
                          <div className="flex gap-8">
                            <span className="font-bold text-emerald-400">{row.ci}</span>
                            <span className={`font-bold ${row.o === '✗' ? 'text-[#485870]' : 'text-[#f59f4f]'}`}>{row.o}</span>
                          </div>
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

      <Reveal id="products" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8fa3c8]">{t('landProdLabel')}</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">{t('landProdTitle')}</h2>
            </div>
            <a
              href="https://github.com/inbharatai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-semibold text-[#d5e0f4] transition-all hover:border-white/30 hover:text-white sm:self-auto"
            >
              <Github size={14} />
              {t('landProdGithub')}
            </a>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ALL_PRODUCTS.map((product, i) => {
              return (
                <motion.article
                  key={product.name}
                  custom={i}
                  variants={itemFade}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                  className="premium-card group flex h-full flex-col rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,27,42,0.9),rgba(10,15,24,0.92))] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#f59f4f]/38"
                >
                  <div className="mb-4 flex h-24 items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-[radial-gradient(circle_at_18%_20%,rgba(245,159,79,0.24),transparent_52%),radial-gradient(circle_at_82%_84%,rgba(111,211,163,0.16),transparent_56%),#0f1827]">
                    <ProductLogo
                      logo={product.logo as string | null}
                      name={product.name}
                      color={product.color}
                      icon={product.iconComp}
                    />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <TypeBadge color={product.color}>{product.type}</TypeBadge>
                    <h3 className="text-base font-semibold text-white">{product.name}</h3>
                  </div>
                  <p className="text-[11px] font-medium text-[#c5d3ea]">{product.tagline}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#afc0dd]">{product.desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {product.tech.map((t) => (
                      <span key={t} className="rounded-md bg-white/8 px-2 py-0.5 text-[10px] font-medium text-[#9fb4d4]">{t}</span>
                    ))}
                  </div>

                  {product.internal ? (
                    <Link
                      to={product.href}
                      className="mt-4 inline-flex items-center justify-between rounded-xl border border-white/16 bg-white/6 px-4 py-2.5 text-sm font-semibold text-[#dbe6f7] transition-all hover:border-[#f59f4f]/48 hover:text-white"
                    >
                      {product.cta}
                      <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <a
                      href={product.href}
                      target={product.href.startsWith('http') ? '_blank' : undefined}
                      rel={product.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="mt-4 inline-flex items-center justify-between rounded-xl border border-white/16 bg-white/6 px-4 py-2.5 text-sm font-semibold text-[#dbe6f7] transition-all hover:border-[#f59f4f]/48 hover:text-white"
                    >
                      {product.cta}
                      <ExternalLink size={15} />
                    </a>
                  )}
                </motion.article>
              );
            })}
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      <Reveal id="mission" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr]">
            <div className="rounded-[28px] border border-white/10 bg-[#0b101a]/88 p-7 sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8fa5cb]">{t('landMissionLabel')}</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                {t('landMissionTitle')}
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-[#afc0dd] sm:text-base">
                {t('landMissionDesc')}
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  t('landMissionBullet1'),
                  t('landMissionBullet2'),
                  t('landMissionBullet3'),
                  t('landMissionBullet4'),
                ].map((line) => (
                  <div key={line} className="rounded-xl border border-white/12 bg-white/5 px-3.5 py-3 text-sm text-[#d2def4]">
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#141f31,#0d131d)] p-7 sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8fa5cb]">{t('landTrustLabel')}</p>
              <div className="mt-5 space-y-4">
                {[
                  { title: t('landTrust1Title'), desc: t('landTrust1Desc') },
                  { title: t('landTrust2Title'), desc: t('landTrust2Desc') },
                  { title: t('landTrust3Title'), desc: t('landTrust3Desc') },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-white/12 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#afc0dd]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />

      <Reveal id="chatbot" className="relative z-10 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(126deg,#121b2d,#0d141f)] p-7 sm:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(245,159,79,0.22),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(95,145,255,0.24),transparent_42%)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1.18fr_0.82fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#97acd1]">{t('landChatLabel')}</p>
                <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                  {t('landChatTitle')}
                </h2>
                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#b9c9e4] sm:text-base">
                  {t('landChatDesc')}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/app"
                    className="inline-flex items-center gap-2 rounded-full border border-[#f59f4f]/82 bg-[#f59f4f] px-6 py-3 text-sm font-bold text-[#13161b] transition-all hover:-translate-y-0.5 hover:bg-[#ffb770]"
                  >
                    {t('landChatCta1')}
                    <ArrowRight size={16} />
                  </Link>
                  <a
                    href={t('unibotWhatsAppUrl')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/6 px-6 py-3 text-sm font-semibold text-[#dce6f8] transition-all hover:border-white/30 hover:text-white"
                  >
                    {t('landChatCta2')}
                    <ExternalLink size={15} />
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
                    viewport={{ once: true, amount: 0.24 }}
                    transition={{ duration: 0.48, delay: i * 0.08 }}
                    className="rounded-xl border border-white/12 bg-[#111a2b]/88 p-4 text-sm leading-relaxed text-[#d2def4]"
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

      <Reveal id="contact" className="relative z-10 pb-20 pt-20 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="rounded-[32px] border border-white/10 bg-[#0a0f18]/90 p-8 text-center sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8ea3c8]">{t('landContactLabel')}</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
              {t('landContactTitle')}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-[#b2c4e0] sm:text-base">
              {t('landContactDesc')}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-full border border-[#f59f4f]/82 bg-[#f59f4f] px-7 py-3.5 text-sm font-bold text-[#13161b] transition-all hover:-translate-y-0.5 hover:bg-[#ffb770]"
              >
                {t('landContactCta1')}
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://github.com/inbharatai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/6 px-7 py-3.5 text-sm font-semibold text-[#dce7f8] transition-all hover:border-white/30 hover:text-white"
              >
                {t('landContactCta2')}
                <Github size={16} />
              </a>
            </div>
          </div>
        </div>
      </Reveal>

      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8d5ee]">InBharat.ai</p>
          </div>
          <p className="text-xs text-[#8ea3c8]">{t('landFooterTagline')}</p>
          <div className="flex items-center gap-4 text-xs text-[#9bb1d6]">
            <a href="https://github.com/inbharatai" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
              {t('landFooterGithub')}
            </a>
            <Link to="/app" className="transition-colors hover:text-white">
              {t('landFooterInbharat')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;