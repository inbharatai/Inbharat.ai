import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import TricolourStar from '../components/TricolourStar';
import {
  Sparkles, Mic, Search, Globe, ArrowRight, ExternalLink, BookOpen,
  GraduationCap, MessageCircle,
  Zap, Wrench, Bot,
  TrendingUp, Phone, BarChart2, Mail, Github, Code2, Activity, Brain, Menu, X
} from 'lucide-react';

/* Scroll-reveal helper */
const FadeIn: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('fade-in-visible'); obs.unobserve(el); } },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`fade-in-section ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
};

const Landing: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isSignedIn, user, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e6edf3] font-sans overflow-x-hidden">
      {/* Ambient gradient orb */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[#FF9933]/4 blur-[120px]" />
      </div>

      {/* ===== NAVBAR ===== */}
      <nav className="sticky top-0 z-50 flex items-center justify-between gap-2 px-4 md:px-6 py-2.5 bg-[#09090b]/90 backdrop-blur-xl border-b border-[#1e1e22]/60">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-black border border-[#1e1e22] flex items-center justify-center">
            <TricolourStar size={16} />
          </div>
          <span className="font-extrabold text-white text-sm hidden sm:block tracking-tight">InBharat</span>
        </Link>

        <div className="hidden lg:flex items-center gap-0.5">
          {[
            { href: '#products', label: t('navProducts') },
            { href: '#services', label: t('navServices') },
            { href: '#opensource', label: t('navOpenSource') },
          ].map(({ href, label }) => (
            <a key={href} href={href} className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white rounded-lg hover:bg-[#111113] transition-all">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-[#111113] border border-[#1e1e22] text-gray-300 text-xs font-semibold transition-all hover:border-[#FF9933]/50 cursor-pointer appearance-none"
            aria-label={t('langSwitcher')}
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.native}</option>
            ))}
          </select>

          {isSignedIn ? (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111113] border border-[#1e1e22] text-gray-300 text-xs font-medium">
                <span className="text-gray-500">{t('signedInLabel')}</span>
                <span className="truncate max-w-[140px]">{user?.email ?? 'user'}</span>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="px-3 py-1.5 rounded-xl bg-[#111113] border border-[#1e1e22] text-gray-300 hover:text-white hover:border-[#FF9933]/50 text-xs font-semibold transition-all"
              >
                {t('signOut')}
              </button>
            </>
          ) : (
            <Link to="/app" className="px-4 py-1.5 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white text-xs font-bold transition-all">
              {t('signIn')}
            </Link>
          )}

          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg hover:bg-[#111113] text-gray-400 transition-colors"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[49px] z-40 bg-[#09090b]/95 backdrop-blur-xl border-b border-[#1e1e22]/60 px-4 py-3 space-y-1">
          {[
            { href: '#products', label: t('navProducts') },
            { href: '#services', label: t('navServices') },
            { href: '#opensource', label: t('navOpenSource') },
          ].map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setMobileNavOpen(false)} className="block px-4 py-2.5 text-sm font-semibold text-gray-300 hover:text-white rounded-xl hover:bg-[#111113] transition-all">
              {label}
            </a>
          ))}
        </div>
      )}

      {/* ===== HERO ===== */}
      <header className="relative pt-16 sm:pt-24 md:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 text-center z-10">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-black border-2 border-[#1e1e22] rounded-[1.75rem] sm:rounded-[2.5rem] mb-6 shadow-2xl shadow-[#FF9933]/10">
            <TricolourStar size={48} className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-white mb-3">
            InBharat{' '}
            <span className="inline-block bg-linear-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent">
              Ai
            </span>
          </h1>

          <p className="text-sm sm:text-base font-semibold text-[#FF9933] mb-5 tracking-wide">
            {t('deshKaAiShort')}
          </p>

          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            {t('heroDescPlain')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#FF9933]/20 hover:shadow-[#FF9933]/30 active:scale-[0.98]"
            >
              {t('discussProject')}
              <ArrowRight size={18} />
            </Link>
            <a
              href="#services"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#111113] border border-[#1e1e22] hover:border-[#FF9933]/40 text-gray-300 hover:text-white font-semibold rounded-2xl transition-all"
            >
              {t('seeWhatWeBuild')}
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* ===== CREDIBILITY BAR ===== */}
      <FadeIn>
        <div className="py-8 px-4 sm:px-6 border-t border-b border-[#1e1e22]/40 bg-[#111113]/30">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-10 sm:gap-16">
            {[
              { num: '5', label: t('statsProductsLabel') },
              { num: '14+', label: t('statsLangsLabel') },
              { num: '4', label: t('openSourceLabel') },
              { num: '8', label: t('statsServiceTypes') },
            ].map(({ num, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#FF9933]">{num}</span>
                <span className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ===== PRODUCTS ===== */}
      <section id="products" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-12">
            <p className="text-[#FF9933] text-xs font-bold uppercase tracking-[0.3em] mb-2">{t('proofOfWork')}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{t('ourProducts')}</h2>
            <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto">{t('productsDesc')}</p>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* InBharat AI */}
            <FadeIn delay={0}>
              <div className="h-full flex flex-col p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#FF9933]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#FF9933]/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-[#1e1e22] flex items-center justify-center shrink-0">
                    <TricolourStar size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{t('inBharatTagline')}</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('inBharatSubline')}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{t('inBharatSectionIntro')}</p>
                <div className="mt-5">
                  <Link to="/app" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold text-sm transition-all">
                    {t('useInBharat')} <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* UniAssist.ai */}
            <FadeIn delay={80}>
              <div className="h-full flex flex-col p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#138808]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#138808]/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-[#138808]/40 flex items-center justify-center overflow-hidden shrink-0 relative">
                    <img src="/uniassist-logo.png" alt="UniAssist.ai" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                    <span className="hidden absolute inset-0 flex items-center justify-center text-[#138808]"><GraduationCap size={24} /></span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">UniAssist.ai</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('uniAssistSubline')}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{t('uniAssistHero')}</p>
                <div className="mt-5">
                  <a href="https://www.uniassist.ai" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#09090b] border border-[#1e1e22] hover:border-[#138808]/50 text-gray-300 hover:text-white font-bold text-sm transition-all">
                    {t('visitUniAssist')} <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </FadeIn>

            {/* TestsPrep.in */}
            <FadeIn delay={160}>
              <div className="h-full flex flex-col p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#8b5cf6]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#8b5cf6]/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-[#8b5cf6]/40 flex items-center justify-center overflow-hidden shrink-0 relative">
                    <img src="/testsprep-logo.png" alt="TestsPrep.in" className="w-full h-full object-contain scale-150" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                    <span className="hidden absolute inset-0 flex items-center justify-center text-[#8b5cf6]"><BookOpen size={24} /></span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{t('testsprepTagline')}</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('testsprepSubline')}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{t('testsprepHero')}</p>
                <div className="mt-5">
                  <a href={t('testsprepUrl')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold text-sm transition-all">
                    {t('visitTestsprep')} <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </FadeIn>

            {/* UniBot */}
            <FadeIn delay={0}>
              <div className="h-full flex flex-col p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#3b82f6]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#3b82f6]/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-[#3b82f6]/40 flex items-center justify-center overflow-hidden shrink-0 relative">
                    <img src="/unibot-logo.png" alt="UniBot" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                    <span className="hidden absolute inset-0 flex items-center justify-center text-[#3b82f6]"><MessageCircle size={24} /></span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">UniBot</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('unibotSubline')}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{t('unibotHero')}</p>
                <div className="mt-5">
                  <a href={t('unibotWhatsAppUrl')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-sm transition-all">
                    {t('chatUniBot')} <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </FadeIn>

            {/* OpenClawFix */}
            <FadeIn delay={80}>
              <div className="h-full flex flex-col p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#14b8a6]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#14b8a6]/5 relative">
                <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-[#14b8a6]/10 border border-[#14b8a6]/30 text-[#14b8a6] text-[9px] font-bold uppercase tracking-wider">{t('forDevelopers')}</span>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-[#14b8a6]/40 flex items-center justify-center overflow-hidden shrink-0 relative">
                    <img src="/openclawfix-logo.png" alt="OpenClawFix" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                    <span className="hidden absolute inset-0 flex items-center justify-center text-[#14b8a6]"><Wrench size={24} /></span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{t('openClawFixTagline')}</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('openClawFixSubline')}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{t('openClawFixCardIntro')}</p>
                <div className="mt-5">
                  <a href={t('openClawFixUrl')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold text-sm transition-all">
                    {t('visitOpenClawFix')} <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section id="services" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-12">
            <p className="text-[#FF9933] text-xs font-bold uppercase tracking-[0.3em] mb-2">{t('servicesLabel')}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">{t('servicesTitle')}</h2>
            <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">{t('servicesDesc')}</p>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { icon: Globe, title: t('serviceWebsites'), desc: t('serviceWebsitesDesc'), color: '#FF9933' },
              { icon: Bot, title: t('serviceChatbots'), desc: t('serviceChatbotsDesc'), color: '#138808' },
              { icon: Zap, title: t('serviceAutomation'), desc: t('serviceAutomationDesc'), color: '#FF9933' },
              { icon: BarChart2, title: t('serviceCRM'), desc: t('serviceCRMDesc'), color: '#138808' },
              { icon: Mail, title: t('serviceWhatsApp'), desc: t('serviceWhatsAppDesc'), color: '#FF9933' },
              { icon: Phone, title: t('serviceCalling'), desc: t('serviceCallingDesc'), color: '#138808' },
              { icon: TrendingUp, title: t('serviceSales'), desc: t('serviceSalesDesc'), color: '#FF9933' },
              { icon: Wrench, title: t('serviceCustom'), desc: t('serviceCustomDesc'), color: '#138808' },
            ] as { icon: React.ElementType; title: string; desc: string; color: string }[]).map(({ icon: Icon, title, desc, color }, i) => (
              <FadeIn key={title} delay={i * 40}>
                <Link
                  to="/app"
                  className="group flex flex-col gap-3 p-5 h-full rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-[#FF9933]/30 transition-all text-left hover:-translate-y-0.5"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#09090b] border border-[#1e1e22] flex items-center justify-center group-hover:scale-110 transition-transform shrink-0" style={{ color }}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-sm mb-1">{title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#FF9933] uppercase tracking-wider">{t('discussProjectArrow')}</span>
                </Link>
              </FadeIn>
            ))}
          </div>

          <FadeIn className="mt-12 text-center">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#FF9933]/20"
            >
              {t('describeProject')} <ArrowRight size={18} />
            </Link>
            <p className="text-gray-600 text-sm mt-3">{t('chatAdvisor')}</p>
          </FadeIn>
        </div>
      </section>

      {/* ===== OPEN SOURCE ===== */}
      <section id="opensource" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-12">
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">{t('openSourceLabel')}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{t('openSourceTitle')}</h2>
            <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto">{t('openSourceDesc')}</p>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: t('codeinProName'), sub: t('codeinProSub'), desc: t('codeinProDesc'), icon: Code2, url: 'https://github.com/inbharat-ai/codein.pro' },
              { name: t('agentArcadeName'), sub: t('agentArcadeSub'), desc: t('agentArcadeDesc'), icon: Activity, url: 'https://github.com/inbharatai/agent-arcade-gateway' },
              { name: t('phoringName'), sub: t('phoringSub'), desc: t('phoringDesc'), icon: TrendingUp, url: 'https://github.com/inbharatai/phoring' },
              { name: t('sahaayakName'), sub: t('sahaayakSub'), desc: t('sahaayakDesc'), icon: Brain, url: 'https://github.com/inbharatai/sahaayak-ai' },
            ].map(({ name, sub, desc, icon: Icon, url }, i) => (
              <FadeIn key={name} delay={i * 60}>
                <div className="flex flex-col h-full p-6 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22] hover:border-emerald-500/30 transition-all hover:-translate-y-0.5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#09090b] border border-[#1e1e22] flex items-center justify-center shrink-0">
                      <Icon size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">{name}</h3>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500 mt-0.5">{sub}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mt-2 flex-1">{desc}</p>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#09090b] border border-[#1e1e22] hover:border-emerald-500/40 text-gray-300 hover:text-white text-sm font-bold transition-all">
                    <Github size={15} />
                    {t('viewOnGitHub')}
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn className="mt-10 text-center">
            <a href="https://github.com/inbharatai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-[#111113] border border-[#1e1e22] hover:border-emerald-500/40 text-gray-300 hover:text-white text-sm font-bold rounded-xl transition-all">
              <Github size={16} />
              {t('seeAllGitHub')}
            </a>
          </FadeIn>
        </div>
      </section>

      {/* ===== BUILT FOR INDIA ===== */}
      <FadeIn>
        <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">{t('builtForIndia')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'voiceAI', icon: Mic },
                { key: 'agenticSearch', icon: Search },
                { key: 'indianLangs', icon: Globe },
                { key: 'sovereignStack', icon: Sparkles },
              ].map(({ key, icon: Icon }) => (
                <div key={key} className="flex flex-col items-center text-center p-5 rounded-2xl bg-[#111113]/80 backdrop-blur-sm border border-[#1e1e22]">
                  <div className="w-12 h-12 rounded-xl bg-[#09090b] border border-[#1e1e22] flex items-center justify-center text-[#FF9933] mb-3">
                    <Icon size={22} />
                  </div>
                  <h4 className="text-white font-bold text-sm mb-1">{t(key)}</h4>
                  <p className="text-gray-500 text-xs">{t(`${key}Desc`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ===== FINAL CTA ===== */}
      <FadeIn>
        <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[#FF9933] text-xs font-bold uppercase tracking-[0.3em] mb-3">{t('workWithUs')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">{t('workWithUsTitle')}</h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">{t('workWithUsDesc')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#FF9933]/20"
              >
                {t('startConversation')} <ArrowRight size={18} />
              </Link>
              <a
                href="#services"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#111113] border border-[#1e1e22] hover:border-[#FF9933]/40 text-gray-300 hover:text-white font-semibold rounded-2xl transition-all"
              >
                {t('browseServices')} <ArrowRight size={16} />
              </a>
            </div>
            <p className="text-gray-600 text-xs mt-5">{t('servingBusinesses')}</p>
          </div>
        </section>
      </FadeIn>

      {/* ===== FOOTER ===== */}
      <footer className="py-8 sm:py-10 px-4 sm:px-6 border-t border-[#1e1e22]/30 relative z-10">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TricolourStar size={24} />
            <span className="font-extrabold text-white">InBharat</span>
          </div>
          <p className="text-gray-500 text-xs text-center sm:text-left">{t('footerTagline')}</p>
          <div className="flex items-center gap-5 text-sm flex-wrap justify-center">
            <Link to="/app" className="text-gray-400 hover:text-white transition-colors">{t('footerInBharat')}</Link>
            <a href="https://www.uniassist.ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">{t('footerUniAssist')}</a>
            <a href={t('testsprepUrl')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">{t('footerTestsprep')}</a>
            <a href={t('unibotWhatsAppUrl')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">{t('footerUniBot')}</a>
            <a href={t('openClawFixUrl')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">{t('footerOpenClawFix')}</a>
            <a href="https://github.com/inbharatai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              <Github size={15} />
              {t('gitHub')}
            </a>
          </div>
        </div>
        <p className="text-center text-gray-600 text-xs mt-4">{t('copyright')}</p>
      </footer>
    </div>
  );
};

export default Landing;