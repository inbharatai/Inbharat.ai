/**
 * JSON-LD schema builders for articles.
 *
 * Pure functions that take an ArticleMeta + the shared SITE/author objects as
 * parameters (no import of seo.config values at module-eval time → avoids any
 * circular-init hazard with seo.config, which imports these builders while
 * constructing its ROUTES array). Called from:
 *   - seo.config.ts        → bakes TechArticle/FAQPage/BreadcrumbList into each
 *                            article's static shell via build-seo.ts.
 *   - ArticlePage.tsx      → re-emits the same blocks on client navigation
 *                            (useDocumentHead already syncs them via getRouteSeo,
 *                            but keeping the builder here lets the page render
 *                            its own canonical block if needed).
 */
import type { ArticleMeta } from './articles.meta.js';
import { ARTICLE_HUB_PATH, articlePath, articleVisualPath } from './articles.meta.js';

type Schema = Record<string, unknown>;

/** Minimal shape of SITE from seo.config — passed in, not imported, to stay decoupled. */
export type SiteLike = {
  url: string;
  name: string;
  social: { linkedin: string; twitter: string; github: string; instagram: string };
};

/** Minimal shape of the founder Person object from seo.config. */
export type PersonLike = {
  '@type': string;
  name: string;
  url: string;
  sameAs?: string[];
  worksFor?: Record<string, unknown>;
};

export function buildTechArticle(
  meta: ArticleMeta,
  site: SiteLike,
  author: PersonLike,
): Schema {
  const url = site.url + articlePath(meta.slug);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.description,
    abstract: meta.abstract,
    url,
    image: site.url + articleVisualPath(meta),
    datePublished: meta.datePublished,
    dateModified: meta.datePublished,
    inLanguage: 'en',
    author: {
      '@type': 'Person',
      name: author.name,
      url: author.url,
      sameAs: author.sameAs,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
    about: meta.abstract,
    proficiencyLevel: 'Beginner to Intermediate',
    dependencies: 'None — conceptual article',
    articleSection: meta.category,
    keywords: (meta.hashtags ?? []).join(', '),
  };
}

export function buildArticleFaq(meta: ArticleMeta): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: meta.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export function buildArticleBreadcrumb(meta: ArticleMeta, site: SiteLike): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: site.url + '/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Learn AI with Reeturaj',
        item: site.url + ARTICLE_HUB_PATH,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: meta.title,
        item: site.url + articlePath(meta.slug),
      },
    ],
  };
}

/** All article schema blocks in shell order. */
export function buildArticleSchemas(
  meta: ArticleMeta,
  site: SiteLike,
  author: PersonLike,
): Schema[] {
  return [
    buildTechArticle(meta, site, author),
    buildArticleFaq(meta),
    buildArticleBreadcrumb(meta, site),
  ];
}