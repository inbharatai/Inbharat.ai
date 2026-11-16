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
import { deepTechById } from './content/deepTech.js';
import { UNOONE_PAGES, PRIVATE_AI_EVIDENCE_SCOPE, READINESS_LABELS, type PrivateAiPage } from './content/privateAI.js';
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
    'InBharat.ai is a deep-tech artificial intelligence company building private agentic AI for a private world. Its flagship is PAI — one personal private AI agent — implemented through UnoOne Power (desktop) and UnoOne Mobile (Android). Research includes SILT, patent pending in India. Engineered in Bharat for the world.',
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

// Identity-equivalent organization profile only; products and founder profiles are separate entities.
const ORG_SAMEAS = [SITE.social.github];

const ORGANIZATION_ID = `${SITE.url}/#organization`;
const FOUNDER_ID = `${SITE.url}/#founder-reeturaj-goswami`;
const WEBSITE_ID = `${SITE.url}/#website`;

const baseOrganization = {
  '@context': 'https://schema.org',
  '@id': ORGANIZATION_ID,
  '@type': 'Organization',
  name: SITE.name,
  alternateName: SITE.shortName,
  url: SITE.url,
  logo: `${SITE.url}/inbharat-logo-1024.png`,
  description:
    'Deep-tech artificial intelligence company building foundational systems for trustworthy, private and local-first AI — including PAI through UnoOne, agent security and hardware-aware AI. SILT and the historical Pocket AI portable architecture have recorded Indian patent applications. Engineered in Bharat for the world.',
  areaServed: 'IN',
  sameAs: ORG_SAMEAS,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SITE.contactEmail,
    availableLanguage: ['English'],
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
    '@id': FOUNDER_ID,
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
  '@id': FOUNDER_ID,
  '@type': 'Person',
  name: 'Reeturaj Goswami',
  jobTitle: 'Founder & Builder',
  worksFor: { '@id': ORGANIZATION_ID, '@type': 'Organization', name: SITE.name, url: SITE.url },
  url: `${SITE.url}/learn-ai-with-reeturaj`,
  image: `${SITE.url}/reeturaj-founder.jpg`,
  sameAs: [SITE.social.linkedin, SITE.social.twitter].filter(Boolean),
  hasCredential: credentialSchemaNodes('person'),
  award: awardStrings('person'),
};

const baseWebsite = {
  '@context': 'https://schema.org',
  '@id': WEBSITE_ID,
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  inLanguage: 'en',
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
        text: "InBharat.ai builds private agentic AI. Its flagship is PAI, one personal private AI agent implemented through UnoOne Power (Windows development build) and UnoOne Mobile (Android alpha). SILT and the historical Pocket AI portable architecture are research projects with recorded Indian patent applications, not product certifications.",
      },
    },
    {
      '@type': 'Question',
      name: 'What is PAI and UnoOne?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "PAI (pronounced “Pi”) is our personal private AI agent. UnoOne implements it through Power for Windows and Mobile for Android. Both are in development; no public installer is offered, and phone–desktop continuity is not yet qualified end to end. The InBharat AI web console is separate.",
      },
    },
    {
      '@type': 'Question',
      name: 'Does PAI send my data to the cloud?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Personal memory is encrypted in each device’s local store and core inference is local. Optional searches, mail connectors, browser navigation, confirmed form submissions and uploads can send queries, requests, fields or selected files to external services. Permissions bound these actions; local storage does not mean all network traffic stays on-device.",
      },
    },
    {
      '@type': 'Question',
      name: 'Which Indian languages does InBharat AI support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "The language selector lists English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia and Assamese. Translations are partial, with English fallback. This does not establish complete UI, model or speech support in every product; a public product-by-language-by-modality matrix is still pending.",
      },
    },
    {
      '@type': 'Question',
      name: 'Is InBharat AI free to try?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yes. You get a few free messages on the InBharat AI console before signing in. No credit card required.",
      },
    },
    {
      '@type': 'Question',
      name: 'Does InBharat AI work on mobile?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "The website and separate web console work in mobile browsers. UnoOne Mobile is an Android alpha, not a broadly released app; hardware, Android permissions and per-feature validation determine compatibility.",
      },
    },
    {
      '@type': 'Question',
      name: 'How do I contact the InBharat team?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Email us, or reach out on LinkedIn, X, Instagram, or GitHub. All channels are listed on the contact page.",
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
    '@id': ORGANIZATION_ID,
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
  },
  inLanguage: 'en',
};

// Exported so ArticlePage.tsx can reuse the same author entity for its
// client-side JSON-LD (kept in sync with the baked shell schema).
export const founderPerson = {
  '@context': 'https://schema.org',
  '@id': FOUNDER_ID,
  '@type': 'Person',
  name: 'Reeturaj Goswami',
  url: SITE.url + '/learn-ai-with-reeturaj',
  worksFor: {
    '@id': ORGANIZATION_ID,
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
  },
  sameAs: [SITE.social.linkedin, SITE.social.twitter],
};

/**
 * InBharat foundational deep-tech layer — SILT and Pocket AI as first-class
 * patent-pending technologies. Exposed as an ItemList so search and AI engines
 * understand the company as an AI infrastructure builder, not a services shop.
 */
const deepTechSuite = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'InBharat AI foundational deep-tech',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      item: {
        '@type': 'ResearchProject',
        name: 'SILT',
        url: 'https://silt.inbharat.ai',
        description:
          `${deepTechById.silt.description} Patent pending in India (application 202631101454).`,
        identifier: '202631101454',
      },
    },
    {
      '@type': 'ListItem',
      position: 2,
      item: {
        '@type': 'ResearchProject',
        name: 'Pocket AI',
        url: 'https://github.com/inbharatai/PAI.V2',
        description:
          'Historical Pocket AI portable host-adaptive architecture, recorded as Indian patent application 202631102427. The removable-drive formulation is prior research, not the current PAI software product or evidence that all UnoOne features are covered.',
        identifier: '202631102427',
      },
    },
    {
      '@type': 'ListItem',
      position: 3,
      item: {
        '@type': 'SoftwareApplication',
        name: 'UnoOne',
        url: SITE.url + '/unoone',
        description:
          'The software ecosystem that implements PAI, one personal private AI agent — UnoOne Power for Windows desktop and laptop, and UnoOne Mobile for Android — with local models, permission-controlled tools and encrypted personal memory.',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows, Android',
      },
    },
  ],
};

/**
 * InBharat product suite — all 15 ecosystem products as an ItemList so search
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
          "A separate web console for agentic search and chat, with specialist modes for coding, education, research, shopping and enterprise work. Not the UnoOne local agent.",
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
          "Agent observability tooling with dashboard, session replay and cost analytics. Supported integrations and model pricing depend on the repository version.",
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
          "A personal AI workspace project for Indian users: chat, voice, document reading, translation, notes and information workflows. Language and feature availability depend on the build.",
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
          "Field-assistance project for Anganwadi workflows, including growth records, document reading and scheme lookup. Not a claim of government deployment or clinically validated diagnosis; access and validation are scoped per engagement.",
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
          "AI-assisted international admissions planning, university matching and scholarship discovery. Guidance, not a guarantee of admission, immigration status or scholarships.",
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
          "WhatsApp-oriented conversational support for student queries, admissions guidance and helpdesk workflows. Ask the team about access and the supported language set.",
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
          "AI social-media automation with local encrypted credential storage. Generation providers and publishing platforms receive the data required by the actions you configure; local storage does not mean all data stays on-device.",
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
          "Setup tooling for OpenClaw via Docker, with gateway and AI-provider configuration. Setup time and compatibility depend on the host and selected provider.",
      },
    },
    {
      '@type': 'ListItem',
      position: 13,
      item: {
        '@type': 'SoftwareApplication',
        name: 'UnoOne',
        url: SITE.url + '/unoone',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows, Android',
        description:
          "PAI through UnoOne Power (Windows development build) and UnoOne Mobile (Android alpha). Local models, per-device encrypted memory and permission-controlled tools. No public installer; cross-device sync remains unqualified.",
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
          "Personal health-screening project exploring questionnaires, camera-based vital estimation, lab-report reading and voice input. Not a medical diagnosis or validated replacement for clinical measurement.",
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
    '@id': FOUNDER_ID,
    '@type': 'Person',
    name: 'Reeturaj Goswami',
    url: SITE.url + '/learn-ai-with-reeturaj',
    worksFor: {
      '@id': ORGANIZATION_ID,
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
    },
    sameAs: [SITE.social.linkedin, SITE.social.twitter],
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
    item: SITE.url + articlePath(a.slug),
    url: SITE.url + articlePath(a.slug),
    name: a.title,
  })),
};

/** Audience line appended to every article's crawlable seoBody (paragraph 2). */
const ARTICLE_AUDIENCE_LINE =
  'A practical, jargon-free guide for Indian engineering teams and founders — part of the Learn AI with Reeturaj series on InBharat AI.';

/**
 * Private-AI / UnoOne routes are generated from content/privateAI.ts so the
 * crawlable body, FAQ schema, titles and the visible pages share one source
 * of truth — the same text a reader sees on-page is what the shell emits.
 * Per-path priority/changefreq tuning lives in the override map below.
 */
const UNOONE_PRIORITY: Record<string, { priority: number; changefreq: 'weekly' | 'monthly' | 'yearly' }> = {
  '/private-ai': { priority: 0.9, changefreq: 'weekly' },
  '/unoone': { priority: 0.9, changefreq: 'weekly' },
  '/unoone/power': { priority: 0.8, changefreq: 'monthly' },
  '/unoone/mobile': { priority: 0.8, changefreq: 'monthly' },
  '/unoone/sync': { priority: 0.6, changefreq: 'monthly' },
  '/enterprise-ai': { priority: 0.7, changefreq: 'monthly' },
  '/technology': { priority: 0.7, changefreq: 'monthly' },
};

const unooneFaqSchema = (page: PrivateAiPage) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: page.faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: { '@type': 'Answer', text: faq.a },
  })),
});

const privateAiRoutes: SeoRoute[] = UNOONE_PAGES.map((page) => {
  const tuning = UNOONE_PRIORITY[page.path] ?? { priority: 0.6, changefreq: 'monthly' as const };
  return {
    path: page.path,
    title: `${page.h1} | InBharat.ai`,
    description: page.description,
    priority: tuning.priority,
    changefreq: tuning.changefreq,
    multilingual: false,
    extraSchema: [breadcrumb(page.eyebrow, page.path), unooneFaqSchema(page)],
    seoBody: {
      h1: page.h1,
      paragraphs: [page.description, page.status, page.audience, PRIVATE_AI_EVIDENCE_SCOPE, ...page.capabilities.map((cap) => `${cap.name} — ${READINESS_LABELS[cap.readiness]}. ${cap.what}${cap.evidence ? ` Evidence / validation scope: ${cap.evidence}` : ''}`), ...page.sections.map((section) => `${section.title}: ${section.body}`), ...page.faqs.map((faq) => `${faq.q} ${faq.a}`)],
    },
  };
});

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
    title: 'InBharat.ai | Private Agentic AI for a Private World',
    description:
      'Meet PAI — one personal private AI agent, implemented through UnoOne Power (desktop) and UnoOne Mobile (Android). Local models, permission-controlled tools, encrypted personal memory. Try the InBharat AI console free in your browser.',
    priority: 1.0,
    changefreq: 'weekly',
    // hreflang disabled until real localized route shells (/hi/, /bn/ …) exist:
    // ?lang= alternates canonicalize to the en URL, so they were inert and only
    // added GSC "alternate page with proper canonical tag" noise. The 11-language
    // UI switch still works via ?lang= — it's a UX feature, not an SEO one.
    multilingual: false,
    extraSchema: [homepageFAQ, deepTechSuite, productSuite],
    seoBody: {
      // Aligned to the visible React hero H1 (landHeroTitle1 + landHeroTitle2 =
      // "Your AI. Your devices. Your control.") so the crawler sr-only H1
      // and the on-page H1 match exactly. Branding stays in <title>/OG.
      h1: 'Your AI. Your devices. Your control.',
      paragraphs: [
        'InBharat.ai is a deep-tech artificial intelligence company building private agentic AI for a private world. Our flagship is PAI — one personal private AI agent, pronounced "Pi" — a persistent, permission-controlled personal AI experience, not a chatbot wrapper.',
        'PAI is brought to life through the UnoOne ecosystem: UnoOne Power, your desktop personal AI agent, and UnoOne Mobile, your Android personal AI agent — one agent experience spanning two devices, under your control. The model can change; your personal memory and permissions stay yours.',
        'How PAI is engineered: local models admitted by a measured memory budget on your own hardware; tool execution behind explicit, revocable permissions with approval cards; personal memory stored encrypted outside the model so context survives model switches; and bounded actions checked against their intended outcome with real receipts.',
        `SILT: ${deepTechById.silt.description} Pocket AI: ${deepTechById.pai.description} SILT is patent pending in India (application 202631101454); the Pocket AI portable architecture is preserved as a historical patent-pending filing (application 202631102427).`,
        'The InBharat product suite applies this foundation to real problems: JAK Swarm, an open-source self-hostable agentic company OS with evidence graphs, drift detection, and JAK Shield risk gating; JAK Shield, a universal agent security layer; KathaKitaab, AI-powered interactive storybooks in Indian languages; TestsPrep, AI-driven adaptive test-preparation analytics; UniAssist.ai, university guidance for international admissions; and the InBharat AI console, a voice-first agentic search platform.',
        'The InBharat AI console offers voice-first agentic search and multi-modal AI with research, coding, education, executive, and shopper modes. The language selector includes English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia and Assamese; translations are partial and speech coverage varies by product and build. You can try it free on the web with a few messages before signing in — no credit card required.',
        'Status, stated honestly: UnoOne Power is working development-stage software verified on a Windows test system; UnoOne Mobile is an Android alpha with green local test gates and device validation in progress; cross-device continuity is designed with tests and marked as in development until a full round trip is qualified. Evidence is scoped internal reporting, not independent certification or release qualification.',
        'InBharat.ai is founded by Reeturaj Goswami, on a mission to make private AI infrastructure accessible across Indian languages, devices, and workflows — not a wrapper around a single model, but deep-tech systems designed so intelligence, memory and controlled action stay close to their owner.',
        `Contact the InBharat team at ${SITE.url}/contact or email ${SITE.contactEmail} for early access, pilots, partnerships, or research collaboration on PAI, UnoOne and SILT.`,
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
        'The InBharat AI Console is a voice-first agentic AI for Bharat. It runs research, coding, education, executive, and shopper modes with 11 language selections and partial interface translations. Selection is not a promise of speech or model coverage in every language.',
        'Try it free on the web — no install needed and no credit card required. The console is fully responsive and works on phones, tablets, and desktops.',
      ],
    },
  },
  {
    path: '/about',
    title: 'About InBharat.ai — Deep-Tech AI Infrastructure for Bharat',
    description:
      'InBharat.ai is a deep-tech AI company building foundational systems for trustworthy, private and local-first AI — with PAI implemented through UnoOne Power (Windows) and UnoOne Mobile (Android), alongside SILT research.',
    priority: 0.7,
    changefreq: 'monthly',
    multilingual: false,
    extraSchema: [breadcrumb('About', '/about'), deepTechSuite, founderPerson],
    seoBody: {
      h1: 'About InBharat.ai — Deep-Tech AI Infrastructure for Bharat',
      paragraphs: [
        'InBharat.ai is a deep-tech artificial intelligence company building foundational systems for trustworthy, private and local-first AI. Its flagship is PAI, implemented through UnoOne Power (Windows development build) and UnoOne Mobile (Android alpha). Research includes SILT and the historical Pocket AI portable architecture. Alongside it are applied AI infrastructure (JAK Shield, JAK Swarm and InBharat Audio) and separate practical products (InBharat AI Console, UniAssist.ai, TestsPrep.in, KathaKitaab, and Sahayaak).',
        `SILT: ${deepTechById.silt.description} Pocket AI: ${deepTechById.pai.description} Both technologies are patent pending in India — applications 202631101454 (SILT) and 202631102427 (Pocket AI).`,
        'InBharat.ai was founded by Reeturaj Goswami and is engineered in Bharat for the world. The studio builds affordable AI tools for Bharat, including agentic search, coding assistants, education platforms, and business automation, while publishing open-source AI infrastructure so teams keep control of their data.',
      ],
    },
  },
  ...privateAiRoutes,
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
        'No hype. No jargon. Learn AI by building real tools for real problems. Follow the build journey on LinkedIn, and try the InBharat AI console for agentic AI with partial interface translations; speech coverage varies by product and build.',
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
