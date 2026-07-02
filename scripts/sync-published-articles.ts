/**
 * SEO infra (NOT the Growth Agent) — mirror content/articles.meta.ts into the
 * `published_articles` Supabase table on every build.
 *
 * Why: the growth agent commits new articles to GitHub (content/articles/*.md +
 * content/articles.meta.ts) but never writes a DB row with the canonical URL +
 * SEO fields. This script is the non-growth bridge: it reads the same
 * articles.meta.ts that drives the sitemap and upserts one row per article into
 * published_articles (slug, title, canonical_url, publish_date, category,
 * keywords, platform='inbharat', syndication_type='original'). The PRIMARY KEY
 * on slug means a re-publish upserts — never duplicates (dedupe by slug).
 *
 * medium_url / linkedin_url / syndication capture are intentionally NOT done
 * here — they require growth-agent edits the user has forbidden. Those columns
 * stay NULL until a future, separate change.
 *
 * NON-FATAL: if Supabase env vars are absent or the upsert fails, this script
 * logs a warning and exits 0. It must NEVER break the build. The sitemap +
 * shells are already correct from build-seo.ts; this DB mirror is a bonus
 * SEO-memory record, not a build prerequisite.
 *
 * Run via tsx (see package.json `build`): tsx scripts/sync-published-articles.ts
 */
import { createHash } from 'node:crypto';
import { ARTICLES, articlePath } from '../content/articles.meta';
import { SITE } from '../seo.config';
import { supabaseAdmin } from '../api/lib/supabaseAdmin';

function shaOf(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

async function main(): Promise<void> {
  if (!supabaseAdmin) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sync-published-articles] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping DB mirror (non-fatal).',
    );
    return;
  }

  const rows = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    canonical_url: SITE.url + articlePath(a.slug),
    publish_date: a.datePublished,
    category: a.category,
    keywords: a.hashtags ?? [],
    platform: 'inbharat',
    syndication_type: 'original',
    source_meta_sha: shaOf({
      slug: a.slug,
      title: a.title,
      datePublished: a.datePublished,
      category: a.category,
      hashtags: a.hashtags ?? [],
    }),
  }));

  // Batch upsert — on conflict(slug) update; only re-write rows whose
  // source_meta_sha changed would be ideal, but a flat upsert of 18 rows is
  // cheap and keeps synced_at fresh as a "last seen" timestamp.
  const { error } = await supabaseAdmin
    .from('published_articles')
    .upsert(rows, { onConflict: 'slug' });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[sync-published-articles] upsert failed (non-fatal): ${error.message}. The published_articles table may not exist yet — apply supabase/migrations/20260702120000_published_articles.sql via \`supabase db push\`.`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[sync-published-articles] mirrored ${rows.length} article(s) into published_articles.`,
  );
}

main()
  .catch((err) => {
    // Never fail the build.
    // eslint-disable-next-line no-console
    console.warn(`[sync-published-articles] unexpected error (non-fatal): ${String(err)}`);
  })
  .finally(() => {
    // Ensure the process exits even if the Supabase client holds the event loop.
    process.exit(0);
  });