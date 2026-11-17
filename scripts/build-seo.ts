/**
 * Post-build SEO step. Run via `tsx` (see package.json `build` script).
 *
 *   1. Emit per-route HTML shells (`dist/<route>/index.html`) with route-specific
 *      <title>, meta description, canonical, OG/Twitter, hreflang, and JSON-LD.
 *      Vercel serves these as static files BEFORE the SPA rewrite fires —
 *      crawlers get unique metadata, the React Router SPA still hydrates
 *      identically for users.
 *   2. Emit a fresh `dist/sitemap.xml` with current lastmod + hreflang
 *      alternates for all 11 languages on multilingual routes.
 *   3. Emit a 1200×630 `dist/og-image.png` composited from the existing
 *      1024-px logo + brand text (so social previews stop being broken).
 *   4. Convert the three large Ramayana scene PNGs to WebP siblings (~80%
 *      smaller) for the <picture> tags in Landing.tsx.
 *
 * Pure Node + sharp (already a devDependency). No new packages required.
 */

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { toHtml } from 'hast-util-to-html';
import { ROUTES, SITE, GLOBAL_SCHEMA, SUPPORTED_LANGS } from '../seo.config';
import type { SeoRoute } from '../seo.config';
import { ARTICLES, articlePath, articleVisualPath } from '../content/articles.meta';
import { computeRouteLastmod } from '../lib/growth/sitemap-lastmod';
import { formatArticleDate, compareArticleRecency } from '../lib/article-display';
import { articleLastmod } from '../content/article-lifecycle';
import { execSync } from 'node:child_process';
import { verifySourceProvenance } from '../lib/growth/source-provenance';
import { createCanonicalSnapshot, CANONICAL_MANIFEST_PATH } from '../lib/growth/canonical-article-sync';
import { UNOONE_PAGES } from '../content/privateAI';
import { DEEP_TECH_PROJECTS } from '../content/deepTech';
import { prepareArticleMarkdown, normalizeArticleHeadings } from '../lib/article-rendering';
import { SEO_JSONLD_ATTRIBUTE, serializeInlineJson, replaceManagedRoot, renderStaticFaqs, NOT_FOUND_RENDERING_SEO } from '../lib/rendering-contract';
import { renderPrivateAiStaticContent } from '../lib/private-ai-static-rendering';
import { renderStaticLanding } from '../components/landing/renderStaticLanding';
import { renderStaticUnoOne } from '../pages/unoone/renderStaticUnoOne';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* ------------------------------------------------------------------ */
/*                         HTML shell rewriting                       */
/* ------------------------------------------------------------------ */

type Site = typeof SITE;
type Schema = Record<string, unknown>;

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Last git commit date (`YYYY-MM-DD`) touching `file`, or null if git is
 * unavailable / the file is untracked. Injected into `computeRouteLastmod` so
 * the sitemap <lastmod> reflects real content-modification dates instead of
 * the build date. Stderr is suppressed so a missing git binary or untracked
 * file degrades gracefully to the caller's fallback.
 */
function gitLastmod(file: string): string | null {
  try {
    const out = execSync(`git log -1 --format=%cI -- ${file}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out ? out.slice(0, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Load .env from project root into process.env (only keys not already set), so
 * build-seo can read VITE_GA_MEASUREMENT_ID locally. On Vercel, env vars are
 * already in process.env. No keys are logged — secrets stay out of output.
 */
function loadEnvDefaults(): void {
  try {
    const content = readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env optional
  }
}

/**
 * The GA4 Measurement ID to bake into static shells, or '' if unset/invalid.
 * Validated strictly (G-XXXX… / UA-XXXX…) so a malformed env value can never
 * inject arbitrary markup into the HTML. Baking the gtag into the static shell
 * means non-JS tag detectors (e.g. Google's setup wizard raw fetch) see it,
 * while analytics.ts reuses it for SPA page_view events (no double-inject).
 */
function getGaMeasurementId(): string {
  const raw = (process.env.VITE_GA_MEASUREMENT_ID || '').trim();
  return /^[A-Z]{1,3}-[A-Z0-9_-]+$/i.test(raw) ? raw : '';
}

function buildGtagSnippet(gaId: string): string {
  if (!gaId) return '';
  return [
    '    <!-- Google tag (gtag.js) — GA4, baked into the static shell so tag detectors see it -->',
    `    <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>`,
    `    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}',{send_page_view:false});</script>`,
  ].join('\n');
}

function buildHeadInjection(
  route: SeoRoute,
  site: Site,
  globalSchema: Schema[],
  supportedLangs: readonly string[],
): string {
  if (route.multilingual) throw new Error(`Localized canonical routes must be implemented before enabling hreflang: ${route.path}`);
  const fullUrl = site.url + (route.path === '/' ? '/' : route.path);
  const ogImage = route.ogImage ? site.url + route.ogImage : site.url + site.ogImage;
  // Google Search Console ownership verification token (build-time env). When
  // set, every shell gets the verification meta so you can claim the property
  // in GSC without a separate deploy. Leave unset until you generate a token.
  const gscVerification = (process.env.GSC_SITE_VERIFICATION || '').trim();

  const hreflangLinks = route.multilingual
    ? supportedLangs
        .map((lang) => {
          const href =
            lang === 'en'
              ? `${site.url}${route.path === '/' ? '/' : route.path}`
              : `${site.url}${route.path === '/' ? '/' : route.path}?lang=${lang}`;
          return `    <link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
        })
        .concat([
          `    <link rel="alternate" hreflang="x-default" href="${escapeAttr(site.url + (route.path === '/' ? '/' : route.path))}" />`,
        ])
        .join('\n')
    : '';

  const schemaScripts = [...globalSchema, ...(route.extraSchema ?? [])]
    .map(
      (obj) =>
        `    <script type="application/ld+json" ${SEO_JSONLD_ATTRIBUTE}="true">${serializeInlineJson(obj)}</script>`,
    )
    .join('\n');

  // GA4 gtag baked into the static shell so raw-HTML tag detectors (Google's
  // setup wizard, GTM preview) see it without executing JS. analytics.ts still
  // reuses window.gtag for SPA page_view events — dedup guard prevents a second
  // loader. Empty string when no valid measurement ID is configured.
  const gtagSnippet = buildGtagSnippet(getGaMeasurementId());

  return [
    // GSC verification must be in <head>; inject first so it's never lost.
    gscVerification
      ? `    <meta name="google-site-verification" content="${escapeAttr(gscVerification)}" />`
      : '',
    // GA4 tag — high in <head> so detectors + first-hit page_view fire ASAP.
    gtagSnippet,
    `    <title>${escapeText(route.title)}</title>`,
    `    <meta name="description" content="${escapeAttr(route.description)}" />`,
    // Private/admin routes (noIndex) get noindex,nofollow so they're never
    // indexed even though they have a prebuilt shell; public routes stay indexable.
    route.noIndex
      ? `    <meta name="robots" content="noindex, nofollow" />`
      : `    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    route.noIndex ? '' : `    <link rel="canonical" href="${escapeAttr(fullUrl)}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:url" content="${escapeAttr(fullUrl)}" />`,
    `    <meta property="og:title" content="${escapeAttr(route.title)}" />`,
    `    <meta property="og:description" content="${escapeAttr(route.description)}" />`,
    `    <meta property="og:image" content="${escapeAttr(ogImage)}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:site_name" content="${escapeAttr(site.name)}" />`,
    `    <meta property="og:locale" content="${escapeAttr(site.locale)}" />`,
    `    <meta name="twitter:card" content="${escapeAttr(site.twitterCard)}" />`,
    `    <meta name="twitter:title" content="${escapeAttr(route.title)}" />`,
    `    <meta name="twitter:description" content="${escapeAttr(route.description)}" />`,
    `    <meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
    hreflangLinks,
    schemaScripts,
  ]
    .filter(Boolean)
    .join('\n');
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(normalizeArticleHeadings).use(remarkRehype);

/**
 * Render an article markdown body to safe HTML for the crawlable shell.
 * hast-util-to-html escapes raw HTML by default, so this is safe to inject.
 * Bodies are read at build time only — they never enter the client bundle
 * (ArticlePage loads them lazily via import.meta.glob at runtime).
 */
async function renderArticleBody(slug: string): Promise<string> {
  const file = path.join(ROOT, 'content', 'articles', `${slug}.md`);
  let md: string;
  try {
    md = await fs.readFile(file, 'utf8');
  } catch {
    throw new Error(`[build-seo] article body missing for "${slug}"; refusing an incomplete published shell`);
  }
  if (!md.trim()) throw new Error(`[build-seo] article body empty for "${slug}"`);
  const article = ARTICLES.find((item) => item.slug === slug);
  const mdast = markdownProcessor.parse(prepareArticleMarkdown(md, article?.abstract, article?.faq.map((faq) => faq.q)));
  const hast = await markdownProcessor.run(mdast);
  const rendered = toHtml(hast);
  // Indent each line by 4 spaces so it nests cleanly inside the <section>.
  return rendered
    .split('\n')
    .map((l) => (l ? `    ${l}` : l))
    .join('\n');
}

/** Normal, accessible navigation in the no-JS fallback. Not a ranking guarantee. */
const HOMEPAGE_ARTICLE_LINKS = 12;

function buildInternalLinkNav(route: SeoRoute): string {
  const targets = (ROUTES as SeoRoute[]).filter(
    (r) => r.path !== route.path && !r.noIndex && !r.excludeFromSitemap && !r.articleSlug,
  );

  const links = targets.map(
    (r) => `      <li><a href="${escapeAttr(r.path)}">${escapeText(r.title)}</a></li>`,
  );

  // Seed article discovery straight from the homepage, newest first.
  if (route.path === '/') {
    const recent = [...ARTICLES]
      .sort(compareArticleRecency)
      .slice(0, HOMEPAGE_ARTICLE_LINKS);
    for (const a of recent) {
      links.push(
        `      <li><a href="${escapeAttr(articlePath(a.slug))}">${escapeText(a.title)}</a></li>`,
      );
    }
  }

  if (links.length === 0) return '';
  return `    <nav aria-label="Site">\n      <ul>\n${links.join('\n')}\n      </ul>\n    </nav>`;
}

function buildBodyInjection(route: SeoRoute, bodyHtml: string): string {
  const nav = buildInternalLinkNav(route);
  const privateAiPage = UNOONE_PAGES.find((page) => page.path === route.path);
  const article = route.articleSlug ? ARTICLES.find((item) => item.slug === route.articleSlug) : undefined;
  const parts = privateAiPage ? [renderPrivateAiStaticContent(privateAiPage)] : [
    `<h1>${escapeText(route.seoBody?.h1 ?? route.title)}</h1>`,
    ...(route.seoBody?.paragraphs ?? [route.description]).map((p) => `<p>${escapeText(p)}</p>`),
    bodyHtml,
    article ? renderStaticFaqs(article.faq) : '',
  ];
  if (route.path === '/' || route.path === '/about') {
    parts.push('<section><h2>Research and product sources</h2><ul>' + DEEP_TECH_PROJECTS.map((project) =>
      `<li><a href="${escapeAttr(project.publicUrl)}">Explore ${escapeText(project.name)}</a> · <a href="${escapeAttr(project.repository)}">${project.id === 'pai' ? 'Historical portable research source' : 'SILT research source'}</a></li>`
    ).join('') + '</ul></section>');
  }
  if (nav) parts.push(nav);
  // Scoped CSS is carried by (and retired with) the managed fallback. No changes
  // to the mounted React design or global styles; readable even if CSS fails.
  return `<main id="main-content" data-static-fallback="seo" style="min-height:100vh;background:#030508;color:#e8eef8;padding:48px max(24px,calc((100% - 960px)/2));font:16px/1.75 system-ui,sans-serif;overflow-wrap:anywhere">
<style>[data-static-fallback="seo"] h1{font-size:2.4rem;line-height:1.2;margin:0 0 24px}[data-static-fallback="seo"] h2{font-size:1.7rem;margin:32px 0 16px}[data-static-fallback="seo"] h3{font-size:1.2rem;margin:24px 0 12px}[data-static-fallback="seo"] p{margin:12px 0}[data-static-fallback="seo"] a{color:#f5b76f;text-decoration:underline}[data-static-fallback="seo"] pre{overflow:auto;padding:16px;background:#111a2e}[data-static-fallback="seo"] img{max-width:100%;height:auto}[data-static-fallback="seo"] details{padding:16px 0}[data-static-fallback="seo"] summary{font-weight:700;cursor:pointer}[data-static-fallback="seo"] ul,[data-static-fallback="seo"] ol{padding-left:24px;list-style:revert}</style>
${parts.filter(Boolean).join('\n')}
</main>`;
}

// Tiny inline lucide-style icons (12px, currentColor stroke) for the static
// card footer — mirrors <Clock/>, <CalendarDays/>, <ArrowRight/> in the React
// grid so the no-JS fallback looks identical to the hydrated app.
const SVG_CLOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const SVG_CAL = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>';
const SVG_ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';



/**
 * Build a VISIBLE, fully-styled article grid as static HTML for the
 * /learn-ai-with-reeturaj shell, injected INSIDE <div id="root">. The markup
 * mirrors ArticleExplorer in pages/LearnAIWithReeturaj.tsx card-for-card (same
 * Tailwind classes, same newest-first ordering), only with real <a href> links
 * and inline SVG icons instead of react-router <Link> + lucide components.
 *
 * Why: on real mobile browsers the React app intermittently fails to mount
 * (stale carrier-proxy HTML referencing a dead /assets hash, a hydration error,
 * or a Motion/IntersectionObserver hiccup) — and when React never mounts,
 * #root is empty so the article grid is blank even though the static shell
 * loaded fine. Putting the cards in the HTML itself means they are visible the
 * instant the HTML parses, BEFORE any JS runs. On a successful mount, React's
 * createRoot replaces #root's children with the interactive grid (search +
 * category filters) — no flash, since the static cards are visually identical.
 * On any mount failure, the static cards remain. This breaks the "blank on
 * mobile" failure mode regardless of its cause. Not cloaking: the React app
 * renders the same cards. This fallback is retired on the first React commit.
 */
function buildHubCardGrid(): string {
  const cards = [...ARTICLES]
    .sort(compareArticleRecency)
    .map((a) => {
      const href = escapeAttr(articlePath(a.slug));
      const img = escapeAttr(articleVisualPath(a));
      const title = escapeText(a.title);
      const desc = escapeText(a.description);
      const cat = escapeText(a.category);
      const date = escapeText(formatArticleDate(a.datePublished, true));
      const mins = escapeText(String(a.readMinutes));
      return [
        `      <article class="group transition-transform duration-300 hover:-translate-y-1.5">`,
        `        <a href="${href}" class="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent transition-all duration-300 hover:border-[#f59f4f]/35">`,
        `          <div class="relative h-36 w-full overflow-hidden bg-[#0f1520]">`,
        `            <img src="${img}" alt="${title}" loading="lazy" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`,
        `            <span class="absolute left-3 top-3 rounded-full bg-[#030508]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffd7ae] backdrop-blur">${cat}</span>`,
        `          </div>`,
        `          <div class="flex flex-1 flex-col p-5">`,
        `            <h3 class="text-[16px] font-semibold leading-snug text-white group-hover:text-[#f5b76f]">${title}</h3>`,
        `            <p class="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[#a6bdd3]">${desc}</p>`,
        `            <div class="mt-4 flex items-center gap-3 text-[11px] text-[#7e98b3]">`,
        `              <span class="inline-flex items-center gap-1">${SVG_CLOCK} ${mins} min</span>`,
        `              <span class="inline-flex items-center gap-1">${SVG_CAL} ${date}</span>`,
        `              <span class="ml-auto inline-flex items-center gap-1 font-semibold text-[#f5b76f]">Read ${SVG_ARROW}</span>`,
        `            </div>`,
        `          </div>`,
        `        </a>`,
        `      </article>`,
      ].join('\n');
    })
    .join('\n');

  return [
    `    <div class="landing-shell relative min-h-screen bg-[#030508] text-[#e8eef8]" data-static-fallback="learn-ai">`,
    `      <div class="mx-auto w-full max-w-[1120px] px-5 py-16 sm:py-20">`,
    `        <p class="text-[12px] font-bold uppercase tracking-[0.18em] text-[#f59f4f]">Article Library</p>`,
    `        <h1 class="mt-3 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[40px]">Learn AI with Reeturaj</h1>`,
    `        <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9ab2c9]">Practical, jargon-free AI articles built for Bharat — AI agents, RAG, vibe coding, DevSecOps, and Desh Ka AI. (The full interactive view loads shortly.)</p>`,
    `        <div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">`,
    cards,
    `        </div>`,
    `      </div>`,
    `    </div>`,
  ].join('\n');
}

/**
 * Replace the SEO-relevant tags in the built index.html with route-specific ones.
 * Strategy: keep everything in index.html (Vite-injected scripts, fonts, etc.),
 * but blow away the existing title/description/canonical/OG/Twitter/JSON-LD/robots
 * and inject the route's values in their place.
 */
async function rewriteShell(
  baseHtml: string,
  route: SeoRoute,
  site: Site,
  globalSchema: Schema[],
  supportedLangs: readonly string[],
): Promise<string> {
  let html = baseHtml;

  // 1. Strip the existing SEO surface — keep viewport, charset, theme-color,
  //    favicons, fonts, Vite-injected <script>/<link>, etc.
  const stripPatterns = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<meta\s+name=["']keywords["'][^>]*>\s*/gi,
    /<meta\s+name=["']robots["'][^>]*>\s*/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /<link\s+rel=["']alternate["'][^>]*hreflang=[^>]*>\s*/gi,
    /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    // Migration cleanup for shells produced by the old hidden-body builder.
    // New fallbacks live exclusively in #root and are replaced idempotently.
    /<section\s+aria-hidden="true"\s+style="position:absolute;width:1px;[\s\S]*?<\/section>\s*/gi,
  ];
  for (const pat of stripPatterns) html = html.replace(pat, '');

  // 2. Inject the new SEO block right before </head>.
  const injection = buildHeadInjection(route, site, globalSchema, supportedLangs);
  html = html.replace(/<\/head>/i, () => `\n${injection}\n  </head>`);

  // 3. Make sure manifest is linked (added once on the root shell, repeated everywhere).
  if (!/rel=["']manifest["']/i.test(html)) {
    html = html.replace(
      /<\/head>/i,
      `    <link rel="manifest" href="/manifest.json" />\n  </head>`,
    );
  }

  // Static content lives exclusively INSIDE the root owned by React. createRoot
  // replaces it on commit; no duplicate or stale body survives SPA navigation.
  const bodyHtml = route.articleSlug ? await renderArticleBody(route.articleSlug) : '';
  const fallback = route.path === '/' ? await renderStaticLanding()
    : route.path === '/learn-ai-with-reeturaj' ? buildHubCardGrid()
      : renderStaticUnoOne(route.path) ?? buildBodyInjection(route, bodyHtml);
  html = replaceManagedRoot(html, fallback);

  return html;
}

/* ------------------------------------------------------------------ */
/*                              sitemap                               */
/* ------------------------------------------------------------------ */

function buildSitemap(
  routes: SeoRoute[],
  site: Site,
  supportedLangs: readonly string[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  // Share article date validation with TechArticle schema. Unknown/future
  // dates are omitted rather than replaced with today's build timestamp.
  const articleDates = new Map<string, string | null>(
    ARTICLES.map((a) => [a.slug, articleLastmod(a, today)]),
  );
  const urls = routes
    // Defensive: exclude both noIndex and excludeFromSitemap. Today every
    // noIndex route also sets excludeFromSitemap, but a future noIndex-only
    // route must never leak into the sitemap (Google flags a sitemap URL that
    // carries a noindex meta as a contradiction).
    .filter((r) => !r.noIndex && !r.excludeFromSitemap)
    .map((r) => {
      const loc = site.url + (r.path === '/' ? '/' : r.path);
      // Non-article dates use available source history; missing history stays unknown.
      const lastmod = computeRouteLastmod(
        r,
        r.articleSlug ? articleDates.get(r.articleSlug) ?? null : null,
        gitLastmod,
        today,
      );
      const alts = r.multilingual
        ? supportedLangs
            .map((lang) => {
              const href =
                lang === 'en'
                  ? loc
                  : `${loc}${loc.includes('?') ? '&' : '?'}lang=${lang}`;
              return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
            })
            .concat([
              `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeAttr(loc)}" />`,
            ])
            .join('\n')
        : '';
      return [
        '  <url>',
        `    <loc>${escapeText(loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
        `    <changefreq>${r.changefreq}</changefreq>`,
        `    <priority>${r.priority.toFixed(1)}</priority>`,
        alts,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/* ------------------------------------------------------------------ */
/*                            og-image.png                            */
/* ------------------------------------------------------------------ */

async function buildOgImage() {
  const W = 1200;
  const H = 630;
  const logoPath = path.join(ROOT, 'public', 'inbharat-logo-1024.png');

  // Background gradient (dark, matches site theme).
  const bgSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0d1117"/>
          <stop offset="50%" stop-color="#11161f"/>
          <stop offset="100%" stop-color="#1a0d05"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0%" stop-color="#f59f4f" stop-opacity="0.18"/>
          <stop offset="60%" stop-color="#f59f4f" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#f59f4f"/>
    </svg>
  `);

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <style>
        .brand { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; fill: #ffffff; }
        .tag   { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 500; fill: #a8bfd4; }
        .accent{ fill: #f59f4f; }
      </style>
      <text x="600" y="320" text-anchor="middle" class="brand" font-size="78">InBharat AI</text>
      <text x="600" y="380" text-anchor="middle" class="tag" font-size="30">Private AI and practical tools for Bharat</text>
      <text x="600" y="450" text-anchor="middle" class="tag" font-size="20" opacity="0.7">UnoOne · research · learning</text>
      <circle cx="240" cy="520" r="3" class="accent"/>
      <text x="260" y="528" class="tag" font-size="18" opacity="0.85">inbharat.ai</text>
    </svg>
  `);

  type Layer = { input: Buffer; top: number; left: number };
  let logoLayer: Layer | null = null;
  try {
    const logoBuf = await sharp(logoPath)
      .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    logoLayer = { input: logoBuf, top: 110, left: Math.round(W / 2) - 90 };
  } catch {
    /* logo missing — text-only fallback */
  }

  const composite: Layer[] = [{ input: textSvg, top: 0, left: 0 }];
  if (logoLayer) composite.unshift(logoLayer);

  await sharp(bgSvg)
    .composite(composite)
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(path.join(DIST, 'og-image.png'));
}

/** Product social preview uses the owner-requested transparent dark derivative.
 * Original letter/eye geometry and violet accent are retained; no white plate. */
async function buildUnoOneOgImage() {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="unoone-bg" x2="1" y2="1"><stop stop-color="#080c16"/><stop offset="1" stop-color="#1c1736"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#unoone-bg)"/>
    <rect x="32" y="32" width="1136" height="566" rx="24" fill="none" stroke="#37324f"/>
    <style>text{font-family:Arial,Helvetica,sans-serif}</style>
    <text x="318" y="118" fill="#b6bed0" font-size="23">by InBharat.ai</text>
    <text x="72" y="296" fill="#ffffff" font-size="70" font-weight="700">Models change.</text>
    <text x="72" y="390" fill="#c6abff" font-size="70" font-weight="700">Your work stays yours.</text>
    <text x="76" y="470" fill="#c1c8d8" font-size="25">Local models · Encrypted memory · Permission-controlled tools</text>
    <text x="76" y="556" fill="#a8b1c6" font-size="21">UnoOne Power · UnoOne Mobile · Explore requirements &amp; availability</text>
  </svg>`);
  const logo = await sharp(path.join(ROOT, 'public', 'unoone', 'unoone-logo-dark.png'))
    .resize(216, 120, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await fs.mkdir(path.join(DIST, 'unoone'), { recursive: true });
  await sharp(svg).composite([{ input: logo, left: 72, top: 60 }]).png({ compressionLevel: 9 })
    .toFile(path.join(DIST, 'unoone', 'og-image.png'));
}

/* ------------------------------------------------------------------ */
/*                       WebP for big PNG scenes                      */
/* ------------------------------------------------------------------ */

async function buildSceneWebPs() {
  const sceneDir = path.join(DIST, 'kathakitaab');
  try {
    const entries = await fs.readdir(sceneDir);
    for (const name of entries) {
      if (!name.endsWith('.png')) continue;
      const inPath = path.join(sceneDir, name);
      const outPath = path.join(sceneDir, name.replace(/\.png$/, '.webp'));
      try {
        await sharp(inPath).webp({ quality: 78, effort: 5 }).toFile(outPath);
      } catch (err) {
        console.warn(
          `[build-seo] WebP conversion failed for ${name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch {
    /* directory missing in dist — nothing to do */
  }
}

/* ------------------------------------------------------------------ */
/*                                main                                */
/* ------------------------------------------------------------------ */

async function main() {
  // Local .env defaults may configure rendering, never manufacture hosted-build identity.
  const provenanceEnv = { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA };
  // Make VITE_GA_MEASUREMENT_ID / GSC_SITE_VERIFICATION available at build time
  // locally (from .env); on Vercel they are already in process.env.
  loadEnvDefaults();

  const distExists = await fs
    .stat(DIST)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!distExists) {
    console.error('[build-seo] dist/ does not exist — did `vite build` run?');
    process.exit(1);
  }

  const baseHtmlPath = path.join(DIST, 'index.html');
  const baseHtml = await fs.readFile(baseHtmlPath, 'utf8');

  let shellsWritten = 0;
  for (const route of ROUTES) {
    const html = await rewriteShell(
      baseHtml,
      route,
      SITE,
      GLOBAL_SCHEMA as Schema[],
      SUPPORTED_LANGS,
    );
    if (route.path === '/') {
      await fs.writeFile(baseHtmlPath, html, 'utf8');
    } else {
      const dir = path.join(DIST, route.path.replace(/^\//, ''));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
    }
    shellsWritten++;
  }

  // Static-host 404 fallback: no homepage entities or indexable canonical.
  // HTTP status is controlled by the host, not this document.
  const notFound = await rewriteShell(baseHtml, NOT_FOUND_RENDERING_SEO, SITE, [], SUPPORTED_LANGS);
  await fs.writeFile(path.join(DIST, '404.html'), notFound, 'utf8');

  const sitemap = buildSitemap(ROUTES as SeoRoute[], SITE, SUPPORTED_LANGS);
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

  await buildOgImage();
  await buildUnoOneOgImage();
  await buildSceneWebPs();

  // Hash exact final on-disk HTML, after all shell rendering. Public content only.
  // A local, dirty, uncommitted, preview or unidentified build cannot authorize sync.
  const sourceCommitSha = provenanceEnv.VERCEL_GIT_COMMIT_SHA;
  const sourceProvenance = await verifySourceProvenance({ root: ROOT, env: provenanceEnv });
  // Fixed reason codes and counts only; never log paths, environment values or errors.
  console.log(`[build-seo] publication source eligibility ${JSON.stringify(sourceProvenance)}`);
  const bodies: Record<string, string> = {};
  const finalHtml: Record<string, string> = {};
  for (const article of ARTICLES) {
    bodies[article.slug] = await fs.readFile(path.join(ROOT, 'content', 'articles', `${article.slug}.md`), 'utf8');
    finalHtml[article.slug] = await fs.readFile(path.join(DIST, articlePath(article.slug), 'index.html'), 'utf8');
  }
  const snapshot = createCanonicalSnapshot({ articles: ARTICLES, bodies, html: finalHtml,
    builtAt: new Date().toISOString(), sourceCommitSha, cleanSource: sourceProvenance.eligible, sourceProvenance,
    productionBuild: provenanceEnv.VERCEL === '1' && provenanceEnv.VERCEL_ENV === 'production' });
  const serialized = JSON.stringify(snapshot);
  await fs.mkdir(path.join(DIST, 'article-publication'), { recursive: true });
  // Immutable content-addressed artifact plus current canonical pointer (same bytes).
  await fs.writeFile(path.join(DIST, 'article-publication', `${snapshot.snapshotId}.json`), serialized, 'utf8');
  await fs.writeFile(path.join(DIST, CANONICAL_MANIFEST_PATH.slice(1)), serialized, 'utf8');
  console.log(`[build-seo] publication snapshot ${snapshot.snapshotId}; automatedSyncEligible=${snapshot.automatedSyncEligible}`);

  console.log(
    `[build-seo] wrote ${shellsWritten} HTML shell(s), sitemap.xml, og-image.png, and WebP siblings.`,
  );
}

main().catch((err) => {
  console.error('[build-seo] failed:', err);
  process.exit(1);
});
