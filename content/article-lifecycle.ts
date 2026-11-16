/** Calendar dates are claims, not build timestamps. Unknown dates stay unknown. */
export function validArticleDate(value: unknown, today?: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    && (!today || value <= today);
}

export type ArticleDates = { datePublished?: string; dateModified?: string };

/** An invalid modification date must not mask a valid known publication date. */
export function articleLastmod(meta: ArticleDates, today = new Date().toISOString().slice(0, 10)): string | null {
  const published = validArticleDate(meta.datePublished, today) ? meta.datePublished : null;
  const modified = validArticleDate(meta.dateModified, today) ? meta.dateModified : null;
  return modified && (!published || modified >= published) ? modified : published;
}

export function articleSchemaDates(meta: ArticleDates, today = new Date().toISOString().slice(0, 10)): ArticleDates {
  const published = validArticleDate(meta.datePublished, today) ? meta.datePublished : undefined;
  const modified = articleLastmod(meta, today);
  return { ...(published ? { datePublished: published } : {}), ...(modified ? { dateModified: modified } : {}) };
}
