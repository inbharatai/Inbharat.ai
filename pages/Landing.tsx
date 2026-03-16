import React from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import TricolourStar from '../components/TricolourStar';
import {
  Sparkles, Mic, Search, Globe, ArrowRight, ExternalLink, Check, BookOpen,
  GraduationCap, FileCheck, MapPin, Wallet, Briefcase, Heart, MessageCircle,
  Zap, Shield, Terminal, ShoppingBag, Wrench, Box, Key, FileCode, Bot, Send, ListChecks,
  FlaskConical
} from 'lucide-react';


const modulesList: { key: string; icon: React.ElementType }[] = [
  { key: 'universityFinder', icon: MapPin },
  { key: 'profileMentor', icon: GraduationCap },
  { key: 'aiTestPrep', icon: BookOpen },
  { key: 'diagnosticTests', icon: FileCheck },
  { key: 'visaAssistant', icon: Globe },
  { key: 'scholarships', icon: Wallet },
  { key: 'jobPredictor', icon: Briefcase },
  { key: 'studyTools', icon: BookOpen },
  { key: 'wellnessSupport', icon: Heart },
  { key: 'uniBot', icon: MessageCircle },
];

const inBharatCapabilitiesList: { key: string; icon: React.ElementType }[] = [
  { key: 'inBharatStandard', icon: BookOpen },
  { key: 'inBharatResearch', icon: Search },
  { key: 'inBharatCoder', icon: Terminal },
  { key: 'inBharatEducator', icon: GraduationCap },
  { key: 'inBharatBrowser', icon: Globe },
  { key: 'inBharatExecutive', icon: Briefcase },
  { key: 'inBharatShopper', icon: ShoppingBag },
];

const testsprepFeaturesList: { key: string; icon: React.ElementType }[] = [
  { key: 'testsprepFeature1', icon: FileCheck },
  { key: 'testsprepFeature2', icon: BookOpen },
  { key: 'testsprepFeature3', icon: ListChecks },
  { key: 'testsprepFeature4', icon: Globe },
  { key: 'testsprepFeature5', icon: Zap },
  { key: 'testsprepFeature6', icon: Terminal },
  { key: 'testsprepFeature7', icon: FlaskConical },
];

const Landing: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isSignedIn, user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans overflow-x-hidden">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0d1117]/95 backdrop-blur-md border-b border-[#30363d]/40">
        {/* Brand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-black border border-[#30363d] flex items-center justify-center">
            <TricolourStar size={16} />
          </div>
          <span className="font-black italic text-white text-sm hidden sm:block tracking-tight">InBharat</span>
        </div>

        {/* Product anchor nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {[
            { href: '#inbharat', label: 'InBharat AI', color: '#FF9933' },
            { href: '#uniassist', label: 'UniAssist', color: '#138808' },
            { href: '#testsprep', label: 'TestsPrep', color: '#8b5cf6' },
            { href: '#unibot', label: 'UniBot', color: '#3b82f6' },
            { href: '#openclawfix', label: 'OpenClawFix', color: '#14b8a6' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white rounded-lg hover:bg-[#161b22] transition-all"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Auth + Language */}
        <div className="flex items-center gap-2">
          <select
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-[#161b22] border border-[#30363d] text-gray-300 text-xs font-bold transition-all hover:border-[#FF9933]/50 cursor-pointer appearance-none"
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
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#30363d] text-gray-300 text-xs font-semibold">
                <span className="text-gray-500">Signed in:</span>
                <span className="truncate max-w-[140px]">{user?.email ?? "user"}</span>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#30363d] text-gray-300 hover:text-white hover:border-[#FF9933]/50 text-xs font-bold transition-all"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/app"
              className="px-4 py-1.5 rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white text-xs font-bold transition-all"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      {/* Tricolor strip — desi */}
      <div className="h-1 flex">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      {/* Hero */}
      <header className="relative pt-10 sm:pt-14 md:pt-20 pb-12 sm:pb-20 px-4 sm:px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-black border-2 border-[#30363d] rounded-[1.75rem] sm:rounded-[2.5rem] mb-5 sm:mb-6 shadow-2xl">
            <TricolourStar size={48} className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black italic tracking-tighter text-white mb-2 sm:mb-3">
            InBharat <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent pr-1">Ai</span>
          </h1>
          <p className="text-sm sm:text-base font-semibold text-white mb-2">
            Desh Ka Ai
          </p>
          <div className="w-16 sm:w-20 h-0.5 bg-gradient-to-r from-[#FF9933] via-white/80 to-[#138808] mx-auto mb-3" />
          <p className="text-[9px] sm:text-[10px] font-medium uppercase text-gray-500 max-w-lg mx-auto mb-6 flex flex-col items-center justify-center gap-y-0.5">
            <span className="tracking-[0.15em] sm:tracking-[0.25em] flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4">
              <span>A I</span>
              <span>I N T E L L I G E N C E</span>
            </span>
            <span className="tracking-[0.15em] sm:tracking-[0.25em]">F O R</span>
            <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent tracking-[0.15em] sm:tracking-[0.25em] pr-1">B H A R A T</span>
          </p>
          <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto mb-6 leading-relaxed">
            {t('heroSubShort')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all shadow-lg hover:shadow-[#FF9933]/20 active:scale-[0.98]"
            >
              {t('tryInBharat')}
              <ArrowRight size={18} />
            </Link>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#161b22] border border-[#30363d] hover:border-[#138808]/50 text-gray-300 hover:text-white font-bold rounded-2xl transition-all"
            >
              {t('exploreUniAssist')}
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="py-6 px-4 sm:px-6 border-t border-b border-[#30363d]/30 bg-[#161b22]/40">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-8 sm:gap-16">
          {[
            { num: '7', label: t('statsModesLabel') },
            { num: '14+', label: t('statsLangsLabel') },
            { num: '5', label: t('statsProductsLabel') },
            { num: '3', label: t('statsPlatformsLabel') },
          ].map(({ num, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-2xl sm:text-3xl font-black text-[#FF9933]">{num}</span>
              <span className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Products: InBharat + UniAssist + UniBot cards — uniform height, typography, spacing */}
      <section id="products" className="py-12 sm:py-20 px-4 sm:px-6 border-t border-[#30363d]/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10 sm:mb-12">
            {t('ourProducts')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 items-stretch">
            {/* Desh Ka AI */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#FF9933]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#FF9933]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center flex-shrink-0">
                  <TricolourStar size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">{t('inBharatTagline')}</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t('inBharatSubline')}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t('inBharatSectionIntro')}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('inBharatBullet1')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('inBharatBullet2')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('inBharatBullet3')}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <Link
                  to="/app"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold transition-all"
                >
                  {t('useInBharat')}
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>

            {/* UniAssist.ai */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#138808]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#138808]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#138808]/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  <img src="/uniassist-logo.png" alt="UniAssist.ai" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                  <span className="hidden absolute inset-0 flex items-center justify-center text-[#138808]"><GraduationCap size={28} /></span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">UniAssist.ai</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t('uniAssistSubline')}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t('uniAssistHero')}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('onlyLiveData')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('noPromptNeeded')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('allEducationalNeeds')}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href="https://www.uniassist.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-[#138808]/50 text-gray-300 hover:text-white font-bold transition-all"
                >
                  {t('visitUniAssist')}
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>

            {/* TestsPrep.in */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#8b5cf6]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#8b5cf6]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#8b5cf6]/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  <img src="/testsprep-logo.png" alt="TestsPrep.in" className="w-full h-full object-contain scale-150" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                  <span className="hidden absolute inset-0 flex items-center justify-center text-[#8b5cf6]"><BookOpen size={28} /></span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">{t('testsprepTagline')}</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t('testsprepSubline')}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t('testsprepHero')}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#8b5cf6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('testsprepBullet1')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#8b5cf6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('testsprepBullet2')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#8b5cf6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('testsprepBullet3')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#8b5cf6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('testsprepBullet4')}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href={t('testsprepUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold transition-all"
                >
                  {t('visitTestsprep')}
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>

            {/* UniBot */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#3b82f6]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#3b82f6]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#3b82f6]/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  <img src="/unibot-logo.png" alt="UniBot" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                  <span className="hidden absolute inset-0 flex items-center justify-center text-[#3b82f6]"><MessageCircle size={28} /></span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">UniBot</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t('unibotSubline')}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t('unibotHero')}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('unibotBullet1')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('unibotBullet2')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('unibotBullet3')}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href={t('unibotWhatsAppUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold transition-all"
                >
                  {t('chatUniBot')}
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>

            {/* OpenClawFix */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#14b8a6]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#14b8a6]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#14b8a6]/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  <img src="/openclawfix-logo.png" alt="OpenClawFix" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                  <span className="hidden absolute inset-0 flex items-center justify-center text-[#14b8a6]"><Wrench size={28} /></span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">{t('openClawFixTagline')}</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t('openClawFixSubline')}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t('openClawFixCardIntro')}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('openClawFixBullet1')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('openClawFixBullet2')}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t('openClawFixBullet3')}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href={t('openClawFixUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold transition-all"
                >
                  {t('visitOpenClawFix')}
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— InBharat AI full section (like UniAssist) ——— */}
      <section id="inbharat" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e12] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-black border-2 border-[#30363d] flex items-center justify-center">
                <TricolourStar size={40} />
              </div>
            </div>
            <p className="text-[#FF9933] text-xs font-black uppercase tracking-[0.35em] mb-2">InBharat AI</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-2">
              {t('inBharatTagline')}
            </h2>
            <p className="text-[9px] sm:text-[10px] font-medium uppercase text-gray-500 mb-4 flex flex-col items-center justify-center gap-y-0.5">
              <span className="tracking-[0.15em] flex flex-wrap items-center justify-center gap-x-3">
                <span>A I</span>
                <span>I N T E L L I G E N C E</span>
              </span>
              <span className="tracking-[0.15em]">F O R</span>
              <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent tracking-[0.15em] pr-1">B H A R A T</span>
            </p>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t('inBharatSectionIntro')}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t('inBharatTrustedBy')}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="px-4 py-2 rounded-full bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-xs font-bold">{t('voiceAI')}</span>
              <span className="px-4 py-2 rounded-full bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-xs font-bold">{t('agenticSearch')}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t('indianLangs')}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t('sovereignStack')}</span>
            </div>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('tryInBharatCta')}
              <ArrowRight size={20} />
            </Link>
          </div>

          {/* Intelligence units grid */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t('inBharatCapabilities')}</h3>
            <p className="text-gray-500 text-sm text-center max-w-xl mx-auto mb-10">{t('inBharatCapabilitiesSub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {inBharatCapabilitiesList.map(({ key, icon: Icon }) => (
                <Link
                  key={key}
                  to="/app"
                  className="group flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#FF9933]/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#FF9933] group-hover:scale-110 transition-transform">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm mb-1">{t(key)}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{t(`${key}Desc`)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* InBharat vs generic AI */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t('inBharatVsTitle')}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t('inBharatVsSub')}</p>
            <div className="overflow-x-auto rounded-2xl border border-[#30363d] bg-[#161b22]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="p-4 font-black text-white uppercase tracking-wider">Feature</th>
                    <th className="p-4 text-gray-500 font-bold">Perplexity</th>
                    <th className="p-4 text-gray-500 font-bold">ChatGPT</th>
                    <th className="p-4 text-[#FF9933] font-bold">InBharat AI</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [t('inBharatVoiceFirst'), '❌', 'Partial', '✅'],
                    [t('inBharatIndianLangs'), 'Partial', 'Partial', '✅'],
                    [t('inBharatAgentic'), '✅', 'Limited', '✅'],
                    [t('inBharatSovereignFeature'), '❌', '❌', '✅'],
                  ].map(([feat, p, c, u], i) => (
                    <tr key={i} className="border-b border-[#30363d]/50 last:border-0">
                      <td className="p-4 text-gray-300 font-medium">{feat}</td>
                      <td className="p-4 text-gray-500">{p}</td>
                      <td className="p-4 text-gray-500">{c}</td>
                      <td className="p-4 text-[#FF9933] font-semibold">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Why choose InBharat + How we work */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10 mb-16">
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Zap size={20} className="text-[#FF9933]" />
                {t('inBharatWhyChoose')}
              </h3>
              <ul className="space-y-2.5 text-gray-400 text-sm">
                {['inBharatWhy1', 'inBharatWhy2', 'inBharatWhy3', 'inBharatWhy4', 'inBharatWhy5'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Check size={16} className="text-[#FF9933] flex-shrink-0 mt-0.5" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Shield size={20} className="text-[#FF9933]" />
                {t('inBharatHowTitle')}
              </h3>
              <ul className="space-y-4 text-gray-400 text-sm">
                <li><span className="text-[#FF9933] font-bold">{t('inBharatStep1Title')}</span> — {t('inBharatStep1Desc')}</li>
                <li><span className="text-[#FF9933] font-bold">{t('inBharatStep2Title')}</span> — {t('inBharatStep2Desc')}</li>
                <li><span className="text-[#FF9933] font-bold">{t('inBharatStep3Title')}</span> — {t('inBharatStep3Desc')}</li>
              </ul>
            </div>
          </div>

          {/* InBharat Security + CTA */}
          <div className="rounded-2xl border border-[#30363d] bg-[#161b22]/80 p-6 sm:p-8 text-center">
            <h3 className="text-lg font-black text-white mb-2">{t('inBharatSecurity')}</h3>
            <p className="text-gray-500 text-sm mb-6">{t('inBharatSecuritySub')}</p>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all"
            >
              {t('tryInBharatCta')}
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ——— UniAssist.ai full section ——— */}
      <section id="uniassist" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-[#0d1117] border border-[#138808]/40 flex items-center justify-center overflow-hidden relative">
                <img src="/uniassist-logo.png" alt="UniAssist.ai" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                <span className="hidden absolute inset-0 flex items-center justify-center text-[#138808]"><GraduationCap size={32} /></span>
              </div>
            </div>
            <p className="text-[#138808] text-xs font-black uppercase tracking-[0.35em] mb-2">UniAssist.ai</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
              {t('uniAssistTagline')}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t('uniAssistHero')}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t('trustedBy')}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t('onlyLiveData')}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t('noPromptNeeded')}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t('allEducationalNeeds')}</span>
            </div>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#138808] hover:bg-[#0d6b1f] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('getStartedFree')}
              <ExternalLink size={20} />
            </a>
          </div>

          {/* Modules grid */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-8">{t('everythingYouNeed')}</h3>
            <p className="text-gray-500 text-sm text-center max-w-xl mx-auto mb-10">{t('everythingSub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {modulesList.map(({ key, icon: Icon }) => (
                <a
                  key={key}
                  href="https://www.uniassist.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#138808]/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#138808] group-hover:scale-110 transition-transform">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm mb-1">{t(key)}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{t(`${key}Desc`)}</p>
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-[#138808] uppercase tracking-wider">{t('exploreModule')} →</span>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Comparison table */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t('vsGeneric')}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t('vsSub')}</p>
            <div className="overflow-x-auto rounded-2xl border border-[#30363d] bg-[#161b22]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="p-4 font-black text-white uppercase tracking-wider">Feature</th>
                    <th className="p-4 text-gray-500 font-bold">Perplexity</th>
                    <th className="p-4 text-gray-500 font-bold">ChatGPT</th>
                    <th className="p-4 text-[#138808] font-bold">UniAssist.ai</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [t('purposeBuilt'), '❌', '❌', '✅'],
                    [t('indiaExams'), '❌', t('partial') || 'Partial', '✅'],
                    [t('studyAbroad'), '❌', t('basic') || 'Basic', '⭐'],
                    [t('whatsappBot'), '❌', '❌', '⭐'],
                    [t('pdfToNotes'), t('basic') || 'Basic', t('limited') || 'Limited', '⭐'],
                    [t('visaAssistantFeature'), '❌', '❌', '⭐'],
                    [t('schoolToPG'), '❌', '❌', '⭐'],
                  ].map(([feat, p, c, u], i) => (
                    <tr key={i} className="border-b border-[#30363d]/50 last:border-0">
                      <td className="p-4 text-gray-300 font-medium">{feat}</td>
                      <td className="p-4 text-gray-500">{p}</td>
                      <td className="p-4 text-gray-500">{c}</td>
                      <td className="p-4 text-[#138808] font-semibold">{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Why choose + How we generate */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-10 mb-16">
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Zap size={20} className="text-[#138808]" />
                {t('whyChoose')}
              </h3>
              <ul className="space-y-2.5 text-gray-400 text-sm">
                {['why1', 'why2', 'why3', 'why4', 'why5', 'why6', 'why7'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Shield size={20} className="text-[#138808]" />
                {t('howWeGenerate')}
              </h3>
              <ul className="space-y-3 text-gray-400 text-sm">
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t('realTime')}</li>
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t('verifiedSources')}</li>
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t('humanHandoff')}</li>
              </ul>
            </div>
          </div>

          {/* How it works: 3 steps */}
          <div className="mb-16">
            <h3 className="text-xl font-black text-white text-center mb-8">{t('howItWorks')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                { num: '1', title: t('step1Title'), desc: t('step1Desc') },
                { num: '2', title: t('step2Title'), desc: t('step2Desc') },
                { num: '3', title: t('step3Title'), desc: t('step3Desc') },
              ].map((step) => (
                <div key={step.num} className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#138808]/20 border border-[#138808]/40 flex items-center justify-center text-[#138808] font-black text-xl mx-auto mb-4">{step.num}</div>
                  <h4 className="text-white font-bold mb-2">{step.title}</h4>
                  <p className="text-gray-500 text-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Security + CTA */}
          <div className="rounded-2xl border border-[#30363d] bg-[#161b22]/80 p-6 sm:p-8 text-center">
            <h3 className="text-lg font-black text-white mb-2">{t('securityPrivacy')}</h3>
            <p className="text-gray-500 text-sm mb-6">{t('securitySub')}</p>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#138808] hover:bg-[#0d6b1f] text-white font-black rounded-2xl transition-all"
            >
              {t('bookDemo')}
              <ExternalLink size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ——— TestsPrep.in full section ——— */}
      <section id="testsprep" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-[#0d1117] border border-[#8b5cf6]/40 flex items-center justify-center overflow-hidden relative">
                <img src="/testsprep-logo.png" alt="TestsPrep.in" className="w-full h-full object-contain scale-150" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                <span className="hidden absolute inset-0 flex items-center justify-center text-[#8b5cf6]"><BookOpen size={32} /></span>
              </div>
            </div>
            <p className="text-[#8b5cf6] text-xs font-black uppercase tracking-[0.35em] mb-2">{t('testsprepTagline')}</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
              {t('testsprepSectionTitle')}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t('testsprepHero')}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t('trustedBy')}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="px-4 py-2 rounded-full bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#c4b5fd] text-xs font-bold">{t('testsprepFeature4')}</span>
              <span className="px-4 py-2 rounded-full bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#c4b5fd] text-xs font-bold">{t('testsprepFeature5')}</span>
              <span className="px-4 py-2 rounded-full bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#c4b5fd] text-xs font-bold">{t('testsprepFeature6')}</span>
              <span className="px-4 py-2 rounded-full bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#c4b5fd] text-xs font-bold">{t('testsprepFeature7')}</span>
            </div>
            <a
              href={t('testsprepUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('visitTestsprep')}
              <ExternalLink size={20} />
            </a>
          </div>

          {/* Immersive 3D Science Labs subsection */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-2">{t('testsprep3DLabsTitle')}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t('testsprep3DLabsSub')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <a
                href={t('testsprepUrl')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-5 sm:p-6 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#8b5cf6]/40 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#8b5cf6] mb-3">
                  <FlaskConical size={20} />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{t('testsprep3DPhysics')}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">{t('testsprep3DPhysicsDesc')}</p>
                <span className="mt-3 text-[10px] font-bold text-[#8b5cf6] uppercase tracking-wider">{t('exploreModule')} →</span>
              </a>
              <a
                href={t('testsprepUrl')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-5 sm:p-6 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#8b5cf6]/40 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#8b5cf6] mb-3">
                  <FlaskConical size={20} />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{t('testsprep3DChemistry')}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">{t('testsprep3DChemistryDesc')}</p>
                <span className="mt-3 text-[10px] font-bold text-[#8b5cf6] uppercase tracking-wider">{t('exploreModule')} →</span>
              </a>
              <a
                href={t('testsprepUrl')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-5 sm:p-6 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#8b5cf6]/40 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#8b5cf6] mb-3">
                  <FlaskConical size={20} />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{t('testsprep3DBiology')}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">{t('testsprep3DBiologyDesc')}</p>
                <span className="mt-3 text-[10px] font-bold text-[#8b5cf6] uppercase tracking-wider">{t('exploreModule')} →</span>
              </a>
            </div>
          </div>

          {/* TestsPrep features grid */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-8">{t('everythingYouNeed')}</h3>
            <p className="text-gray-500 text-sm text-center max-w-xl mx-auto mb-10">{t('everythingSub')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {testsprepFeaturesList.map(({ key, icon: Icon }) => (
                <a
                  key={key}
                  href={t('testsprepUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#8b5cf6]/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#8b5cf6] group-hover:scale-110 transition-transform">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm mb-1">{t(key)}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{t(`${key}Desc`)}</p>
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-[#8b5cf6] uppercase tracking-wider">{t('exploreModule')} →</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ——— UniBot full section ——— */}
      <section id="unibot" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-[#0d1117] border border-[#3b82f6]/40 flex items-center justify-center overflow-hidden relative">
                <img src="/unibot-logo.png" alt="UniBot" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                <span className="hidden absolute inset-0 flex items-center justify-center text-[#3b82f6]"><MessageCircle size={32} /></span>
              </div>
            </div>
            <p className="text-[#3b82f6] text-xs font-black uppercase tracking-[0.35em] mb-2">UniBot</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
              {t('unibotTagline')}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t('unibotHero')}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t('unibotTrust')}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t('unibotPill1')}</span>
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t('unibotPill2')}</span>
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t('unibotPill3')}</span>
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t('unibotPill4')}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 text-left">
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
                <h3 className="text-lg font-black text-white mb-3 flex items-center gap-2">
                  <MessageCircle size={20} className="text-[#3b82f6]" />
                  {t('unibotWhy')}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t('unibotWhyDesc')}</p>
              </div>
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
                <h3 className="text-lg font-black text-white mb-3">{t('howItWorks')}</h3>
                <ol className="space-y-2 text-gray-400 text-sm">
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">1.</span> {t('unibotHow1')}</li>
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">2.</span> {t('unibotHow2')}</li>
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">3.</span> {t('unibotHow3')}</li>
                </ol>
                <p className="text-gray-500 text-xs mt-4">{t('unibotWho')}</p>
              </div>
            </div>
            <a
              href={t('unibotWhatsAppUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('chatUniBot')}
              <ExternalLink size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* ——— OpenClawFix full section ——— */}
      <section id="openclawfix" className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-2xl bg-[#0d1117] border border-[#14b8a6]/40 flex items-center justify-center overflow-hidden relative">
                <img src="/openclawfix-logo.png" alt="OpenClawFix" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; const next = e.currentTarget.nextElementSibling as HTMLElement; if (next) next.classList.remove('hidden'); }} />
                <span className="hidden absolute inset-0 flex items-center justify-center text-[#14b8a6]"><Wrench size={32} /></span>
              </div>
            </div>
            <p className="text-[#14b8a6] text-xs font-black uppercase tracking-[0.35em] mb-2">OpenClawFix</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
              {t('openClawFixFullTagline')}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
              {t('openClawFixFullIntro')}
            </p>
            <a
              href={t('openClawFixUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('openClawFixCtaFull')}
              <ExternalLink size={20} />
            </a>
          </div>

          {/* What OpenClawFix does */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-8">{t('openClawFixWhatTitle')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {[
                { icon: Box, key: 'openClawFixWhat1' },
                { icon: FileCode, key: 'openClawFixWhat2' },
                { icon: Key, key: 'openClawFixWhat3' },
                { icon: FileCode, key: 'openClawFixWhat4' },
                { icon: Bot, key: 'openClawFixWhat5' },
                { icon: Terminal, key: 'openClawFixWhat6' },
                { icon: Send, key: 'openClawFixWhat7' },
                { icon: ListChecks, key: 'openClawFixWhat8' },
              ].map(({ icon: Icon, key }) => (
                <a
                  key={key}
                  href={t('openClawFixUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-4 sm:p-5 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#14b8a6]/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#14b8a6] group-hover:scale-110 transition-transform flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{t(key)}</p>
                </a>
              ))}
            </div>
          </div>

          {/* OpenClawFix vs Manual */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t('openClawFixVsTitle')}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t('openClawFixVsSub')}</p>
            <div className="overflow-x-auto rounded-2xl border border-[#30363d] bg-[#161b22]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="p-4 font-black text-white uppercase tracking-wider">{t('openClawFixVsFeature')}</th>
                    <th className="p-4 text-[#14b8a6] font-bold">{t('openClawFixVsOpenClawFix')}</th>
                    <th className="p-4 text-gray-500 font-bold">{t('openClawFixVsManual')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [t('openClawFixVsTime'), t('openClawFixVsTimeVal'), t('openClawFixVsTimeManual')],
                    [t('openClawFixVsDocker'), '✅ Automatic', '❌ Manual'],
                    [t('openClawFixVsToken'), '✅ Auto-generated', '❌ Manual config'],
                    [t('openClawFixVsError'), '✅ Auto-fix', '❌ Debug yourself'],
                    [t('openClawFixVsPlatform'), '✅ Win/Mac/Linux', '⚠️ Complex steps'],
                    [t('openClawFixVsUpdates'), '✅ One command', '❌ Manual git pull'],
                    [t('openClawFixVsSupport'), 'Community', 'Community'],
                  ].map(([feat, openClaw, manual], i) => (
                    <tr key={i} className="border-b border-[#30363d]/50 last:border-0">
                      <td className="p-4 text-gray-300 font-medium">{feat}</td>
                      <td className="p-4 text-[#14b8a6] font-semibold">{openClaw}</td>
                      <td className="p-4 text-gray-500">{manual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-center text-gray-500 text-sm mt-4">
              {t('openClawFixPrice')} · <a href={t('openClawFixUrl')} target="_blank" rel="noopener noreferrer" className="text-[#14b8a6] hover:underline font-semibold">{t('openClawFixCtaFull')}</a>
            </p>
          </div>

          <div className="text-center">
            <a
              href={t('openClawFixUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t('visitOpenClawFix')}
              <ExternalLink size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* Built for India */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 border-t border-[#30363d]/30 bg-[#0d1117]/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10">
            {t('builtForIndia')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { key: 'voiceAI', icon: Mic },
              { key: 'agenticSearch', icon: Search },
              { key: 'indianLangs', icon: Globe },
              { key: 'sovereignStack', icon: Sparkles },
            ].map(({ key, icon: Icon }) => (
              <div key={key} className="flex flex-col items-center text-center p-4 rounded-2xl bg-[#161b22] border border-[#30363d]">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#FF9933] mb-3">
                  <Icon size={24} />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{t(key)}</h4>
                <p className="text-gray-500 text-xs">{t(`${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-10 px-4 sm:px-6 border-t border-[#30363d]/30">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TricolourStar size={24} />
            <span className="font-black italic text-white">InBharat</span>
          </div>
          <p className="text-gray-500 text-xs text-center sm:text-left">{t('footerJourney')}</p>
          <div className="flex items-center gap-6 text-sm flex-wrap justify-center">
            <Link to="/app" className="text-gray-400 hover:text-white transition-colors">
              {t('footerInBharat')}
            </Link>
            <a href="https://www.uniassist.ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              {t('footerUniAssist')}
            </a>
            <a href={t('testsprepUrl')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              {t('footerTestsprep')}
            </a>
            <a href={t('unibotWhatsAppUrl')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              {t('footerUniBot')}
            </a>
            <a href={t('openClawFixUrl')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              <img src="/openclawfix-logo.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              {t('footerOpenClawFix')}
            </a>
          </div>
        </div>
        <p className="text-center text-gray-600 text-xs mt-4">{t('copyright')}</p>
      </footer>
    </div>
  );
};

export default Landing;
