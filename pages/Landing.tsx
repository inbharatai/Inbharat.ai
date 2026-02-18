import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import TricolourStar from '../components/TricolourStar';
import {
  Sparkles, Mic, Search, Globe, ArrowRight, ExternalLink, Check, BookOpen,
  GraduationCap, FileCheck, MapPin, Wallet, Briefcase, Heart, MessageCircle,
  Zap, Shield, Terminal, ShoppingBag, Wrench, Box, Key, FileCode, Bot, Send, ListChecks
} from 'lucide-react';

const copy: Record<string, string> = {
  tryInBharat: 'Try InBharat AI',
    exploreUniAssist: 'Explore UniAssist.ai',
    ourProducts: 'Our products',
    builtForIndia: 'Built for India',
    sovereignty: 'SOVEREIGN INTELLIGENCE FOR BHARAT',
    deshKaai: 'DESH KAAI',
    heroSub: 'We build sovereign AI for India. InBharat AI—agentic search and voice-first intelligence for every Indian. UniAssist.ai—the only education platform built on live data for every Indian Student. UniBot—your WhatsApp education assistant.',
    inBharatDesc: 'Agentic search and reasoning for Bharat. Voice AI, research and creative modes, multi-language support—sovereign intelligence in one place.',
    useInBharat: 'Use InBharat AI',
    uniAssistTagline: 'Simplifying Education with AI',
    uniAssistSubline: 'Live data, no prompts—education only',
    uniAssistHero: 'Your AI co-pilot for your entire education journey—from application to graduation and beyond. The only platform built on accurate live data. No prompts to type. Every educational need, one place.',
    getStartedFree: 'Get Started for Free',
    trustedBy: 'Trusted by students, counsellors, and educators across leading universities worldwide.',
    onlyLiveData: 'The only educational app built on accurate live data',
    noPromptNeeded: 'No prompt needed—students get guidance without typing',
    allEducationalNeeds: 'The only app that caters to every educational need',
    everythingYouNeed: 'Everything you need to succeed',
    everythingSub: 'A comprehensive AI-powered suite for every student, educator, and counsellor.',
    universityFinder: 'University Finder',
    universityFinderDesc: 'Smart shortlists by grades, budget, goals. Compare courses, intakes, fees, deadlines.',
    profileMentor: 'Profile Mentor',
    profileMentorDesc: 'Standout profile plans: projects, internships, achievements, leadership.',
    aiTestPrep: 'AI Test Prep',
    aiTestPrepDesc: 'Unlimited adaptive mocks and drills—JEE, NEET, CUET & abroad. Instant feedback.',
    diagnosticTests: 'Diagnostic Tests',
    diagnosticTestsDesc: 'Pinpoint strengths and gaps. Personalized action plan in minutes.',
    visaAssistant: 'Visa Assistant',
    visaAssistantDesc: 'Country checklists, document templates, timelines. No surprises.',
    scholarships: 'Scholarships',
    scholarshipsDesc: 'Match scholarships to your profile and deadlines. Filter by country, course, budget.',
    jobPredictor: 'Job Market Predictor',
    jobPredictorDesc: 'Skill demand, salary bands, PR pathways. Data-backed career mapping.',
    studyTools: 'Study Tools',
    studyToolsDesc: 'Notes, PPTX, podcasts, summaries, auto quizzes from books or lectures.',
    wellnessSupport: 'Wellness Support',
    wellnessSupportDesc: 'Private AI check-ins, mood tracking, campus resources. Stay balanced.',
    uniBot: 'UniBot (WhatsApp)',
    uniBotDesc: 'Multilingual WhatsApp mentor 24×7—diagnostics, essays, SOPs, visas, scholarships, instant Q&A.',
    exploreModule: 'Explore',
    aboutUniAssist: 'About UniAssist.ai',
    aboutSub: 'Real-time, unbiased, always-on. Not a chatbot—a complete AI ecosystem for Indian students, parents, and institutes.',
    mission: 'Our Mission',
    missionUnbiased: 'Unbiased & always-on — 24×7 guidance, no sales bias.',
    missionPersonalized: 'Personalized & adaptive — plans by goals, grades, budget, timeline.',
    missionEndToEnd: 'End-to-end journey — discovery, prep, applications, visas, careers.',
    missionHuman: 'Human-augmented — complements counsellors, catches what busy teams miss.',
    atAGlance: 'At a glance',
    modulesCount: '11+ AI modules — Finder, Mentor, Test Prep, Visa, Scholarships & more.',
    unibot24: 'UniBot on WhatsApp 24×7 — multilingual, instant help.',
    privacyFirst: 'Privacy-first — you control data, exports, sharing.',
    noStaticDb: 'No static database — answers from current sources, live.',
    vsGeneric: 'UniAssist.ai vs generic AI',
    vsSub: 'Built only for education—exams, study abroad, PR, careers, school to PG.',
    purposeBuilt: 'Education-specific',
    indiaExams: 'India exams (JEE, NEET, CUET)',
    studyAbroad: 'Study abroad + PR + jobs',
    whatsappBot: 'WhatsApp learning bot',
    pdfToNotes: 'PDF/Book → Notes & tests',
    visaAssistantFeature: 'Visa assistant',
    schoolToPG: 'School to PG roadmap',
    whyChoose: 'Why students choose UniAssist.ai',
    why1: 'Built only for education—not a generic chatbot.',
    why2: 'Deep support for Indian exams: JEE, NEET, CUET & more.',
    why3: 'Study abroad + PR + jobs—all in one AI.',
    why4: 'Multilingual WhatsApp UniBot for students & parents.',
    why5: 'Books, PDFs & screenshots → notes, tests, mind maps.',
    why6: 'Roadmaps from Class 9 to Postgraduate.',
    why7: 'Better context than Perplexity or ChatGPT for students.',
    howWeGenerate: 'How we generate answers',
    realTime: 'Real-time AI — outputs on the fly, not from a stored database.',
    verifiedSources: 'Verified sources — we cite official references when needed.',
    humanHandoff: 'Human handoff — complex cases route to mentors on request.',
    bookDemo: 'Book a Live Demo',
    howItWorks: 'How it works',
    step1Title: 'Tell us about you',
    step1Desc: 'Build a quick profile: academic background, interests, aspirations.',
    step2Title: 'AI narrows your options',
    step2Desc: 'Best-fit universities, courses, scholarships, exam prep—instantly.',
    step3Title: 'Decide with confidence',
    step3Desc: 'SOPs, LORs, visa checklists. Career and residency insights.',
    securityPrivacy: 'Security & privacy',
    securitySub: 'You are in control. We are transparent.',
    visitUniAssist: 'Visit UniAssist.ai',
    voiceAI: 'Voice AI',
    voiceAIDesc: 'Speak in your language; get answers in-app.',
    agenticSearch: 'Agentic search',
    agenticSearchDesc: 'Research, creative, and coding modes.',
    indianLangs: 'Indian languages',
    indianLangsDesc: 'Hindi, Tamil, Telugu, and more.',
    sovereignStack: 'Sovereign stack',
    sovereignStackDesc: 'AI built for Bharat, by builders here.',
    footerJourney: 'AI for Every Indian.',
    footerInBharat: 'InBharat AI',
    footerUniAssist: 'UniAssist.ai',
    footerUniBot: 'UniBot',
    copyright: '© 2025 InBharat — Sovereign AI for Bharat.',
    unibotTagline: 'UniBot — Your WhatsApp Education Assistant',
    unibotSubline: 'Education-only AI on WhatsApp',
    unibotHero: 'Ask anything about education on WhatsApp. Send voice notes or scan book pages for instant help. Mini diagnostics and multiple languages. A focused education companion, not a general chatbot.',
    unibotBullet1: 'Education-only AI — career guidance, exam prep, admissions, scholarships',
    unibotBullet2: 'Voice notes & OCR — speak or scan books and screenshots, get instant guidance and steps',
    unibotBullet3: 'Mini diagnostic tests & multilingual — assess your level and learn in your preferred language',
    unibotBullet4: 'Mini diagnostic tests in chat — understand level, gaps, next steps',
    unibotBullet5: 'Multilingual — learn in the language you prefer',
    chatUniBot: 'Chat with UniBot on WhatsApp',
    unibotWhatsAppUrl: 'https://wa.me/15558698916',
    visitUniBot: 'Chat with UniBot',
    unibotWhy: 'Built only for education',
    unibotWhyDesc: 'UniBot talks only about education—career guidance, stream selection, exam prep, study plans, admissions, and learning support. No distractions, no irrelevant answers.',
    unibotHow1: 'Open WhatsApp & message UniBot',
    unibotHow2: 'Ask a question / take a mini test / send a voice note / upload a photo',
    unibotHow3: 'Get instant answers and guidance',
    unibotWho: 'Perfect for students (Class 9–PG), parents, schools, and counsellors',
    unibotTrust: 'Not a general chatbot. A focused education companion.',
    unibotCta: 'Start learning with UniBot',
    openClawFixTagline: 'OpenClawFix',
    openClawFixSubline: 'ONE-CLICK OPENCLAW INSTALLER',
    openClawFixCardIntro: 'The easiest way to install OpenClaw on your system. Automated Docker setup, gateway token config, and AI provider guidance—get running in 3–5 minutes.',
    openClawFixBullet1: 'One-click installation with auto gateway token configuration',
    openClawFixBullet2: 'Docker setup, clone, config files, and platform pairing in one flow',
    openClawFixBullet3: 'First 500 users FREE; then one-time $3.99. PayPal & Razorpay (UPI)',
    visitOpenClawFix: 'Start Setup',
    openClawFixUrl: 'https://www.openclawfix.pro',
    openClawFixFullTagline: 'The easiest way to install OpenClaw',
    openClawFixFullIntro: 'OpenClawFix automates the full OpenClaw setup—Docker, clone from GitHub, gateway token, config files, and AI provider (OpenAI/Anthropic/Gemini). Get your personal AI assistant on WhatsApp, Telegram, Discord, or Slack in 3–5 minutes instead of hours.',
    openClawFixWhatTitle: 'What OpenClawFix does',
    openClawFixWhat1: 'Docker setup — checks Docker, installs if needed, starts daemon',
    openClawFixWhat2: 'Clone OpenClaw — downloads from GitHub, handles updates',
    openClawFixWhat3: 'Gateway token — auto-generates and configures secure token',
    openClawFixWhat4: 'Config files — creates openclaw.json with proper settings',
    openClawFixWhat5: 'AI provider — guides through OpenAI/Anthropic/Gemini setup',
    openClawFixWhat6: 'Docker build — runs docker-setup.sh or docker-compose',
    openClawFixWhat7: 'Platform pairing — shows how to connect WhatsApp/Telegram/Discord',
    openClawFixWhat8: 'Next steps — provides dashboard URL with token included',
    openClawFixVsTitle: 'OpenClawFix vs manual installation',
    openClawFixVsSub: 'Save hours of frustration with our automated installer',
    openClawFixVsFeature: 'Feature',
    openClawFixVsOpenClawFix: 'OpenClawFix',
    openClawFixVsManual: 'Manual',
    openClawFixVsTime: 'Installation time',
    openClawFixVsTimeVal: '3–5 minutes',
    openClawFixVsTimeManual: '2–4 hours',
    openClawFixVsDocker: 'Docker setup',
    openClawFixVsToken: 'Gateway token',
    openClawFixVsError: 'Error handling',
    openClawFixVsPlatform: 'Platform support',
    openClawFixVsUpdates: 'Updates',
    openClawFixVsSupport: 'Support',
    openClawFixPrice: '$3.99 one-time',
    openClawFixCtaFull: 'Start Installation',
    footerOpenClawFix: 'OpenClawFix',
    partial: 'Partial',
    basic: 'Basic',
    limited: 'Limited',
  inBharatTagline: 'Desh Ka Ai',
  inBharatSubline: 'Sovereign Intelligence For B H A R A T',
  inBharatSectionIntro: 'InBharat AI is sovereign intelligence built for Bharat—agentic search, voice-first interaction, and multi-language support in one place.',
  inBharatBullet1: 'Agentic search—research, creative, and coding modes with verified sources',
  inBharatBullet2: 'Voice-first—speak in any Indian language, get answers with Listen and Live',
  inBharatBullet3: 'Sovereign stack—built for Bharat, your data and control stay in India',
  inBharatVoice: 'Voice-first',
  inBharatVoiceDesc: 'Speak in any Indian language; get answers with Listen and Live mode.',
  inBharatSearch: 'Agentic search',
  inBharatSearchDesc: 'Research, creative, coder, and browser modes with verified sources.',
  inBharatSovereign: 'Sovereign stack',
  inBharatSovereignDesc: 'Built for India, by builders here. Your data, your control.',
  inBharatTrustedBy: 'Voice-first, multi-language AI for Bharat—search, create, and reason in one place.',
  inBharatCapabilities: 'Intelligence units',
  inBharatCapabilitiesSub: 'Switch modes to get the right kind of answer—research, creative, code, or real-time web.',
  inBharatStandard: 'Standard',
  inBharatStandardDesc: 'General chat and reasoning in your language.',
  inBharatResearch: 'Research',
  inBharatResearchDesc: 'Deep search with verified sources and citations.',
  inBharatCoder: 'Coder',
  inBharatCoderDesc: 'Code help, logic, and technical answers.',
  inBharatEducator: 'Educator',
  inBharatEducatorDesc: 'Learning support and explanations.',
  inBharatBrowser: 'Browser',
  inBharatBrowserDesc: 'Real-time web search and current information.',
  inBharatExecutive: 'Executive',
  inBharatExecutiveDesc: 'Plans, emails, and productivity.',
  inBharatShopper: 'Shopper',
  inBharatShopperDesc: 'Product discovery and comparisons.',
  inBharatVsTitle: 'InBharat AI vs generic AI',
  inBharatVsSub: 'Sovereign, voice-first, and built for Indian languages.',
  inBharatVoiceFirst: 'Voice-first (Speak & Listen)',
  inBharatIndianLangs: 'Indian languages',
  inBharatAgentic: 'Agentic search + modes',
  inBharatSovereignFeature: 'Sovereign stack',
  inBharatWhyChoose: 'Why choose InBharat AI',
  inBharatWhy1: 'Voice in and out—speak to ask, listen to replies.',
  inBharatWhy2: 'Multiple intelligence modes—research, coder, educator, browser.',
  inBharatWhy3: 'Indian languages—Hindi, Tamil, Telugu, and more.',
  inBharatWhy4: 'Verified sources and follow-up questions.',
  inBharatWhy5: 'Built for Bharat—sovereign and privacy-aware.',
  inBharatHowTitle: 'How it works',
  inBharatStep1Title: 'Ask or speak',
  inBharatStep1Desc: 'Type your question or use Speak to type; attach images if you like.',
  inBharatStep2Title: 'AI reasons',
  inBharatStep2Desc: 'InBharat searches, reasons, and cites sources by mode.',
  inBharatStep3Title: 'Read or listen',
  inBharatStep3Desc: 'Get the answer in text; tap Listen for voice playback.',
  inBharatSecurity: 'Security & privacy',
  inBharatSecuritySub: 'Your conversations stay in your control. We do not train on your data.',
  tryInBharatCta: 'Try InBharat AI',
};

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

declare global {
  interface Window {
    google?: { translate: { TranslateElement: new (options: unknown, id: string) => void; TranslateElement: { InlineLayout: { SIMPLE: number } } } };
    googleTranslateElementInit?: () => void;
  }
}

const Landing: React.FC = () => {
  const t = copy;

  useEffect(() => {
    if (document.getElementById('google-translate-script')) return;
    window.googleTranslateElementInit = () => {
      if (window.google?.translate?.TranslateElement && document.getElementById('google_translate_element')) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: 'en,hi,ta,te,ml,kn,bn,mr,gu,pa,or,as,ur',
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
          },
          'google_translate_element'
        );
      }
    };
    const script = document.createElement('script');
    script.id = 'google-translate-script';
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans overflow-x-hidden">
      {/* Top bar: Google Translate for any Indian language */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-4 py-3 bg-[#0d1117]/90 backdrop-blur-md border-b border-[#30363d]/30">
        <div className="flex items-center gap-3">
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-4 py-2 rounded-xl bg-[#161b22] border border-[#30363d] text-gray-300 hover:text-white hover:border-[#FF9933]/50 text-sm font-bold transition-all">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mr-2">Translate / भाषा</span>
          <div id="google_translate_element" className="[&_.goog-te-banner]:!hidden [&_.skiptranslate]:!hidden" />
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
              <span>S O V E R E I G N</span>
              <span>I N T E L L I G E N C E</span>
            </span>
            <span className="tracking-[0.15em] sm:tracking-[0.25em]">F O R</span>
            <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent tracking-[0.15em] sm:tracking-[0.25em] pr-1">B H A R A T</span>
          </p>
          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-6 leading-relaxed">
            {t.heroSub}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all shadow-lg hover:shadow-[#FF9933]/20 active:scale-[0.98]"
            >
              {t.tryInBharat}
              <ArrowRight size={18} />
            </Link>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#161b22] border border-[#30363d] hover:border-[#138808]/50 text-gray-300 hover:text-white font-bold rounded-2xl transition-all"
            >
              {t.exploreUniAssist}
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </header>

      {/* Products: InBharat + UniAssist + UniBot cards — uniform height, typography, spacing */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 border-t border-[#30363d]/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10 sm:mb-12">
            {t.ourProducts}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {/* Desh Ka AI */}
            <div className="h-full flex flex-col bg-[#161b22] border border-[#FF9933]/40 rounded-2xl p-7 shadow-lg ring-1 ring-[#FF9933]/20">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center flex-shrink-0">
                  <TricolourStar size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white leading-tight">{t.inBharatTagline}</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t.inBharatSubline}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t.inBharatSectionIntro}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.inBharatBullet1}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.inBharatBullet2}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#FF9933] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.inBharatBullet3}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <Link
                  to="/app"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#FF9933] hover:bg-[#e88a2b] text-white font-bold transition-all"
                >
                  {t.useInBharat}
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
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t.uniAssistSubline}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t.uniAssistHero}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.onlyLiveData}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.noPromptNeeded}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#138808] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.allEducationalNeeds}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href="https://www.uniassist.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-[#138808]/50 text-gray-300 hover:text-white font-bold transition-all"
                >
                  {t.visitUniAssist}
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
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t.unibotSubline}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t.unibotHero}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.unibotBullet1}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.unibotBullet2}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#3b82f6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.unibotBullet3}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href={t.unibotWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold transition-all"
                >
                  {t.chatUniBot}
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
                  <h3 className="text-xl font-black text-white leading-tight">{t.openClawFixTagline}</h3>
                  <p className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mt-0.5">{t.openClawFixSubline}</p>
                </div>
              </div>
              <p className="product-card-desc text-gray-400 text-sm sm:text-base mt-4 opacity-90">
                {t.openClawFixCardIntro}
              </p>
              <ul className="product-card-list mt-4 flex flex-col gap-2.5 text-gray-500 text-xs sm:text-sm">
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.openClawFixBullet1}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.openClawFixBullet2}</span></li>
                <li className="flex items-start gap-2.5"><Check size={14} className="text-[#14b8a6] flex-shrink-0 mt-0.5" /><span className="product-card-bullet-text">{t.openClawFixBullet3}</span></li>
              </ul>
              <div className="mt-auto pt-5">
                <a
                  href={t.openClawFixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold transition-all"
                >
                  {t.visitOpenClawFix}
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— InBharat AI full section (like UniAssist) ——— */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e12] to-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-black border-2 border-[#30363d] flex items-center justify-center">
                <TricolourStar size={40} />
              </div>
            </div>
            <p className="text-[#FF9933] text-xs font-black uppercase tracking-[0.35em] mb-2">InBharat AI</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-2">
              {t.inBharatTagline}
            </h2>
            <p className="text-[9px] sm:text-[10px] font-medium uppercase text-gray-500 mb-4 flex flex-col items-center justify-center gap-y-0.5">
              <span className="tracking-[0.15em] flex flex-wrap items-center justify-center gap-x-3">
                <span>S O V E R E I G N</span>
                <span>I N T E L L I G E N C E</span>
              </span>
              <span className="tracking-[0.15em]">F O R</span>
              <span className="inline-block bg-gradient-to-r from-[#FF9933] via-white to-[#138808] bg-clip-text text-transparent tracking-[0.15em] pr-1">B H A R A T</span>
            </p>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t.inBharatSectionIntro}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t.inBharatTrustedBy}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="px-4 py-2 rounded-full bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-xs font-bold">{t.voiceAI}</span>
              <span className="px-4 py-2 rounded-full bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-xs font-bold">{t.agenticSearch}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t.indianLangs}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t.sovereignStack}</span>
            </div>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t.tryInBharatCta}
              <ArrowRight size={20} />
            </Link>
          </div>

          {/* Intelligence units grid */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t.inBharatCapabilities}</h3>
            <p className="text-gray-500 text-sm text-center max-w-xl mx-auto mb-10">{t.inBharatCapabilitiesSub}</p>
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
                    <h4 className="text-white font-bold text-sm mb-1">{t[key]}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{t[`${key}Desc`]}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* InBharat vs generic AI */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t.inBharatVsTitle}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t.inBharatVsSub}</p>
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
                    [t.inBharatVoiceFirst, '❌', 'Partial', '✅'],
                    [t.inBharatIndianLangs, 'Partial', 'Partial', '✅'],
                    [t.inBharatAgentic, '✅', 'Limited', '✅'],
                    [t.inBharatSovereignFeature, '❌', '❌', '✅'],
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
                {t.inBharatWhyChoose}
              </h3>
              <ul className="space-y-2.5 text-gray-400 text-sm">
                {['inBharatWhy1', 'inBharatWhy2', 'inBharatWhy3', 'inBharatWhy4', 'inBharatWhy5'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Check size={16} className="text-[#FF9933] flex-shrink-0 mt-0.5" />
                    {t[k]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Shield size={20} className="text-[#FF9933]" />
                {t.inBharatHowTitle}
              </h3>
              <ul className="space-y-4 text-gray-400 text-sm">
                <li><span className="text-[#FF9933] font-bold">{t.inBharatStep1Title}</span> — {t.inBharatStep1Desc}</li>
                <li><span className="text-[#FF9933] font-bold">{t.inBharatStep2Title}</span> — {t.inBharatStep2Desc}</li>
                <li><span className="text-[#FF9933] font-bold">{t.inBharatStep3Title}</span> — {t.inBharatStep3Desc}</li>
              </ul>
            </div>
          </div>

          {/* InBharat: 3 steps */}
          <div className="mb-16">
            <h3 className="text-xl font-black text-white text-center mb-8">{t.inBharatHowTitle}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                { num: '1', title: t.inBharatStep1Title, desc: t.inBharatStep1Desc },
                { num: '2', title: t.inBharatStep2Title, desc: t.inBharatStep2Desc },
                { num: '3', title: t.inBharatStep3Title, desc: t.inBharatStep3Desc },
              ].map((step) => (
                <div key={step.num} className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#FF9933]/20 border border-[#FF9933]/40 flex items-center justify-center text-[#FF9933] font-black text-xl mx-auto mb-4">{step.num}</div>
                  <h4 className="text-white font-bold mb-2">{step.title}</h4>
                  <p className="text-gray-500 text-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* InBharat Security + CTA */}
          <div className="rounded-2xl border border-[#30363d] bg-[#161b22]/80 p-6 sm:p-8 text-center">
            <h3 className="text-lg font-black text-white mb-2">{t.inBharatSecurity}</h3>
            <p className="text-gray-500 text-sm mb-6">{t.inBharatSecuritySub}</p>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF9933] hover:bg-[#e88a2b] text-white font-black rounded-2xl transition-all"
            >
              {t.tryInBharatCta}
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ——— UniAssist.ai full section ——— */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
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
              {t.uniAssistTagline}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t.uniAssistHero}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t.trustedBy}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t.onlyLiveData}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t.noPromptNeeded}</span>
              <span className="px-4 py-2 rounded-full bg-[#138808]/15 border border-[#138808]/40 text-[#86efac] text-xs font-bold">{t.allEducationalNeeds}</span>
            </div>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#138808] hover:bg-[#0d6b1f] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t.getStartedFree}
              <ExternalLink size={20} />
            </a>
          </div>

          {/* Modules grid */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-8">{t.everythingYouNeed}</h3>
            <p className="text-gray-500 text-sm text-center max-w-xl mx-auto mb-10">{t.everythingSub}</p>
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
                    <h4 className="text-white font-bold text-sm mb-1">{t[key]}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{t[`${key}Desc`]}</p>
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-[#138808] uppercase tracking-wider">{t.exploreModule} →</span>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Comparison table */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t.vsGeneric}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t.vsSub}</p>
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
                    [t.purposeBuilt, '❌', '❌', '✅'],
                    [t.indiaExams, '❌', t.partial || 'Partial', '✅'],
                    [t.studyAbroad, '❌', t.basic || 'Basic', '⭐'],
                    [t.whatsappBot, '❌', '❌', '⭐'],
                    [t.pdfToNotes, t.basic || 'Basic', t.limited || 'Limited', '⭐'],
                    [t.visaAssistantFeature, '❌', '❌', '⭐'],
                    [t.schoolToPG, '❌', '❌', '⭐'],
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
                {t.whyChoose}
              </h3>
              <ul className="space-y-2.5 text-gray-400 text-sm">
                {['why1', 'why2', 'why3', 'why4', 'why5', 'why6', 'why7'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" />
                    {t[k]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <Shield size={20} className="text-[#138808]" />
                {t.howWeGenerate}
              </h3>
              <ul className="space-y-3 text-gray-400 text-sm">
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t.realTime}</li>
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t.verifiedSources}</li>
                <li className="flex items-start gap-2"><Check size={16} className="text-[#138808] flex-shrink-0 mt-0.5" /> {t.humanHandoff}</li>
              </ul>
            </div>
          </div>

          {/* How it works: 3 steps */}
          <div className="mb-16">
            <h3 className="text-xl font-black text-white text-center mb-8">{t.howItWorks}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                { num: '1', title: t.step1Title, desc: t.step1Desc },
                { num: '2', title: t.step2Title, desc: t.step2Desc },
                { num: '3', title: t.step3Title, desc: t.step3Desc },
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
            <h3 className="text-lg font-black text-white mb-2">{t.securityPrivacy}</h3>
            <p className="text-gray-500 text-sm mb-6">{t.securitySub}</p>
            <a
              href="https://www.uniassist.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#138808] hover:bg-[#0d6b1f] text-white font-black rounded-2xl transition-all"
            >
              {t.bookDemo}
              <ExternalLink size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ——— UniBot full section ——— */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
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
              {t.unibotTagline}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
              {t.unibotHero}
            </p>
            <p className="text-gray-500 text-sm mb-8">{t.unibotTrust}</p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t.unibotBullet1}</span>
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t.unibotBullet2}</span>
              <span className="px-4 py-2 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#93c5fd] text-xs font-bold">{t.unibotBullet3}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 text-left">
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
                <h3 className="text-lg font-black text-white mb-3 flex items-center gap-2">
                  <MessageCircle size={20} className="text-[#3b82f6]" />
                  {t.unibotWhy}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t.unibotWhyDesc}</p>
              </div>
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 sm:p-8">
                <h3 className="text-lg font-black text-white mb-3">{t.howItWorks}</h3>
                <ol className="space-y-2 text-gray-400 text-sm">
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">1.</span> {t.unibotHow1}</li>
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">2.</span> {t.unibotHow2}</li>
                  <li className="flex items-start gap-2"><span className="text-[#3b82f6] font-bold">3.</span> {t.unibotHow3}</li>
                </ol>
                <p className="text-gray-500 text-xs mt-4">{t.unibotWho}</p>
              </div>
            </div>
            <a
              href={t.unibotWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t.chatUniBot}
              <ExternalLink size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* ——— OpenClawFix full section ——— */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#30363d]/30 bg-gradient-to-b from-[#0d1117] via-[#0a0e14] to-[#0d1117]">
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
              {t.openClawFixFullTagline}
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
              {t.openClawFixFullIntro}
            </p>
            <a
              href={t.openClawFixUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t.openClawFixCtaFull}
              <ExternalLink size={20} />
            </a>
          </div>

          {/* What OpenClawFix does */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-8">{t.openClawFixWhatTitle}</h3>
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
                  href={t.openClawFixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-4 sm:p-5 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#14b8a6]/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[#14b8a6] group-hover:scale-110 transition-transform flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{t[key]}</p>
                </a>
              ))}
            </div>
          </div>

          {/* OpenClawFix vs Manual */}
          <div className="mb-16 sm:mb-20">
            <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4">{t.openClawFixVsTitle}</h3>
            <p className="text-gray-500 text-sm text-center mb-8">{t.openClawFixVsSub}</p>
            <div className="overflow-x-auto rounded-2xl border border-[#30363d] bg-[#161b22]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="p-4 font-black text-white uppercase tracking-wider">{t.openClawFixVsFeature}</th>
                    <th className="p-4 text-[#14b8a6] font-bold">{t.openClawFixVsOpenClawFix}</th>
                    <th className="p-4 text-gray-500 font-bold">{t.openClawFixVsManual}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [t.openClawFixVsTime, t.openClawFixVsTimeVal, t.openClawFixVsTimeManual],
                    [t.openClawFixVsDocker, '✅ Automatic', '❌ Manual'],
                    [t.openClawFixVsToken, '✅ Auto-generated', '❌ Manual config'],
                    [t.openClawFixVsError, '✅ Auto-fix', '❌ Debug yourself'],
                    [t.openClawFixVsPlatform, '✅ Win/Mac/Linux', '⚠️ Complex steps'],
                    [t.openClawFixVsUpdates, '✅ One command', '❌ Manual git pull'],
                    [t.openClawFixVsSupport, 'Community', 'Community'],
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
              {t.openClawFixPrice} · <a href={t.openClawFixUrl} target="_blank" rel="noopener noreferrer" className="text-[#14b8a6] hover:underline font-semibold">{t.openClawFixCtaFull}</a>
            </p>
          </div>

          <div className="text-center">
            <a
              href={t.openClawFixUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#14b8a6] hover:bg-[#0d9488] text-white font-black rounded-2xl transition-all shadow-lg"
            >
              {t.visitOpenClawFix}
              <ExternalLink size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* Built for India */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 border-t border-[#30363d]/30 bg-[#0d1117]/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10">
            {t.builtForIndia}
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
                <h4 className="text-white font-bold text-sm mb-1">{t[key]}</h4>
                <p className="text-gray-500 text-xs">{t[`${key}Desc`]}</p>
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
          <p className="text-gray-500 text-xs text-center sm:text-left">{t.footerJourney}</p>
          <div className="flex items-center gap-6 text-sm flex-wrap justify-center">
            <Link to="/app" className="text-gray-400 hover:text-white transition-colors">
              {t.footerInBharat}
            </Link>
            <a href="https://www.uniassist.ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              {t.footerUniAssist}
            </a>
            <a href={t.unibotWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              {t.footerUniBot}
            </a>
            <a href={t.openClawFixUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              <img src="/openclawfix-logo.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              {t.footerOpenClawFix}
            </a>
          </div>
        </div>
        <p className="text-center text-gray-600 text-xs mt-4">{t.copyright}</p>
      </footer>
    </div>
  );
};

export default Landing;
