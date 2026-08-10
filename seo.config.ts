/**
 * Single source of truth for per-route SEO metadata.
 *
 * Consumed by:
 *   - scripts/build-seo.mjs  (post-build: emits per-route HTML shells + sitemap.xml + og-image.png)
 *   - lib/useDocumentHead.ts (client-side: updates <title>/meta on route change)
 *
 * Add a new public route here ➜ it shows up in sitemap.xml, gets a pre-built
 * SEO shell (`dist/<path>/index.html`), and works with useDocumentHead.
 *
 * The "Build AI with Reeturaj" article routes are generated from the article
 * manifest in content/articles.meta.ts (one SeoRoute per article, with
 * TechArticle + FAQPage + BreadcrumbList schema + a crawlable seoBody). The
 * manifest is body-free, so this file stays safe to import client-side.
 */

import {
  ARTICLES,
  ARTICLE_HUB_PATH,
  articlePath,
  articleVisualPath,
} from './content/articles.meta.js';
import { buildArticleSchemas } from './content/article-schema.js';
import { awardStrings, credentialSchemaNodes } from './content/credentials.js';
import { ADMIN_GROWTH_PATHS as ADMIN_GROWTH_PATHS_FROM_ROUTER } from './lib/growth/adminRoutes.js';

export const SITE = {
  // Canonical host is www (apex https://inbharat.ai 308-redirects to www live).
  // All sitemap <loc>, <link rel=canonical>, OG urls, and JSON-LD urls derive
  // from this — must be the www host so signals point at the canonical URL.
  url: 'https://www.inbharat.ai',
  name: 'InBharat AI',
  shortName: 'InBharat',
  description:
    'InBharat builds affordable, easy-to-use AI tools for Bharat — agentic search, coding assistants, education platforms, and business automation in 11 Indian languages.',
  themeColor: '#0d1117',
  ogImage: '/og-image.png',
  twitterCard: 'summary_large_image' as const,
  locale: 'en_IN',
  // Social profiles (used in Organization & Person sameAs).
  // Discord excluded — no public invite URL.
  social: {
    instagram: 'https://www.instagram.com/unigurus/',
    linkedin: 'https://www.linkedin.com/in/reeturaj-goswami',
    twitter: 'https://x.com/reetur_aj',
    github: 'https://github.com/inbharatai',
  },
  contactEmail: 'info@inbharat.ai',
} as const;

export type SeoRoute = {
  /** Path with leading slash; `/` is the homepage shell (overwrites the root index.html). */
  path: string;
  title: string;
  description: string;
  /** Optional override; defaults to SITE.ogImage. */
  ogImage?: string;
  /** Sitemap priority (0.0–1.0). */
  priority: number;
  /** Sitemap changefreq. */
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** Whether to add hreflang alternates for all 11 languages. */
  multilingual: boolean;
  /**
   * When true, the shell head emits `<meta name="robots" content="noindex,nofollow">`.
   * Used for private/admin routes that still need a prebuilt shell so the SPA boots
   * (the catch-all rewrite does NOT serve the SPA for shell-less routes), but must
   * never be indexed. Implies excludeFromSitemap.
   */
  noIndex?: boolean;
  /**
   * When true, build-seo skips the sitemap `<url>` entry for this route.
   * Set for admin routes and any other non-public route that has a shell.
   */
  excludeFromSitemap?: boolean;
  /**
   * For "Build AI with Reeturaj" article routes only: the article slug. When
   * set, scripts/build-seo.ts reads content/articles/<slug>.md at build time
   * and bakes the full rendered body into the crawlable shell so AI-search
   * crawlers see the complete article. The client bundle never imports bodies
   * (ArticlePage loads them lazily via import.meta.glob) — this is build-time
   * only. The React app renders the same markdown, so this is not cloaking.
   */
  articleSlug?: string;
  /** Extra schema.org JSON-LD objects to inject on this shell (Organization + WebSite always present). */
  extraSchema?: Array<Record<string, unknown>>;
  /**
   * Crawlable body content injected into the static shell (visually hidden,
   * screen-reader available) so non-JS and AI-search crawlers see real text
   * instead of an empty #root. MUST stay a faithful summary of what the React
   * app renders (no cloaking). `h1` anchors the page for AI answers.
   */
  seoBody?: { h1: string; paragraphs: string[] };
};

// All 11 supported languages — kept in sync with lib/i18n.ts supportedLanguages.
export const SUPPORTED_LANGS = [
  'en',
  'hi',
  'bn',
  'te',
  'mr',
  'ta',
  'gu',
  'kn',
  'ml',
  'or',
  'as',
] as const;

// Public live product sites + the public GitHub org. Wires the InBharat
// product "universe" as one entity network for Google/AI engines. Only
// public live sites + the public GitHub org — never private repo URLs,
// the deprecated RHCF Seva name (healthcare is publicly branded Sahayaak Seva),
// or UniGurus (per project constraints).
const ORG_SAMEAS = [
  SITE.social.instagram,
  SITE.social.linkedin,
  SITE.social.twitter,
  SITE.social.github,
  'https://jakswarm.com',
  'https://www.kathakitaab.com',
  'https://testsprep.in',
  'https://www.uniassist.ai',
  'https://openclawfix.pro',
  'https://sahayaakseva.in',
  'https://swasthyascore-ai.vercel.app',
];

const baseOrganization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  alternateName: SITE.shortName,
  url: SITE.url,
  logo: `${SITE.url}/inbharat-logo-1024.png`,
  description:
    'AI consulting and tool-building company for Bharat. We build AI-powered websites, chatbots, automation systems, CRMs, and custom tools for Indian businesses.',
  areaServed: 'IN',
  sameAs: ORG_SAMEAS,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SITE.contactEmail,
    availableLanguage: [
      'English',
      'Hindi',
      'Bengali',
      'Tamil',
      'Telugu',
      'Marathi',
      'Gujarati',
      'Kannada',
      'Malayalam',
      'Odia',
      'Assamese',
    ],
  },
  // Government recognition and company-held programme selections, sourced from
  // content/credentials.ts so the structured data can never drift from what the
  // pages actually render. `legalName` matters here: the DPIIT recognition is
  // held by Uni Guru Technologies LLP, and attributing it to the brand alone
  // would misstate a Government of India recognition.
  legalName: 'Uni Guru Technologies LLP',
  hasCredential: credentialSchemaNodes('org'),
  award: awardStrings('org'),
  founder: {
    '@type': 'Person',
    name: 'Reeturaj Goswami',
    url: `${SITE.url}/learn-ai-with-reeturaj`,
  },
};

/**
 * Reeturaj as a schema.org Person, carrying the personally-held credentials
 * (Stanford Seed Spark, Google Cloud Gen AI Academy, the Anthropic and
 * Microsoft certificates, the Google Developer Program badges).
 *
 * Shipped on every shell rather than only the founder page: a standalone Person
 * node plus `founder` on the Organization gives search and answer engines one
 * unambiguous entity to attach the credentials to, which is the entire point of
 * publishing them.
 */
const baseFounder = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Reeturaj Goswami',
  jobTitle: 'Founder & Builder',
  worksFor: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  url: `${SITE.url}/learn-ai-with-reeturaj`,
  image: `${SITE.url}/reeturaj-founder.jpg`,
  sameAs: [SITE.social.linkedin].filter(Boolean),
  hasCredential: credentialSchemaNodes('person'),
  award: awardStrings('person'),
};

const baseWebsite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  inLanguage: SUPPORTED_LANGS.slice(),
  // NOTE (2026-07-04): the `potentialAction` SearchAction that was here targeted
  // `${SITE.url}/app?q={search_term_string}`. /app is the agentic console, not a
  // real results-page search target, so Google kept discovering the placeholder
  // URL and flagging it in Search Console. Removed for indexing hygiene — the
  // sitelinks searchbox added no value here and only generated noise. GSC will
  // drop /app?q={search_term_string} as it re-crawls.
};

/** Always shipped on every shell. */
export const GLOBAL_SCHEMA: Array<Record<string, unknown>> = [
  baseOrganization,
  baseFounder,
  baseWebsite,
];

const breadcrumb = (label: string, path: string) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url + '/' },
    { '@type': 'ListItem', position: 2, name: label, item: SITE.url + path },
  ],
});

const homepageFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is InBharat AI?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'InBharat AI is an independent AI product studio building affordable, voice-first, multilingual AI tools for India — including agentic search, coding assistants, education platforms, and business automation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which Indian languages does InBharat AI support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'InBharat AI supports 11 Indian languages: English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia, and Assamese.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is InBharat AI free to try?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can try InBharat AI on the web with a few free messages before signing in. No credit card required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to install anything?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. InBharat AI runs in your browser on any modern device. There is nothing to download or install.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does InBharat AI work on mobile?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The website and the InBharat AI console are fully responsive and work on phones, tablets, and desktops.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I contact the InBharat team?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `You can reach us via the contact page at ${SITE.url}/contact or email ${SITE.contactEmail}.`,
      },
    },
  ],
};

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: `${SITE.name} Console`,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE.url}/app`,
  description:
    'Voice-first agentic AI for Bharat. Research, coding, education, executive, and shopper modes with multi-language support.',
  publisher: {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
  },
  inLanguage: SUPPORTED_LANGS.slice(),
};

// Exported so ArticlePage.tsx can reuse the same author entity for its
// client-side JSON-LD (kept in sync with the baked shell schema).
export const founderPerson = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Reeturaj Goswami',
  url: SITE.url + '/about',
  worksFor: {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
  },
  sameAs: ORG_SAMEAS,
};

/**
 * InBharat product suite — all 12 ecosystem products as an ItemList so search
 * and AI engines see the full InBharat entity network (public sites + public
 * open-source repos), matching the landing-page product grid.
 */
const productSuite = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'InBharat AI product suite',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'WebApplication',
        name: 'InBharat AI',
        url: SITE.url + '/app',
        description:
          'Flagship multi-agent agentic search and chat platform — voice-first, multilingual, with specialist agents for coding, education, research, shopping, and enterprise.',
      },
    },
    {
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'WebApplication',
        name: 'KathaKitaab',
        url: 'https://www.kathakitaab.com',
        description:
          'Interactive storybook platform that brings Indian epics to life as living books with verb-aware AI animation and Indian-language narration.',
      },
    },
    {
      '@type': 'ListItem',
      position: 3,
      item: {
        '@type': 'WebApplication',
        name: 'JAK Swarm',
        url: 'https://jakswarm.com',
        description:
          'Open-source, self-hostable closed-loop company OS — evidence graph, drift detection, executable specs, and risk-gated agent approvals with audit trails.',
      },
    },
    {
      '@type': 'ListItem',
      position: 4,
      item: {
        '@type': 'WebApplication',
        name: 'Phoring',
        url: 'https://github.com/inbharatai/phoring',
        description:
          'Decision-intelligence engine: documents to knowledge graph to multi-agent simulation to source-cited forecasts.',
      },
    },
    {
      '@type': 'ListItem',
      position: 5,
      item: {
        '@type': 'WebApplication',
        name: 'Agent Arcade',
        url: 'https://github.com/inbharatai/agent-arcade-gateway',
        description:
          'Open-source agent observability — live dashboard, session replay, and cost analytics across 29 models.',
      },
    },
    {
      '@type': 'ListItem',
      position: 6,
      item: {
        '@type': 'WebApplication',
        name: 'Sahayaak AI',
        url: 'https://github.com/inbharatai/sahaayak-ai-public',
        description:
          'Multilingual personal AI OS for 1.4B Indians — chat, voice, OCR, translation, smart notes, email intelligence, and live news.',
      },
    },
    {
      '@type': 'ListItem',
      position: 7,
      item: {
        '@type': 'WebApplication',
        name: 'Sahayaak Seva',
        url: 'https://sahayaakseva.in',
        description:
          "Field AI app for India's Anganwadi workers — WHO-standard child growth tracking, GPT-4o Vision OCR, maternal risk scoring, and government scheme lookup.",
      },
    },
    {
      '@type': 'ListItem',
      position: 8,
      item: {
        '@type': 'WebApplication',
        name: 'UniAssist.ai',
        url: 'https://www.uniassist.ai',
        description:
          'AI student guidance for international admissions — university matching, PR prediction, and scholarship discovery.',
      },
    },
    {
      '@type': 'ListItem',
      position: 9,
      item: {
        '@type': 'WebApplication',
        name: 'TestsPrep.in',
        url: 'https://testsprep.in',
        description:
          'AI exam-prep platform — focused pathways, practice tests, performance analytics, and adaptive learning.',
      },
    },
    {
      '@type': 'ListItem',
      position: 10,
      item: {
        '@type': 'WebApplication',
        name: 'UniBot',
        url: SITE.url + '/#chatbot',
        description:
          'Conversational AI support bot on WhatsApp for multilingual helpdesk and guidance.',
      },
    },
    {
      '@type': 'ListItem',
      position: 11,
      item: {
        '@type': 'WebApplication',
        name: 'SocialFlow',
        url: 'https://github.com/inbharatai/SocialFlow',
        description:
          'Open-source AI social-media automation — generate and publish to 12 platforms; AES-256 local credentials.',
      },
    },
    {
      '@type': 'ListItem',
      position: 12,
      item: {
        '@type': 'WebApplication',
        name: 'OpenClawFix',
        url: 'https://openclawfix.pro',
        description:
          'One-click installer for the OpenClaw IDE via Docker — auto-configures gateway tokens and 16 AI providers.',
      },
    },
    {
      '@type': 'ListItem',
      position: 13,
      item: {
        '@type': 'WebApplication',
        name: 'UnoOne',
        url: 'https://github.com/inbharatai/UnoOne-Local-Agent',
        description:
          'Offline-first Android AI companion with on-device Whisper STT and MMS TTS in Hindi, Bengali, Tamil, Telugu, Kannada, and Malayalam — voice, wake word, and skills run locally without the cloud.',
      },
    },
    {
      '@type': 'ListItem',
      position: 14,
      item: {
        '@type': 'WebApplication',
        name: 'SwasthyaScore AI',
        url: 'https://swasthyascore-ai.vercel.app',
        description:
          'Personal NCD self-screening PWA — obesity, diabetes, and blood-pressure risk in 60 seconds. Camera-based rPPG vital estimation, lab-report OCR, and voice symptom assessment. Screening only, not a medical diagnosis.',
      },
    },
    {
      '@type': 'ListItem',
      position: 15,
      item: {
        '@type': 'WebApplication',
        name: 'JAK Shield',
        url: 'https://github.com/inbharatai/jak-shield',
        description:
          'Universal agent security layer — risk-based approvals, PII detection, sandboxed execution, and tamper-evident audit trails for AI agents. Open-source and self-hostable.',
      },
    },
  ],
};

const founderLearningPage = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  name: 'Learn AI with Reeturaj Goswami',
  description:
    'Founder-led practical AI learning hub from Reeturaj Goswami with build logs, videos, workshops, and implementation lessons from real products.',
  url: SITE.url + '/learn-ai-with-reeturaj',
  about: {
    '@type': 'Person',
    name: 'Reeturaj Goswami',
    worksFor: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
    },
    sameAs: ORG_SAMEAS,
  },
};

/**
 * ItemList of the "Build AI with Reeturaj" articles, attached to the hub shell
 * so search + AI engines see the series as one collection (and so the hub isn't
 * a thin ProfilePage). Only public article URLs — no admin/private routes.
 */
const founderArticleList = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Build with Reeturaj — practical AI article series',
  itemListElement: ARTICLES.map((a, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: SITE.url + articlePath(a.slug),
    name: a.title,
  })),
};

/** Audience line appended to every article's crawlable seoBody (paragraph 2). */
const ARTICLE_AUDIENCE_LINE =
  'A practical, jargon-free guide for Indian engineering teams and founders — part of the Learn AI with Reeturaj series on InBharat AI.';

/**
 * One SeoRoute per article: TechArticle + FAQPage + BreadcrumbList schema
 * (built in content/article-schema.ts), a per-article OG image, and a
 * crawlable seoBody (the direct-answer abstract + the audience line). Spread
 * into ROUTES below so build-seo emits one shell + one sitemap entry per slug.
 */
const ARTICLE_ROUTES: SeoRoute[] = ARTICLES.map((meta) => ({
  path: articlePath(meta.slug),
  title: meta.title,
  description: meta.description,
  ogImage: articleVisualPath(meta),
  priority: 0.6,
  changefreq: 'monthly',
  multilingual: false,
  articleSlug: meta.slug,
  extraSchema: buildArticleSchemas(meta, SITE, founderPerson),
  seoBody: {
    h1: meta.title,
    paragraphs: [meta.abstract, ARTICLE_AUDIENCE_LINE],
  },
}));

/**
 * Prebuilt noindex shells for the private Growth Agent admin console. These
 * exist purely so the SPA boots at these paths (the catch-all rewrite does not
 * serve the SPA for shell-less routes — the root cause of the /admin/growth
 * 404). They are noindex + excluded from the sitemap; RequireAdmin gates the
 * content client-side and /api/growth/whoami is the real server authority.
 *
 * The path list is derived from the single source of truth in
 * lib/growth/adminRoutes.ts (ADMIN_GROWTH_PATHS), which also drives the
 * react-router children in index.tsx and the nav rail in AdminGrowthLayout.
 * Adding a child route means adding one entry there — not hand-maintaining this
 * list. Drift fails scripts/test-growth.ts.
 */
const ADMIN_GROWTH_PATHS = ADMIN_GROWTH_PATHS_FROM_ROUTER;
const adminGrowthRoutes: SeoRoute[] = ADMIN_GROWTH_PATHS.map((path) => ({
  path,
  title: 'InBharat Growth Agent — Admin',
  description: 'Restricted admin console for the InBharat Growth Agent.',
  priority: 0.1,
  changefreq: 'never' as const,
  multilingual: false,
  noIndex: true,
  excludeFromSitemap: true,
  seoBody: {
    h1: 'InBharat Growth Agent — Admin',
    paragraphs: ['Restricted admin console for the InBharat Growth Agent.'],
  },
}));

export const ROUTES: SeoRoute[] = [
  {
    path: '/',
    title: 'InBharat AI — Affordable AI Tools Built for Bharat',
    description: SITE.description,
    priority: 1.0,
    changefreq: 'weekly',
    // hreflang disabled until real localized route shells (/hi/, /bn/ …) exist:
    // ?lang= alternates canonicalize to the en URL, so they were inert and only
    // added GSC "alternate page with proper canonical tag" noise. The 11-language
    // UI switch still works via ?lang= — it's a UX feature, not an SEO one.
    multilingual: false,
    extraSchema: [homepageFAQ, productSuite],
    seoBody: {
      // Aligned to the visible React hero H1 (landHeroTitle1 + landHeroTitle2 =
      // "Affordable AI tools built for Bharat.") so the crawler sr-only H1 and
      // the on-page H1 match exactly. Branding stays in <title>/OG.
      h1: 'Affordable AI tools built for Bharat',
      paragraphs: [
        'InBharat AI is an independent AI product studio building affordable, voice-first, multilingual AI tools for India. Our tools run in 11 Indian languages — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia, and Assamese — and work on any modern phone, tablet, or desktop with nothing to install.',
        'The InBharat product suite includes JAK Swarm, an open-source self-hostable agentic company OS with an evidence graph, drift detection, and JAK Shield risk gating; KathaKitaab, AI-powered interactive storybooks for children in Indian languages; and TestsPrep, AI-driven adaptive test-preparation analytics.',
        'The InBharat AI console offers voice-first agentic search and multi-modal AI with research, coding, education, executive, and shopper modes. You can try it free on the web with a few messages before signing in — no credit card required.',
        'InBharat AI is built for Bharat: small business owners automating operations, students preparing for exams, developers shipping faster, and teams that need AI in their own language. The console is voice-first so it works on low-end phones and patchy networks, and every response is grounded with live web search when facts matter.',
        'Trust and safety are first-class. JAK Swarm pairs an evidence graph with drift detection and a JAK Shield risk gate so agentic work is auditable and reversible; every approved artifact leaves an audit trail. The studio favours open-source, self-hostable components so teams keep control of their data.',
        'InBharat AI is an independent studio founded by Reeturaj Goswami, on a mission to make practical AI affordable and accessible across Indian languages, devices, and workflows — not a wrapper around a single model, but a suite of tools designed around how Bharat actually works.',
        'Every InBharat tool is built India-first: designed for low-bandwidth networks, low-end Android phones, and the languages people actually speak — then open-sourced or self-hosted so teams keep full control of their data, their costs, and their models.',
        `Contact the InBharat team at ${SITE.url}/contact or email ${SITE.contactEmail} for partnerships, product feedback, or custom AI tooling for Indian businesses.`,
      ],
    },
  },
  {
    path: '/app',
    title: 'InBharat AI Console — Agentic Search & Multi-Modal AI',
    description:
      'Voice-first agentic AI for Bharat. Research, coding, education, executive, and shopper modes with multi-language support. Try free — no install needed.',
    priority: 0.9,
    changefreq: 'monthly',
    multilingual: false,
    extraSchema: [softwareApplication],
    seoBody: {
      h1: 'InBharat AI Console — Agentic Search & Multi-Modal AI',
      paragraphs: [
        'The InBharat AI Console is a voice-first agentic AI for Bharat. It runs research, coding, education, executive, and shopper modes with multi-language support across 11 Indian languages.',
        'Try it free on the web — no install needed and no credit card required. The console is fully responsive and works on phones, tablets, and desktops.',
      ],
    },
  },
  {
    path: '/about',
    title: 'About InBharat AI — Building Practical AI for India',
    description:
      'InBharat is an independent AI product studio building voice-first, multilingual tools designed around Indian languages, devices, and workflows.',
    priority: 0.7,
    changefreq: 'monthly',
    multilingual: false,
    extraSchema: [breadcrumb('About', '/about'), founderPerson],
    seoBody: {
      h1: 'About InBharat AI — Building Practical AI for India',
      paragraphs: [
        'InBharat is an independent AI product studio building voice-first, multilingual tools designed around Indian languages, devices, and workflows.',
        'InBharat AI was founded by Reeturaj Goswami. The studio builds affordable AI tools for Bharat, including agentic search, coding assistants, education platforms, and business automation.',
      ],
    },
  },
  {
    path: '/learn-ai-with-reeturaj',
    title: 'Learn AI with Reeturaj Goswami — Founder-Led Practical AI | InBharat AI',
    description:
      'Practical AI learning from Reeturaj Goswami, founder of InBharat.ai. In-depth articles on AI agents, RAG, vibe coding, prompt engineering, CI/CD, DevSecOps, and Desh Ka AI — built for Bharat.',
    priority: 0.7,
    changefreq: 'weekly',
    multilingual: false,
    extraSchema: [
      breadcrumb('Learn AI with Reeturaj', '/learn-ai-with-reeturaj'),
      founderPerson,
      founderLearningPage,
      founderArticleList,
    ],
    seoBody: {
      h1: 'Learn AI with Reeturaj Goswami — Practical AI for Bharat',
      paragraphs: [
        'Learn AI with Reeturaj Goswami is a founder-led practical AI learning hub from the founder of InBharat.ai. It publishes in-depth, accuracy-reviewed articles on AI agents, retrieval-augmented generation (RAG), vibe coding, agentic AI, prompt engineering, generative AI, CI/CD, infrastructure as code, DevSecOps, software supply chain security, the InBharat ecosystem, and Desh Ka AI — each written for Indian engineering teams, founders, and learners, with a Bharat-first angle.',
        'Every article is a direct, jargon-free breakdown: a direct-answer summary, a numbered explanation of how the technology works, comparison tables where options differ, and a frequently-asked-questions section. Topics span AI Foundations, AI Tools, Engineering, DevOps, Security, and InBharat — the InBharat.ai mission to build AI in India, for India, by Indians.',
        'No hype. No jargon. Learn AI by building real tools for real problems. Follow the build journey on LinkedIn, and try the InBharat AI console for voice-first agentic AI across 11 Indian languages.',
      ],
    },
  },
  // One route per "Build AI with Reeturaj" article (12 in Phase 1).
  ...ARTICLE_ROUTES,
  {
    path: '/contact',
    title: 'Contact InBharat AI — Get in Touch',
    description:
      "Reach out about InBharat AI's products, partnerships, or feedback. Email and social channels listed.",
    priority: 0.6,
    changefreq: 'yearly',
    multilingual: false,
    extraSchema: [breadcrumb('Contact', '/contact')],
    seoBody: {
      h1: 'Contact InBharat AI',
      paragraphs: [
        "Reach out about InBharat AI's products, partnerships, or feedback.",
        `Email ${SITE.contactEmail}. Find InBharat AI on Instagram, LinkedIn, X, and GitHub at ${SITE.social.github}.`,
      ],
    },
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — InBharat AI',
    description:
      'How InBharat AI handles your data, what we store, what we do not, and how authentication and chat history work.',
    priority: 0.3,
    changefreq: 'yearly',
    multilingual: false,
    extraSchema: [breadcrumb('Privacy Policy', '/privacy')],
    seoBody: {
      h1: 'Privacy Policy — InBharat AI',
      paragraphs: [
        'How InBharat AI handles your data, what we store, what we do not, and how authentication and chat history work.',
        'InBharat collects as little as possible: account email and auth state if you sign in, chat history if signed in, a language preference in your browser, and short-lived server logs. We do not sell your data, train models on your chat content, or run third-party advertising trackers.',
      ],
    },
  },
  {
    path: '/terms',
    title: 'Terms of Service — InBharat AI',
    description:
      "The terms covering use of InBharat AI's products, including content, accounts, and acceptable-use rules.",
    priority: 0.3,
    changefreq: 'yearly',
    multilingual: false,
    extraSchema: [breadcrumb('Terms of Service', '/terms')],
    seoBody: {
      h1: 'Terms of Service — InBharat AI',
      paragraphs: [
        "The terms covering use of InBharat AI's products, including content, accounts, and acceptable-use rules.",
      ],
    },
  },
  // ─── Private admin console (Growth Agent) ─────────────────────────────────
  //
  // These shells exist ONLY so the SPA boots at these paths — the catch-all
  // rewrite in vercel.json does not serve the SPA for routes without a prebuilt
  // shell, which was the root cause of the /admin/growth 404. Each is noindex +
  // excluded from the sitemap (private). RequireAdmin gates the content
  // client-side after hydration; the server gate (/api/growth/whoami) is the
  // real authority. seoBody is a minimal placeholder (never indexed).
  ...adminGrowthRoutes,
];

/** Lookup helper used by useDocumentHead. */
export function getRouteSeo(pathname: string): SeoRoute {
  // Normalise: strip trailing slash except for root, ignore query/hash already done by router.
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return ROUTES.find((r) => r.path === path) ?? ROUTES[0];
}
