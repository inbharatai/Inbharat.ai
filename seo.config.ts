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

const ORG_SAMEAS = [SITE.social.instagram, SITE.social.linkedin, SITE.social.twitter];

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

export const ROUTES: SeoRoute[] = [
  {
    path: '/',
    title: 'InBharat AI — Affordable AI Tools Built for Bharat',
    description: SITE.description,
    priority: 1.0,
    changefreq: 'weekly',
    multilingual: true,
    extraSchema: [homepageFAQ],
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
  },
];

/** Lookup helper used by useDocumentHead. */
export function getRouteSeo(pathname: string): SeoRoute {
  // Normalise: strip trailing slash except for root, ignore query/hash already done by router.
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return ROUTES.find((r) => r.path === path) ?? ROUTES[0];
}
