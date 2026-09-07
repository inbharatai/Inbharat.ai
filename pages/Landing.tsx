import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { FieldMedia } from '../components/landing/FieldMedia';
import { SystemMap, JakDiagram } from '../components/landing/SystemMap';
import { DeepTechField } from '../components/landing/DeepTechField';
import {
  ArrowRight,
  BookOpen,
  Brain,
  ChevronDown,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Menu,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Share2,
  Shield,
  Sparkles,
  Target,
  Twitter,
  Users,
  X,
} from 'lucide-react';
import { CredentialRail, CredentialTrustList } from '../components/Credentials';
import { SITE } from '../seo.config';
import { trackEvent } from '../lib/analytics';

// Landing animation is opacity-only; reduced-motion content is visible immediately.
const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
const itemReveal = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.45 } } };
type SectionProps = { id?: string; className?: string; children: React.ReactNode };
const Reveal: React.FC<SectionProps> = ({ id, className = '', children }) => {
  const reduced = useReducedMotion();
  return <motion.section id={id} className={className} initial={reduced ? false : { opacity: 0 }}
    whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.06 }} transition={{ duration: reduced ? 0 : 0.45 }}>
    {children}
  </motion.section>;
};

type ProductLogoProps = {
  logo: string | null;
  name: string;
  color: string;
  size?: number;
  icon?: React.FC<{ size?: number; color?: string; className?: string }>;
};

const ProductLogo: React.FC<ProductLogoProps> = ({ logo, name, color, size = 40, icon: Icon }) => {
  if (logo) {
    return <img src={logo} alt={`${name} logo`} style={{ height: size, width: size }} className="object-contain opacity-95" width={size} height={size} loading="lazy" decoding="async" />;
  }
  if (Icon) {
    return <Icon size={size} color={color} className="opacity-90" />;
  }
  const initials = name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-xl font-bold text-white select-none"
      style={{ height: size, width: size, backgroundColor: `${color}20`, border: `1.5px solid ${color}40`, fontSize: size >= 32 ? 14 : 11 }}
    >
      {initials}
    </div>
  );
};

const TypeBadge: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
    style={{ backgroundColor: `${color}12`, color, border: `1px solid ${color}25` }}
  >
    {children}
  </span>
);

type ProductBucket = 'core' | 'agentOps' | 'growth' | 'consumer' | 'eduCareer' | 'health';

const PRODUCT_DEFS = [
  // ── InBharat Core AI ──
  { name: 'InBharat AI', bucket: 'core', tagKey: 'landProdInbharatTag', descKey: 'landProdInbharatDesc', ctaKey: 'landProdInbharatCta', typeKey: 'landProdInbharatType', href: '/app', logo: '/inbharat-logo.svg', internal: true, color: '#f59f4f', tech: ['React 19', 'TypeScript', 'Vercel', 'OpenAI'] },
  // ── Agent Ops & Trust ──
  { name: 'JAK Swarm', bucket: 'agentOps', tagKey: 'landProdJakTag', descKey: 'landProdJakDesc', ctaKey: 'landProdJakCta', typeKey: 'landProdJakType', href: 'https://github.com/inbharatai/jak-swarm', logo: null, icon: ShieldCheck, internal: false, color: '#ef4444', tech: ['Evidence Graph', 'Drift Detection', 'JAK Shield', 'Audit Trail'] },
  { name: 'JAK Shield', bucket: 'agentOps', tagKey: 'landProdJakshieldTag', descKey: 'landProdJakshieldDesc', ctaKey: 'landProdJakshieldCta', typeKey: 'landProdJakshieldType', href: 'https://github.com/inbharatai/jak-shield', logo: null, icon: Shield, internal: false, color: '#dc2626', tech: ['PII Detection', 'Sandboxed Exec', 'Audit Trail', 'Open Source'] },
  { name: 'Agent Arcade', bucket: 'agentOps', tagKey: 'landProdArcadeTag', descKey: 'landProdArcadeDesc', ctaKey: 'landProdArcadeCta', typeKey: 'landProdArcadeType', href: 'https://github.com/inbharatai/agent-arcade-gateway', logo: null, internal: false, color: '#8da995', tech: ['Bun', 'Next.js', 'Socket.IO', 'SQLite'] },
  // ── Growth & Publishing ──
  { name: 'SocialFlow', bucket: 'growth', tagKey: 'landProdSocialFlowTag', descKey: 'landProdSocialFlowDesc', ctaKey: 'landProdSocialFlowCta', typeKey: 'landProdSocialFlowType', href: 'https://github.com/inbharatai/SocialFlow', logo: null, icon: Share2, internal: false, color: '#8da995', tech: ['FastAPI', 'Playwright', 'AES-256', '12 Platforms'] },
  // ── Consumer & Culture ──
  { name: 'Sahayaak AI', bucket: 'consumer', tagKey: 'landProdSahaayakTag', descKey: 'landProdSahaayakDesc', ctaKey: 'landProdSahaayakCta', typeKey: 'landProdSahaayakType', href: 'https://github.com/inbharatai/sahaayak-ai-public', logo: null, icon: Monitor, internal: false, color: '#ff9933', tech: ['FastAPI', 'Next.js', 'Whisper', 'Vosk'] },
  { name: 'KathaKitaab', bucket: 'consumer', tagKey: 'landProdKathakitaabTag', descKey: 'landProdKathakitaabDesc', ctaKey: 'landProdKathakitaabCta', typeKey: 'landProdKathakitaabType', href: 'https://www.kathakitaab.com/', logo: null, icon: FileText, internal: false, color: '#f97316', tech: ['React', 'Vercel', 'Indian Languages', 'AI'] },
  { name: 'UniBot', bucket: 'eduCareer', tagKey: 'landProdUnibotTag', descKey: 'landProdUnibotDesc', ctaKey: 'landProdUnibotCta', typeKey: 'landProdUnibotType', href: '#chatbot', logo: '/unibot-logo.png', internal: false, color: '#25D366', tech: ['WhatsApp API', 'NLP', 'Multilingual'] },
  { name: 'Phoring', bucket: 'agentOps', tagKey: 'landProdPhoringTag', descKey: 'landProdPhoringDesc', ctaKey: 'landProdPhoringCta', typeKey: 'landProdPhoringType', href: 'https://github.com/inbharatai/phoring', logo: '/phoring-logo.png', internal: false, color: '#10b981', tech: ['Python', 'Vue 3', 'OASIS', 'Zep Cloud'] },
  // ── Education & Career ──
  { name: 'UniAssist.ai', bucket: 'eduCareer', tagKey: 'landProdUniassistTag', descKey: 'landProdUniassistDesc', ctaKey: 'landProdUniassistCta', typeKey: 'landProdUniassistType', href: 'https://www.uniassist.ai', logo: '/uniassist-logo.png', internal: false, color: '#8da995', tech: ['React', 'Node.js', 'AI Matching'] },
  { name: 'TestsPrep.in', bucket: 'eduCareer', tagKey: 'landProdTestsprepTag', descKey: 'landProdTestsprepDesc', ctaKey: 'landProdTestsprepCta', typeKey: 'landProdTestsprepType', href: 'https://testsprep.in', logo: '/testsprep-logo.png', internal: false, color: '#8da995', tech: ['React', 'AI Analytics', 'Adaptive'] },
  { name: 'UnoOne', bucket: 'consumer', tagKey: 'landProdUnooneTag', descKey: 'landProdUnooneDesc', ctaKey: 'landProdUnooneCta', typeKey: 'landProdUnooneType', href: 'https://github.com/inbharatai/UnoOne-Local-Agent', logo: null, icon: Brain, internal: false, color: '#8da995', tech: ['Android', 'Whisper STT', 'MMS TTS', 'Offline-first'] },
  { name: 'OpenClawFix', bucket: 'consumer', tagKey: 'landProdOpenclawTag', descKey: 'landProdOpenclawDesc', ctaKey: 'landProdOpenclawCta', typeKey: 'landProdOpenclawType', href: 'https://openclawfix.pro', logo: '/openclawfix-logo.png', internal: false, color: '#14b8a6', tech: ['Next.js', 'Docker', 'PayPal', 'Razorpay'] },
  // ── Health & Public Service ──
  { name: 'Sahayaak Seva', bucket: 'health', tagKey: 'landProdSahaayakSevaTag', descKey: 'landProdSahaayakSevaDesc', ctaKey: 'landProdSahaayakSevaCta', typeKey: 'landProdSahaayakSevaType', href: 'https://sahayaakseva.in', logo: null, icon: Users, internal: false, color: '#059669', tech: ['FastAPI', 'Next.js 14', 'GPT-4o Vision', 'WHO Data'] },
  { name: 'SwasthyaScore AI', bucket: 'health', tagKey: 'landProdSwasthyaTag', descKey: 'landProdSwasthyaDesc', ctaKey: 'landProdSwasthyaCta', typeKey: 'landProdSwasthyaType', href: 'https://swasthyascore-ai.vercel.app', logo: null, icon: Target, internal: false, color: '#8da995', tech: ['PWA', 'rPPG Vitals', 'Lab OCR', 'Voice Screening'] },
] as const;

// Six verticals = the tabs in the product browser. Order here is the tab order.
// roleKey = the 2-4 word role label shown on the right-side ecosystem panel.
const BUCKETS: { key: ProductBucket; labelKey: string; descKey: string; roleKey: string; icon: React.FC<{ size?: number; color?: string; className?: string }>; color: string }[] = [
  { key: 'core', labelKey: 'landBucketCore', descKey: 'landBucketCoreDesc', roleKey: 'landBucketRoleCore', icon: Brain, color: '#f59f4f' },
  { key: 'agentOps', labelKey: 'landBucketAgentOps', descKey: 'landBucketAgentOpsDesc', roleKey: 'landBucketRoleAgentOps', icon: ShieldCheck, color: '#ef4444' },
  { key: 'consumer', labelKey: 'landBucketConsumer', descKey: 'landBucketConsumerDesc', roleKey: 'landBucketRoleConsumer', icon: MessageCircle, color: '#ff9933' },
  { key: 'eduCareer', labelKey: 'landBucketEduCareer', descKey: 'landBucketEduCareerDesc', roleKey: 'landBucketRoleEduCareer', icon: BookOpen, color: '#8da995' },
  { key: 'health', labelKey: 'landBucketHealth', descKey: 'landBucketHealthDesc', roleKey: 'landBucketRoleHealth', icon: Users, color: '#059669' },
  { key: 'growth', labelKey: 'landBucketGrowth', descKey: 'landBucketGrowthDesc', roleKey: 'landBucketRoleGrowth', icon: Target, color: '#8da995' },
];

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
  // Product browser: one vertical at a time. Default = InBharat Core AI.
  const [activeBucket, setActiveBucket] = useState<ProductBucket>('core');
  // Product detail selection is retained across cross-vertical launcher clicks.
  const [activeProductIndex, setActiveProductIndex] = useState(0);

  const selectVertical = (bucket: ProductBucket, productIndexInBucket = 0) => {
    setActiveBucket(bucket);
    setActiveProductIndex(productIndexInBucket);
  };

  const navItems = useMemo<{ href: string; label: string; route?: string }[]>(
    () => [
      { href: '#deep-tech', label: t('landNavDeepTech') },
      { href: '#jakswarm', label: t('landNavSystems') },
      { href: '#products', label: t('landNavProducts') },
      { href: '#mission', label: t('landNavMission') },
      { href: '#about', label: t('landNavAbout'), route: '/about' },
      // Contact routes to the dedicated /contact page (like the footer link),
      // NOT an in-page `#contact` scroll. `route` opts this item out of the
      // smooth-scroll handler (which only intercepts a[href^="#"]) and renders a
      // router <Link> so navigation is SPA, not a full page reload.
      { href: '#contact', label: t('landNavContact'), route: '/contact' },
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
      section.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
      setMobileOpen(false);
    };
    const shell = shellRef.current;
    shell?.addEventListener('click', clickHandler);
    return () => shell?.removeEventListener('click', clickHandler);
  }, [reduceMotion]);

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
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
    <div ref={shellRef} data-reduced-motion={reduceMotion} className="field-lab landing-shell min-h-screen">
      <div className="field-atmosphere" aria-hidden="true" />
      {/* ═══════════════ NAVIGATION ═══════════════ */}
      {/* Skip to main content — first focusable element for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-[#f59f4f] focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-[#030508] focus:shadow-lg"
      >
        Skip to content
      </a>

      <nav aria-label="Main navigation" className="field-nav sticky top-0 z-50 border-b border-white/[0.06] bg-[#030508]/70 backdrop-blur-2xl backdrop-saturate-150">
        <div className="field-nav-inner mx-auto flex h-[60px] w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <div className="logo-badge flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18] shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-all duration-400 group-hover:border-[#f59f4f]/40 group-hover:shadow-[0_12px_36px_rgba(245,159,79,0.15)]">
              <img src="/inbharat-logo.svg" alt="InBharat.ai logo" className="h-5.5 w-5.5 object-contain" width={22} height={22} />
            </div>
            <div>
              <p className="text-[14px] font-bold tracking-tight text-white">InBharat.ai</p>
              <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">{t('landBrandSub')}</p>
            </div>
          </Link>

          <div className="field-nav-sections hidden items-center gap-1 lg:flex">
            {navItems.map((item) =>
              item.route ? (
                <Link
                  key={item.href}
                  to={item.route}
                  onClick={() => trackEvent('nav_contact_open')}
                  className={`relative rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold tracking-wide transition-all duration-300 ${
                    activeSection === item.href
                      ? 'text-white'
                      : 'text-[#9aafc6] hover:text-[#b0c0d8]'
                  }`}
                >
                  {item.label}
                  {activeSection === item.href && (
                    <motion.div
                      layoutId={reduceMotion ? undefined : "nav-indicator"}
                      className="absolute inset-0 rounded-full bg-white/[0.07] border border-white/[0.1]"
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              ) : (
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
                      layoutId={reduceMotion ? undefined : "nav-indicator"}
                      className="absolute inset-0 rounded-full bg-white/[0.07] border border-white/[0.1]"
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </a>
              ),
            )}
          </div>

          <div className="field-nav-actions flex items-center gap-2.5">
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

            <Link
              to="/learn-ai-with-reeturaj"
              onClick={() => trackEvent('cta_nav_build_ai_with_reeturaj')}
              className="field-founder-link hidden rounded-full border border-[#f59f4f]/35 bg-[#f59f4f]/[0.12] px-4 py-1.5 text-[11px] font-bold text-[#f8c791] transition-all hover:border-[#f59f4f]/60 hover:bg-[#f59f4f]/[0.2] hover:text-[#ffe2bf] lg:inline-flex"
            >
              Build with Reeturaj
            </Link>

            <Link to="/app" className="field-nav-launch" aria-label="Open InBharat AI chat">Launch AI <ArrowRight size={15} aria-hidden="true" /></Link>
            {isSignedIn ? (
              <>
                <div className="sr-only">
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
                className="field-sign-in"
              >
                {t('signIn')}
              </Link>
            )}

            <button
              type="button"
              className="rounded-lg border border-white/8 p-1.5 text-[#b4c8de] transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Close menu' : t('openMenu')}
              aria-expanded={mobileOpen}
              aria-controls="field-mobile-menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            id="field-mobile-menu"
            className="field-mobile-menu border-t border-white/[0.06] bg-[#050810]/98 px-5 py-4 backdrop-blur-2xl lg:hidden"
          >
            <div className="grid gap-1">
              <Link
                to="/learn-ai-with-reeturaj"
                onClick={() => {
                  trackEvent('cta_nav_mobile_build_ai_with_reeturaj');
                  setMobileOpen(false);
                }}
                className="mb-1 rounded-xl border border-[#f59f4f]/30 bg-[#f59f4f]/[0.08] px-4 py-2.5 text-sm font-bold text-[#f8c791] transition-all hover:border-[#f59f4f]/55 hover:bg-[#f59f4f]/[0.16]"
              >
                Build with Reeturaj
              </Link>
              {navItems.map((item) =>
                item.route ? (
                  <Link
                    key={item.href}
                    to={item.route}
                    onClick={() => {
                      trackEvent('nav_contact_open');
                      setMobileOpen(false);
                    }}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      activeSection === item.href ? 'bg-white/[0.08] text-white' : 'text-[#b4c8de] hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      activeSection === item.href ? 'bg-white/[0.08] text-white' : 'text-[#b4c8de] hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </a>
                ),
              )}
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
      <header id="main-content" className="field-hero relative z-10">
        <div className="field-container field-hero-grid">
          <div className="field-hero-copy">
            <p className="field-kicker">INBHARAT / FIELD LAB <span>PRIVATE AI INFRASTRUCTURE</span></p>
            <h1 className="field-headline"><span>{t('landHeroTitle1')}</span>{' '}<span>{t('landHeroTitle2')}</span></h1>
            <p className="field-hero-summary">{i18n.resolvedLanguage === 'en' ? 'Trust-gated learning. Portable private intelligence. Agentic security. Engineered in Bharat for a world beyond cloud-only AI.' : t('landHeroDesc')}</p>
            <blockquote className="field-verse">
              <p lang="sa">कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।<br />मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥</p>
              <p>{t('gitaTranslation')}</p><cite>{t('gitaCitation')}</cite>
            </blockquote>
            <div className="field-hero-actions">
              <Link to="/app" className="field-button field-primary" data-testid="hero-launch" onClick={() => trackEvent('cta_hero_try_app')}>{t('landHeroCta1')}<ArrowRight size={17} aria-hidden="true" /></Link>
              <a href="#ecosystem" className="field-text-link">{t('landHeroCta2')}<ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <CredentialRail className="field-credentials" />
          </div>
          <FieldMedia />
        </div>
        <div className="field-container field-hero-index"><span>LOCAL-FIRST BY DESIGN</span><span>Trust / Intelligence / Autonomy</span><a href="#deep-tech">Explore the research ↓</a></div>
      </header>

      {/* ═══════════════ ECOSYSTEM ═══════════════ */}
      <Reveal id="ecosystem" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16 items-center">
            {/* Left: Content */}
            <div>
              <p className="eyebrow-line text-[#96b0c8] field-section-title">{t('landEcoLabel')}</p>
              <h2 className="mt-4 text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-[44px] field-section-title">
                {t('landEcoTitle')}
              </h2>

              <div className="mt-10 space-y-4">
                {[
                  { title: t('landEcoLayer1Title'), desc: t('landEcoLayer1Desc'), icon: Brain, color: '#f59f4f' },
                  { title: t('landEcoLayer2Title'), desc: t('landEcoLayer2Desc'), icon: MessageCircle, color: '#8da995' },
                  { title: t('landEcoLayer3Title'), desc: t('landEcoLayer3Desc'), icon: Target, color: '#10b981' },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    custom={i}
                    variants={itemReveal}
                    initial={reduceMotion ? false : "hidden"}
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

            {/* Right: readable portfolio index */}
            <motion.div
              className="flex items-center justify-center"
              initial={reduceMotion ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease }}
            >
              <SystemMap />
            </motion.div>
          </div>
        </div>
      </Reveal>

      <div className="landing-seam" aria-hidden="true" />


      {/* ═══════════════ WHY INBHARAT ═══════════════ */}
      <Reveal id="why" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="text-center mb-14">
            <p className="eyebrow-line justify-center text-[#96b0c8] field-section-title">{t('landNavAbout')}</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold leading-[1.1] text-white sm:text-4xl field-section-title">
              {t('landWhy1Title')}
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              { title: t('landWhy1Title'), text: t('landWhy1Desc'), icon: ShieldCheck, color: '#f59f4f' },
              { title: t('landWhy2Title'), text: t('landWhy2Desc'), icon: Globe, color: '#8da995' },
              { title: t('landWhy3Title'), text: t('landWhy3Desc'), icon: Sparkles, color: '#10b981' },
            ].map((item, i) => (
              <motion.article
                key={item.title}
                custom={i}
                variants={itemReveal}
                initial={reduceMotion ? false : "hidden"}
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


      {/* ═══════════════ FOUNDATIONAL DEEP TECH SPOTLIGHT ═══════════════ */}
      <DeepTechField />

      <div className="landing-seam" aria-hidden="true" />

      {/* ═══════════════ JAK SWARM SPOTLIGHT ═══════════════ */}
      <Reveal id="jakswarm" className="relative z-10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-[#ef4444]/20 bg-gradient-to-br from-[#1a0606] via-[#0b0708] to-[#04060a]">
            {/* Ambient glows */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 800px 450px at 10% -15%,rgba(239,68,68,0.16),transparent 50%),radial-gradient(ellipse 600px 350px at 95% 110%,rgba(245,159,79,0.10),transparent 50%)' }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'linear-gradient(to right,rgba(239,68,68,0.7) 1px,transparent 1px),linear-gradient(to bottom,rgba(239,68,68,0.7) 1px,transparent 1px)', backgroundSize: '48px 48px' }}
            />

            <div className="relative p-6 sm:p-8 md:p-12 lg:p-14">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:items-stretch">
                {/* Left */}
                <div>
                  <div className="mb-6 flex flex-wrap items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10">
                      <ShieldCheck size={22} className="text-[#ef4444]" />
                    </div>
                    <span className="rounded-full border border-[#ef4444]/30 bg-[#ef4444]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#f87171]">
                      {t('landJakBadge')}
                    </span>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/8 px-3 py-1 text-[10px] font-bold text-amber-400">
                      Evidence Engine
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold leading-[1.06] tracking-tight text-white sm:text-3xl lg:text-[48px] lg:leading-[1.02]">
                    {t('landJakTitle')}
                    <br />
                    <span className="bg-gradient-to-r from-[#f87171] via-[#fca5a5] to-[#fecaca] bg-clip-text text-transparent">
                      {t('landJakTitle2')}
                    </span>
                  </h2>

                  <p className="mt-5 max-w-xl text-sm leading-[1.7] text-[#9aafc6]">
                    {t('landJakDesc')}
                  </p>

                  <dl className="field-jak-capabilities">
                    <div><dt>Evidence</dt><dd>Traceable sources</dd></div>
                    <div><dt>Drift checks</dt><dd>Compare work to the spec</dd></div>
                    <div><dt>Risk gates</dt><dd>Review before approval</dd></div>
                    <div><dt>Audit trail</dt><dd>Tamper-evident records</dd></div>
                  </dl>

                  {/* Feature chips */}
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {[
                      t('landJakFeat1'), t('landJakFeat2'), t('landJakFeat3'),
                      t('landJakFeat4'), t('landJakFeat5'), t('landJakFeat6'),
                      t('landJakFeat7'), t('landJakFeat8'), t('landJakFeat9'),
                    ].map((feat) => (
                      <span
                        key={feat}
                        className="rounded-full border border-[#ef4444]/20 bg-[#ef4444]/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-[#fca5a5]"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>

                  {/* Use cases callout */}
                  <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-sm text-amber-300">
                    <Target size={14} className="flex-shrink-0 text-amber-500" />
                    {t('landJakUseCases')}
                  </div>

                  {/* CTAs */}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href="https://github.com/inbharatai/jak-swarm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#ef4444] px-6 py-3 text-sm font-bold text-[#1a0606] shadow-[0_0_30px_rgba(239,68,68,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#f87171] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
                    >
                      {t('landJakCta2')}
                      <Github size={14} />
                    </a>
                  </div>
                </div>

                {/* Right: JAK evidence workflow — conceptual, not live telemetry */}
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.1, ease }}
                  className="relative overflow-hidden rounded-2xl border border-[#ef4444]/15 bg-[#030608] min-h-[400px] lg:min-h-0 lg:self-stretch"
                >
                  <JakDiagram />
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
              <p className="eyebrow-line text-[#96b0c8] field-section-title">{t('landProdLabel')}</p>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl field-section-title">{t('landProdTitle')}</h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[#96b0c8]">{t('landProdSub')}</p>
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

          <div className="field-vertical-selector" role="group" aria-label="Six product verticals">
            {BUCKETS.map((bucket, index) => <button key={bucket.key} type="button"
              data-vertical={bucket.key} aria-pressed={activeBucket === bucket.key}
              aria-controls="field-product-detail" onClick={() => selectVertical(bucket.key)}>
              <small>0{index + 1}</small><span>{t(bucket.labelKey)}</span>
              <span className="field-count">{ALL_PRODUCTS.filter((p) => p.bucket === bucket.key).length}</span>
            </button>)}
          </div>

          {(() => {
            const products = ALL_PRODUCTS.filter((p) => p.bucket === activeBucket);
            if (products.length === 0) return null;
            const idx = Math.min(activeProductIndex, products.length - 1);
            const p = products[idx];
            const bucketDef = BUCKETS.find((b) => b.key === activeBucket)!;
            const isHttp = p.href.startsWith('http');
            return (
              <motion.div
                key={activeBucket}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease }}
                id="field-product-detail" className="field-product-detail"
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: `radial-gradient(ellipse 640px 320px at 12% -10%, ${bucketDef.color}22, transparent 55%)` }}
                />
                <div className="field-product-layout">
                  {/* LEFT — active product details */}
                  <div className="field-product-content">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                        <ProductLogo logo={p.logo as string | null} name={p.name} color={p.color} icon={p.iconComp} />
                      </div>
                      <div className="min-w-0">
                        <TypeBadge color={p.color}>{p.type}</TypeBadge>
                        <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">{p.name}</h3>
                      </div>
                    </div>
                    <p className="max-w-xl text-[14px] leading-relaxed text-[#b4c8de]">{p.desc}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.tech.slice(0, 4).map((tech) => (
                        <span key={tech} className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[10px] font-medium text-[#b4c8de]">{tech}</span>
                      ))}
                    </div>
                    <div className="mt-6">
                      {p.internal ? (
                        <Link to={p.href} className="inline-flex items-center gap-2 rounded-xl border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-5 py-3 text-[14px] font-bold text-white transition-all hover:bg-[#f59f4f]/20">
                          {p.cta} <ArrowRight size={16} />
                        </Link>
                      ) : (
                        <a href={p.href} target={isHttp ? '_blank' : undefined} rel={isHttp ? 'noopener noreferrer' : undefined} className="inline-flex items-center gap-2 rounded-xl border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-5 py-3 text-[14px] font-bold text-white transition-all hover:bg-[#f59f4f]/20">
                          {p.cta} {isHttp ? <ExternalLink size={16} /> : <ArrowRight size={16} />}
                        </a>
                      )}
                    </div>

                    {/* Core links to all products; other verticals show their own picker. */}
                    {(() => {
                      const isCore = activeBucket === 'core';
                      // Core surfaces the whole studio (everything except the core
                      // product already shown in the hero). Other verticals surface
                      // only their own products.
                      const toolProducts = isCore
                        ? ALL_PRODUCTS.filter((pp) => pp.bucket !== 'core')
                        : products;
                      if (toolProducts.length === 0) return null;
                      const title = isCore ? t('landModEcoTitle') : `${t(bucketDef.labelKey)} ${t('landModToolsLabel')}`;
                      const sub = isCore ? t('landModEcoSub') : `${toolProducts.length} ${t('landModToolsLabel').toLowerCase()}`;
                      // Index of a product within its OWN vertical's filtered list —
                      // needed so the Core launcher can target a specific product when
                      // it switches verticals (selectVertical takes a per-bucket index).
                      const indexOfInBucket = (name: string, bucket: ProductBucket) =>
                        ALL_PRODUCTS.filter((x) => x.bucket === bucket).findIndex((x) => x.name === name);
                      return (
                        <div className="field-product-picker">
                          <div className="mb-2.5 flex items-baseline justify-between gap-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white">{title}</p>
                            <span className="shrink-0 text-[10px] text-[#7a9ab8]">{sub}</span>
                          </div>
                          <div className="field-product-options">
                            {toolProducts.map((prod) => {
                              const sel = !isCore && prod.name === p.name;
                              const onClick = isCore
                                ? () => selectVertical(prod.bucket, indexOfInBucket(prod.name, prod.bucket))
                                : () => {
                                    const i = products.findIndex((x) => x.name === prod.name);
                                    if (i >= 0) setActiveProductIndex(i);
                                  };
                              return (
                                <button
                                  key={prod.name}
                                  type="button"
                                  onClick={onClick}
                                  aria-pressed={sel}
                                  className={`group flex items-center gap-2 rounded-xl border p-2 text-left transition-all duration-200 ${sel ? 'bg-white/[0.05]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'} ${toolProducts.length === 1 ? 'sm:col-span-3' : ''}`}
                                  style={sel ? { borderColor: `${prod.color}80`, boxShadow: `0 0 16px -8px ${prod.color}66` } : undefined}
                                >
                                  <span className="flex shrink-0 items-center justify-center">
                                    <ProductLogo logo={prod.logo as string | null} name={prod.name} color={prod.color} icon={prod.iconComp} size={22} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className={`block text-[14px] font-bold ${sel ? 'text-white' : 'text-[#c8d6e8]'} group-hover:text-white`}>{prod.name}</span>
                                    <span className="block text-[12px] text-[#7a9ab8]">{prod.tagline}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </motion.div>
            );
          })()}
        </div>
      </Reveal>

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
            <div className="rounded-[24px] border border-white/[0.06] bg-[#141817] p-7 sm:p-9">
              <p className="eyebrow-line text-[#96b0c8]">{t('landTrustLabel')}</p>
              <CredentialTrustList className="mt-6" />
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
                    initial={reduceMotion ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
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
            InBharat AI · Independent deep-tech engineering
          </span>
          <span className="text-[#7a9ab8]">{supportedLanguages.length} Languages</span>
          <span className="text-[#7a9ab8]">{ALL_PRODUCTS.length} Products</span>
        </div>
      </div>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 sm:px-6 lg:px-10">
          <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/inbharat-logo.svg" alt="InBharat.ai logo" className="h-5 w-5 object-contain" width={20} height={20} />
              <p className="text-[12px] font-semibold tracking-tight text-[#9aafc6]">InBharat.ai</p>
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
            <span className="text-[#bac2b8]">©  InBharat AI</span>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
};

export default Landing;
