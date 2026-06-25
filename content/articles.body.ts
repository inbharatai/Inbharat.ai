/**
 * Lazy per-slug article body loader.
 *
 * import.meta.glob with eager:false + ?raw lets Vite code-split each markdown
 * body into its own tiny chunk, loaded only when an article route opens. Bodies
 * stay out of the main bundle (seo.config.ts imports only articles.meta, never
 * this file). Requires vite/client types — see vite-env.d.ts at repo root.
 */
const modules = import.meta.glob('./articles/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
}) as Record<string, () => Promise<unknown>>;

/**
 * Returns the raw markdown body for `slug`, or null if no such article file
 * exists (ArticlePage renders NotFound for unknown slugs).
 */
export async function loadArticleBody(slug: string): Promise<string | null> {
  const loader = modules[`./articles/${slug}.md`];
  if (!loader) return null;
  const body = (await loader()) as string | undefined;
  return body ?? null;
}