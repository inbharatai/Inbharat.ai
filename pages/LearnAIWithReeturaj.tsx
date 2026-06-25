import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  Clock,
  GraduationCap,
  Handshake,
  HeartPulse,
  Linkedin,
  PlayCircle,
  Rocket,
  Search,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { SITE } from '../seo.config';
import { trackEvent } from '../lib/analytics';
import {
  ARTICLES,
  ARTICLE_CATEGORIES,
  articlePath,
  articleVisualPath,
  type ArticleCategory,
} from '../content/articles.meta';

type Card = {
  title: string;
  description: string;
  tag?: string;
};

type Signal = {
  value: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties; color?: string }>;
  color: string;
};

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const sectionReveal = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease },
  },
};

const cardReveal = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease, delay: i * 0.06 },
  }),
};

const realBuilds: Card[] = [
  {
    title: 'Sahayaak Seva',
    description:
      'AI healthcare and field-assistance workflows designed to make frontline response faster and more practical.',
    tag: 'Healthcare + Field Ops',
  },
  {
    title: 'KathaKitaab',
    description:
      'AI storytelling and interactive learning experiences that blend narrative, visuals, and cultural context.',
    tag: 'Storytelling + Learning',
  },
  {
    title: 'JAK Swarm',
    description:
      'Agentic AI automation and orchestration patterns for multi-step, multi-agent execution.',
    tag: 'Agentic Automation',
  },
  {
    title: 'UniAssist.ai',
    description:
      'AI guidance for students and study-abroad journeys, with practical decision support.',
    tag: 'Education + Guidance',
  },
  {
    title: 'Testsprep.in',
    description:
      'AI-powered test preparation flows with structured learning outcomes and measurable progress.',
    tag: 'Test Prep + Performance',
  },
  {
    title: 'SocialNinja',
    description:
      'AI social media automation systems for content planning, repurposing, and execution consistency.',
    tag: 'Content Automation',
  },
];

const programs: Card[] = [
  {
    title: 'AI for Students',
    description: 'Practical AI path for students who want projects, not just certificates.',
    tag: 'Program',
  },
  {
    title: 'Build Your First AI Tool',
    description: 'Hands-on starter program to design, build, and ship your first useful AI product.',
    tag: 'Workshop',
  },
  {
    title: 'AI for Founders',
    description: 'How founders can use AI for growth, operations, and new product opportunities.',
    tag: 'Founder Track',
  },
  {
    title: 'College AI Workshops',
    description: 'Campus sessions focused on practical AI careers, tools, and implementation projects.',
    tag: 'Campus',
  },
  {
    title: '1:1 AI Mentorship',
    description: 'Direct founder mentorship to unblock your AI roadmap and execution velocity.',
    tag: 'Mentorship',
  },
  {
    title: 'Practical AI Bootcamp',
    description: 'Intensive build-first format for teams and individuals ready to ship fast.',
    tag: 'Bootcamp',
  },
];

const credibilitySignals: Signal[] = [
  {
    value: '12+',
    label: 'Products built in ecosystem',
    icon: Rocket,
    color: '#f59f4f',
  },
  {
    value: '2022+',
    label: 'Years of focused AI execution',
    icon: Brain,
    color: '#6f8dff',
  },
  {
    value: 'Real-World',
    label: 'Deployment-first learning approach',
    icon: Target,
    color: '#10b981',
  },
];

const ActionButton: React.FC<{
  children: React.ReactNode;
  href: string;
  eventName: string;
  variant?: 'primary' | 'secondary';
  external?: boolean;
}> = ({ children, href, eventName, variant = 'secondary', external = false }) => {
  const baseClass =
    'group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all';
  const className =
    variant === 'primary'
      ? `${baseClass} border border-[#f59f4f]/35 bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] text-[#0a0c10] shadow-[0_0_26px_rgba(245,159,79,0.3)] hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(245,159,79,0.45)]`
      : `${baseClass} border border-white/[0.12] bg-white/[0.03] text-[#c8d8ea] hover:border-white/25 hover:bg-white/[0.07] hover:text-white`;

  const onClick = () => trackEvent(eventName);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
};

const RevealSection: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <motion.section
    className={className}
    variants={sectionReveal}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.12 }}
  >
    {children}
  </motion.section>
);

const SectionHeader: React.FC<{
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
}> = ({ eyebrow, title, description, center = false }) => (
  <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
    <p className={`eyebrow-line text-[#96b0c8] ${center ? 'justify-center' : ''}`}>{eyebrow}</p>
    <h2 className="mt-4 text-2xl font-bold leading-[1.08] text-white sm:text-3xl lg:text-[40px]">{title}</h2>
    {description && <p className="mt-4 text-[15px] leading-[1.75] text-[#9fb6cc]">{description}</p>}
  </div>
);

const CardGrid: React.FC<{
  items: Card[];
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties; color?: string }>;
  accentColor: string;
}> = ({ items, icon: Icon, accentColor }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, i) => (
        <motion.article
          key={item.title}
          custom={i}
          variants={cardReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          whileHover={reduceMotion ? undefined : { y: -6, scale: 1.01 }}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent p-5 transition-all duration-300 hover:border-[#f59f4f]/35"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
              opacity: 0.9,
            }}
            aria-hidden="true"
          />
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0f1520]">
            <Icon size={18} style={{ color: accentColor }} />
          </div>
          {item.tag && (
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fb2d0]">{item.tag}</p>
          )}
          <h3 className="text-lg font-semibold text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-[1.7] text-[#a6bdd3]">{item.description}</p>
        </motion.article>
      ))}
    </div>
  );
};

/**
 * Searchable, filterable grid of the real "Build AI with Reeturaj" articles.
 * Replaces the old static `learningCategories` placeholder. Each card links to
 * the article route (/learn-ai-with-reeturaj/<slug>) rendered by ArticlePage.
 */
const ArticleExplorer: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ArticleCategory | 'All'>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ARTICLES.filter((a) => {
      const matchesCategory = activeCategory === 'All' || a.category === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.abstract.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    });
  }, [query, activeCategory]);

  const chips: Array<ArticleCategory | 'All'> = ['All', ...ARTICLE_CATEGORIES];

  return (
    <div>
      <SectionHeader
        eyebrow="Article Library"
        title="Practical AI articles, built for Bharat"
        description="In-depth, jargon-free breakdowns of the AI, engineering, and security concepts behind real Indian products — with a direct answer, a how-it-works explainer, and an FAQ in every piece."
      />

      {/* Search + category filters */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7e98b3]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles — RAG, CI/CD, Desh Ka AI…"
            aria-label="Search articles"
            className="w-full rounded-full border border-white/[0.1] bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#7e98b3] outline-none transition-all focus:border-[#f59f4f]/40 focus:bg-white/[0.05]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = chip === activeCategory;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setActiveCategory(chip);
                  trackEvent('founder_hub_category_filter', { category: chip });
                }}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                  active
                    ? 'border-[#f59f4f]/45 bg-[#f59f4f]/[0.12] text-[#ffd7ae]'
                    : 'border-white/[0.1] bg-white/[0.02] text-[#9ab2c9] hover:border-white/25 hover:text-white'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>

        <p className="text-[12px] text-[#7e98b3]">
          {filtered.length} {filtered.length === 1 ? 'article' : 'articles'}
          {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
          {query ? ` matching “${query.trim()}”` : ''}
        </p>
      </div>

      {/* Article grid */}
      {filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-[#9fb6cc]">No articles match your search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveCategory('All');
            }}
            className="mt-4 text-[13px] font-semibold text-[#f5b76f] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a, i) => (
            <motion.article
              key={a.slug}
              custom={i}
              variants={cardReveal}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              whileHover={{ y: -6, scale: 1.01 }}
              className="group"
            >
              <Link
                to={articlePath(a.slug)}
                onClick={() => trackEvent('founder_hub_open_article', { slug: a.slug })}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent transition-all duration-300 hover:border-[#f59f4f]/35"
              >
                <div className="relative h-36 w-full overflow-hidden bg-[#0f1520]">
                  <img
                    src={articleVisualPath(a)}
                    alt={a.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-[#030508]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffd7ae] backdrop-blur">
                    {a.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-[16px] font-semibold leading-snug text-white group-hover:text-[#f5b76f]">
                    {a.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[#a6bdd3]">
                    {a.description}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-[11px] text-[#7e98b3]">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> {a.readMinutes} min
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} /> {new Date(a.datePublished + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[#f5b76f] opacity-0 transition-opacity group-hover:opacity-100">
                      Read <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
};

const LearnAIWithReeturaj: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="landing-shell relative min-h-screen overflow-x-hidden bg-[#030508] text-[#e8eef8]">
      <div className="landing-atmosphere" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />

      {!reduceMotion && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <motion.div
            className="absolute -left-40 top-[10%] h-[420px] w-[420px] rounded-full bg-[#f59f4f]/[0.08] blur-[110px]"
            animate={{ x: [0, 32, -18, 0], y: [0, -14, 24, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -right-32 top-[25%] h-[380px] w-[380px] rounded-full bg-[#6f8dff]/[0.08] blur-[120px]"
            animate={{ x: [0, -20, 20, 0], y: [0, 30, -14, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[8%] left-[20%] h-[320px] w-[320px] rounded-full bg-[#10b981]/[0.06] blur-[110px]"
            animate={{ x: [0, -24, 12, 0], y: [0, -12, 22, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030508]/75 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18] transition-all duration-300 group-hover:border-[#f59f4f]/40 group-hover:shadow-[0_0_22px_rgba(245,159,79,0.2)]">
              <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" width={20} height={20} />
            </div>
            <div>
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">INBHARAT</p>
              <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">Founder Learning Hub</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <ActionButton href="/" eventName="founder_page_back_home" variant="secondary">
              Home
            </ActionButton>
            <ActionButton href="/app" eventName="founder_page_try_inbharat" variant="primary">
              Try InBharat AI
            </ActionButton>
          </div>
        </div>
      </nav>

      <header className="relative z-10 border-b border-white/[0.05]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-6 sm:py-18 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f59f4f]/25 bg-[#f59f4f]/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffd7ae]">
              <Sparkles size={12} className="text-[#f59f4f]" />
              AI Evangelist Mode
            </p>
            <h1 className="text-3xl font-bold leading-[1.02] text-white sm:text-5xl lg:text-[62px]">
              Learn AI with Reeturaj Goswami
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.75] text-[#a7bed4] sm:text-[16px]">
              Practical AI learning from a founder building real AI tools for education, healthcare,
              automation, storytelling, and Bharat-first innovation.
            </p>
            <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#f8c488]">
              No hype. No jargon. Learn AI by building real tools for real problems.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ActionButton href={SITE.social.linkedin} external eventName="founder_page_watch_videos" variant="primary">
                Watch Latest Videos
                <PlayCircle size={16} />
              </ActionButton>
              <ActionButton href={SITE.social.linkedin} external eventName="founder_page_join_workshop">
                Join Workshop
                <CalendarDays size={16} />
              </ActionButton>
              <ActionButton href={SITE.social.linkedin} external eventName="founder_page_book_mentorship">
                Book Mentorship
                <Handshake size={16} />
              </ActionButton>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {credibilitySignals.map((signal) => (
                <div
                  key={signal.label}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9ab2c9]">
                    <signal.icon size={14} style={{ color: signal.color }} />
                    Signal
                  </div>
                  <p className="mt-2 text-lg font-bold text-white">{signal.value}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#93abc2]">{signal.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.08, ease }}
          >
            <div className="relative h-full overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-[#10192a] to-[#0a1019] p-6 sm:p-8">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.16]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right,rgba(143,178,208,0.22) 1px,transparent 1px),linear-gradient(to bottom,rgba(143,178,208,0.22) 1px,transparent 1px)',
                  backgroundSize: '26px 26px',
                }}
                aria-hidden="true"
              />

              <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
                {!reduceMotion && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full border border-[#f59f4f]/30"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute inset-[10px] rounded-full border border-[#6f8dff]/40 border-dashed"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    />
                  </>
                )}
                <div className="h-32 w-32 overflow-hidden rounded-full border border-[#f59f4f]/45 bg-[#141c2b] shadow-[0_0_42px_rgba(245,159,79,0.3)]">
                  <img
                    src="/reeturaj-founder.jpg"
                    alt="Reeturaj Goswami"
                    width={128}
                    height={128}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#90abc5]">
                Reeturaj Goswami
              </p>
              <p className="mt-2 text-center text-xl font-semibold text-white">The Founder Builder</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  'Build-first AI execution',
                  'Bharat + global mindset',
                  'Founder-led practical guidance',
                ].map((line) => (
                  <div
                    key={line}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-center text-[11px] font-medium leading-[1.6] text-[#a8c0d8]"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="relative z-10">
        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionHeader
              eyebrow="Why This Page Exists"
              title="AI should feel practical, electric, and execution-ready"
              description="This is not a generic course catalog. It is a founder sharing what actually works while building and shipping AI tools in the wild. The goal is to shorten your path from understanding to implementation."
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Build First',
                  text: 'Learn AI by building real tools, not by memorizing abstractions.',
                  icon: Rocket,
                },
                {
                  title: 'Founder Lens',
                  text: 'Understand product decisions, execution trade-offs, and deployment constraints.',
                  icon: Brain,
                },
                {
                  title: 'Real Use Cases',
                  text: 'Education, healthcare, automation, storytelling, and Bharat-first workflows.',
                  icon: Target,
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  custom={i}
                  variants={cardReveal}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
                >
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0e1622] text-[#f59f4f]">
                    <item.icon size={16} />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#96b0c8]">{item.title}</p>
                  <p className="mt-2 text-sm leading-[1.7] text-[#a6bdd4]">{item.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </RevealSection>

        <div className="landing-seam" aria-hidden="true" />

        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionHeader
              eyebrow="Learn From Real InBharat Builds"
              title="Case studies from products built in real environments"
              description="Every build becomes a learning module: what was attempted, what failed, what changed, and what finally shipped."
            />
            <CardGrid items={realBuilds} icon={Rocket} accentColor="#f59f4f" />
          </div>
        </RevealSection>

        <div className="landing-seam" aria-hidden="true" />

        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
            <ArticleExplorer />
          </div>
        </RevealSection>

        <div className="landing-seam" aria-hidden="true" />

        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionHeader
              eyebrow="Programs / Offerings"
              title="Structured pathways for learners, teams, and founders"
              description="Programs are designed around implementation outcomes, not theory overload."
            />
            <CardGrid items={programs} icon={GraduationCap} accentColor="#10b981" />
          </div>
        </RevealSection>

        <div className="landing-seam" aria-hidden="true" />

        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-10">
            <div>
              <SectionHeader
                eyebrow="Founder Builder Story"
                title="From education roots to practical AI product building"
                description="Reeturaj Goswami has been building in education and technology for years, started using AI seriously from 2022 onward, and now focuses on practical AI systems for India and global users."
              />
            </div>
            <div className="space-y-3">
              {[
                {
                  icon: BookOpen,
                  title: 'Education and technology background',
                  desc: 'Built around applied learning, student outcomes, and practical digital products.',
                },
                {
                  icon: HeartPulse,
                  title: 'AI depth from 2022 onward',
                  desc: 'Shifted from experimentation to disciplined shipping of useful AI systems.',
                },
                {
                  icon: Briefcase,
                  title: 'Multi-product execution under InBharat.ai',
                  desc: 'Built tools across education, healthcare, automation, storytelling, and agentic workflows.',
                },
                {
                  icon: Users,
                  title: 'Bharat-first and globally relevant',
                  desc: 'Focused on accessibility, multilingual usage, and practical implementation quality.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  custom={i}
                  variants={cardReveal}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm text-[#a8c0d8]"
                >
                  <div className="mb-1 flex items-center gap-2 text-[#f59f4f]">
                    <item.icon size={14} />
                    {item.title}
                  </div>
                  {item.desc}
                </motion.div>
              ))}
            </div>
          </div>
        </RevealSection>

        <div className="landing-seam" aria-hidden="true" />

        <RevealSection className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionHeader
              eyebrow="Follow the Build Journey"
              title="LinkedIn + Content Engine"
              description="Videos, posts, build logs, and practical AI lessons will be shared regularly through LinkedIn and this page."
            />

            <div className="relative mt-8 overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8">
              {!reduceMotion && (
                <motion.div
                  className="pointer-events-none absolute -left-[35%] top-0 h-full w-[40%] bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['0%', '350%'] }}
                  transition={{ duration: 5.8, repeat: Infinity, ease: 'linear' }}
                  aria-hidden="true"
                />
              )}
              <p className="text-sm leading-[1.75] text-[#a6bdd3]">
                Follow the founder stream for weekly practical AI breakdowns, implementation notes,
                and behind-the-scenes lessons from shipping products.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_follow_linkedin" variant="primary">
                  Follow on LinkedIn
                  <Linkedin size={16} />
                </ActionButton>
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_open_content_feed">
                  Open Content Feed
                  <ArrowRight size={16} />
                </ActionButton>
              </div>
            </div>
          </div>
        </RevealSection>
      </main>

      <section className="relative z-10 border-t border-white/[0.06] py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[28px] border border-[#f59f4f]/20 bg-gradient-to-br from-[#171008] via-[#120f12] to-[#0f161f] p-7 sm:p-10">
            {!reduceMotion && (
              <motion.div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(ellipse 900px 380px at 0% -20%, rgba(245,159,79,0.14), transparent 45%), radial-gradient(ellipse 700px 320px at 100% 120%, rgba(111,141,255,0.12), transparent 50%)',
                }}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              />
            )}

            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#f6bf84]">Take Action</p>
              <h2 className="mt-3 text-2xl font-bold leading-[1.1] text-white sm:text-4xl">
                Build with guidance, not guesswork
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-[1.75] text-[#b5cbe0]">
                If you want a workshop, mentorship, or practical AI roadmap for your team or campus,
                this is where the next step begins.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_cta_workshop" variant="primary">
                  Invite Me for a Workshop
                </ActionButton>
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_cta_learning_list">
                  Join the Learning List
                </ActionButton>
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_cta_mentorship">
                  Book Founder Mentorship
                </ActionButton>
                <ActionButton href={SITE.social.linkedin} external eventName="founder_page_cta_latest_video">
                  Watch Latest Build Video
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.05] py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8eaac5]">InBharat.ai Founder Learning Hub</p>
          <div className="flex flex-wrap gap-4 text-[12px] text-[#9bb4cc]">
            <Link to="/" className="transition-colors hover:text-white">Home</Link>
            <Link to="/app" className="transition-colors hover:text-white">InBharat AI</Link>
            <Link to="/contact" className="transition-colors hover:text-white">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LearnAIWithReeturaj;
