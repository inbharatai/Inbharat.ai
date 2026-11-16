import { validArticleDate } from '../content/article-lifecycle.ts';

export type DisplayArticle = { slug: string; datePublished?: string; dateModified?: string; repositoryRecordedAt?: string };

export function formatArticleDate(iso: string | undefined, short = false): string {
  if (!validArticleDate(iso, new Date().toISOString().slice(0, 10))) return 'Publication date not recorded';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    ...(short ? {} : { day: 'numeric' as const }), month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Repository dates may order an undated article; they never label it published. */
export function compareArticleRecency(a: DisplayArticle, b: DisplayArticle): number {
  const date = (article: DisplayArticle): string => {
    const today = new Date().toISOString().slice(0, 10);
    if (validArticleDate(article.datePublished, today)) return article.datePublished;
    const recorded = article.repositoryRecordedAt;
    if (typeof recorded === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(recorded) &&
        Number.isFinite(Date.parse(recorded)) && validArticleDate(recorded.slice(0, 10), today)) return recorded.slice(0, 10);
    return '';
  };
  return date(b).localeCompare(date(a)) || a.slug.localeCompare(b.slug);
}
