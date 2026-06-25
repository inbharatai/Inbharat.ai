/**
 * Single source of truth for per-route SEO metadata.
 *
 * Consumed by:
 *   - scripts/build-seo.mjs  (post-build: emits per-route HTML shells + sitemap.xml + og-image.png)
 *   - lib/useDocumentHead.ts (client-side: updates <title>/meta on route change)
 *
 * Add a new public route here ➜ it shows up in sitemap.xml, gets a pre-built
 * SEO shell (`dist/<path>/index.html`), and works with useDocumentHead.
 */

export const SITE = {
  url: 'https://inbharat.ai',
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
  contactEmail: 'reetu004@gmail.com',
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
// RHCF Seva, or UniGurus (per project constraints).
const ORG_SAMEAS = [
  SITE.social.instagram,
  SITE.social.linkedin,
  SITE.social.twitter,
  SITE.social.github,
  'https://jakswarm.com',
  'https://www.kathakitaab.com',
  'https://testsprep.in',
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
};

const baseWebsite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  inLanguage: SUPPORTED_LANGS.slice(),
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE.url}/app?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

/** Always shipped on every shell. */
export const GLOBAL_SCHEMA: Array<Record<string, unknown>> = [baseOrganization, baseWebsite];

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

const founderPerson = {
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
 * InBharat product suite — public live products as an ItemList so search and
 * AI engines see JAK Swarm, KathaKitaab, and TestsPrep as part of one
 * InBharat entity network. Only public live sites are listed.
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
        name: 'JAK Swarm',
        url: 'https://jakswarm.com',
        description:
          'Open-source, self-hostable agentic company OS with an evidence graph, drift detection, and JAK Shield risk gating.',
      },
    },
    {
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'WebApplication',
        name: 'KathaKitaab',
        url: 'https://www.kathakitaab.com',
        description: 'AI-powered interactive storybooks for children in Indian languages.',
      },
    },
    {
      '@type': 'ListItem',
      position: 3,
      item: {
        '@type': 'WebApplication',
        name: 'TestsPrep',
        url: 'https://testsprep.in',
        description: 'AI-driven adaptive test-preparation analytics.',
      },
    },
  ],
};

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
      h1: 'InBharat AI — Affordable AI Tools Built for Bharat',
      paragraphs: [
        'InBharat AI is an independent AI product studio building affordable, voice-first, multilingual AI tools for India. Our tools run in 11 Indian languages — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia, and Assamese — and work on any modern phone, tablet, or desktop with nothing to install.',
        'The InBharat product suite includes JAK Swarm, an open-source self-hostable agentic company OS with an evidence graph, drift detection, and JAK Shield risk gating; KathaKitaab, AI-powered interactive storybooks for children in Indian languages; and TestsPrep, AI-driven adaptive test-preparation analytics.',
        'The InBharat AI console offers voice-first agentic search and multi-modal AI with research, coding, education, executive, and shopper modes. You can try it free on the web with a few messages before signing in — no credit card required.',
        'InBharat AI is built for Bharat: small business owners automating operations, students preparing for exams, developers shipping faster, and teams that need AI in their own language. The console is voice-first so it works on low-end phones and patchy networks, and every response is grounded with live web search when facts matter.',
        'Trust and safety are first-class. JAK Swarm pairs an evidence graph with drift detection and a JAK Shield risk gate so agentic work is auditable and reversible; every approved artifact leaves an audit trail. The studio favours open-source, self-hostable components so teams keep control of their data.',
        'InBharat AI is an independent studio founded by Reeturaj Goswami, on a mission to make practical AI affordable and accessible across Indian languages, devices, and workflows — not a wrapper around a single model, but a suite of tools designed around how Bharat actually works.',
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
];

/** Lookup helper used by useDocumentHead. */
export function getRouteSeo(pathname: string): SeoRoute {
  // Normalise: strip trailing slash except for root, ignore query/hash already done by router.
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return ROUTES.find((r) => r.path === path) ?? ROUTES[0];
}
