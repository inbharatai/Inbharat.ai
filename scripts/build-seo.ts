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
import { execSync } from 'node:child_process';

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
        `    <script type="application/ld+json">${JSON.stringify(obj)}</script>`,
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
    `    <link rel="canonical" href="${escapeAttr(fullUrl)}" />`,
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

/**
 * Build the crawlable body section for a shell. The React app mounts into
 * #root, so non-JS / AI-search crawlers (Perplexity, ChatGPT, CCBot, …) that
 * don't execute JS would otherwise see an empty page. This injects a
 * visually-hidden, screen-reader-skipped (aria-hidden) <section> with a
 * faithful H1 + summary of what the app renders — no cloaking. JS-rendering
 * crawlers (Googlebot) see the real React content instead.
 */
/**
 * Strip the leading `>` blockquote run from an article markdown body. The
 * article files open with the abstract as a blockquote (also surfaced as the
 * on-page direct-answer callout + schema abstract + seoBody paragraph 1), so
 * removing it here keeps the abstract from appearing twice in the crawlable
 * shell. Mirrors stripLeadingBlockquote in pages/ArticlePage.tsx.
 */
function stripLeadingBlockquote(md: string): string {
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || !lines[i].trimStart().startsWith('>')) return md;
  while (i < lines.length && lines[i].trimStart().startsWith('>')) i++;
  if (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

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
    // Missing/stale .md must NOT kill the whole build (sitemap + og-image + all
    // other shells). Degrade to empty — the shell still emits the h1 + abstract
    // seoBody, and verify-shell-crawl will flag a silently-empty body for rag.
    // eslint-disable-next-line no-console
    console.warn(`[build-seo] article body missing for "${slug}" — shell will use seoBody only`);
    return '';
  }
  const mdast = markdownProcessor.parse(stripLeadingBlockquote(md));
  const hast = await markdownProcessor.run(mdast);
  let rendered = toHtml(hast);
  // The article's canonical H1 is the seoBody <h1> (the article title). A
  // markdown body that starts with `# Title` would render a SECOND <h1> —
  // demote every <h1> in the body to <h2> so each article page has exactly
  // one H1 (correct heading hierarchy + avoids the multiple-H1 SEO flag).
  rendered = rendered.replace(/<h1/g, '<h2').replace(/<\/h1>/g, '</h2>');
  // Indent each line by 4 spaces so it nests cleanly inside the <section>.
  return rendered
    .split('\n')
    .map((l) => (l ? `    ${l}` : l))
    .join('\n');
}

function buildBodyInjection(route: SeoRoute, bodyHtml: string): string {
  if (!route.seoBody) return '';
  // The hub route's visible H1 comes from buildHubCardGrid (injected into #root
  // as real, non-aria-hidden HTML). Emitting a seoBody <h1> too would give the
  // page two H1s — skip it for the hub; the crawlable summary paragraphs remain.
  const skipH1 = route.path === '/learn-ai-with-reeturaj';
  const parts = [
    ...(skipH1 ? [] : [`    <h1>${escapeText(route.seoBody.h1)}</h1>`]),
    ...route.seoBody.paragraphs.map((p) => `    <p>${escapeText(p)}</p>`),
  ];
  if (bodyHtml) parts.push(bodyHtml);
  const joined = parts.join('\n');
  // Visually-hidden (sr-only) inline style so no CSS dependency; aria-hidden so
  // screen-reader users don't hear a duplicate of the React app. The full
  // rendered article body is included so non-JS / AI-search crawlers (Perplexity,
  // ChatGPT, CCBot) see the real content — the React app renders the same
  // markdown, so this is not cloaking.
  return `  <section aria-hidden="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">\n${joined}\n  </section>\n`;
}

// Tiny inline lucide-style icons (12px, currentColor stroke) for the static
// card footer — mirrors <Clock/>, <CalendarDays/>, <ArrowRight/> in the React
// grid so the no-JS fallback looks identical to the hydrated app.
const SVG_CLOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const SVG_CAL = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>';
const SVG_ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

function fmtArticleDate(iso: string): string {
  // Mirror the React grid: en-IN, month short + year, UTC.
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

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
 * renders the same cards, and crawlers already get the sr-only seoBody above.
 */
function buildHubCardGrid(): string {
  const cards = [...ARTICLES]
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0))
    .map((a) => {
      const href = escapeAttr(articlePath(a.slug));
      const img = escapeAttr(articleVisualPath(a));
      const title = escapeText(a.title);
      const desc = escapeText(a.description);
      const cat = escapeText(a.category);
      const date = escapeText(fmtArticleDate(a.datePublished));
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
    // The crawlable seoBody <section aria-hidden> injected in step 4 below. Without
    // this, build-seo is NOT idempotent: re-running it on an already-built dist
    // (e.g. `npm run build:seo` without a fresh `vite build` first) would inject a
    // SECOND seoBody before #root, duplicating the H1. The clip-style prefix
    // targets exactly the injected block (no other <section> uses this style).
    /<section\s+aria-hidden="true"\s+style="position:absolute;width:1px;[\s\S]*?<\/section>\s*/gi,
  ];
  for (const pat of stripPatterns) html = html.replace(pat, '');

  // 2. Inject the new SEO block right before </head>.
  const injection = buildHeadInjection(route, site, globalSchema, supportedLangs);
  html = html.replace(/<\/head>/i, `\n${injection}\n  </head>`);

  // 3. Make sure manifest is linked (added once on the root shell, repeated everywhere).
  if (!/rel=["']manifest["']/i.test(html)) {
    html = html.replace(
      /<\/head>/i,
      `    <link rel="manifest" href="/manifest.json" />\n  </head>`,
    );
  }

  // 4. Inject crawlable body content before #root so non-JS / AI-search
  //    crawlers see real text (H1 + summary) instead of an empty shell. For
  //    article routes, the full rendered markdown body is included so AI-search
  //    crawlers see the complete article (the React app renders the same
  //    markdown — no cloaking).
  const bodyHtml = route.articleSlug ? await renderArticleBody(route.articleSlug) : '';
  const bodyInjection = buildBodyInjection(route, bodyHtml);
  if (bodyInjection) {
    html = html.replace(/<div id="root">/i, `${bodyInjection}  <div id="root">`);
  }

  // 5. For the founder hub route only, inject a visible, fully-styled static
  //    article grid INSIDE #root so the cards render in pure HTML before the
  //    SPA mounts (and remain visible if it never does). See buildHubCardGrid.
  if (route.path === '/learn-ai-with-reeturaj') {
    const grid = buildHubCardGrid();
    html = html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">\n${grid}\n    </div>`);
  }

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
  // slug → datePublished, so article <url> entries get a truthful lastmod
  // (the article's publish date) instead of the build date. Non-article routes
  // keep the build date as lastmod (they have no per-content date).
  const articleLastmod = new Map<string, string>(
    ARTICLES.map((a) => [a.slug, a.datePublished]),
  );
  const urls = routes
    // Defensive: exclude both noIndex and excludeFromSitemap. Today every
    // noIndex route also sets excludeFromSitemap, but a future noIndex-only
    // route must never leak into the sitemap (Google flags a sitemap URL that
    // carries a noindex meta as a contradiction).
    .filter((r) => !r.noIndex && !r.excludeFromSitemap)
    .map((r) => {
      const loc = site.url + (r.path === '/' ? '/' : r.path);
      // Truthful lastmod: articles → manifest datePublished; non-article routes →
      // last git commit touching the route's backing source files (see
      // lib/growth/sitemap-lastmod.ts ROUTE_LASTMOD_SOURCE); fallback today.
      const lastmod = computeRouteLastmod(
        r,
        r.articleSlug ? articleLastmod.get(r.articleSlug) ?? null : null,
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
        `    <lastmod>${lastmod}</lastmod>`,
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
      <text x="600" y="380" text-anchor="middle" class="tag" font-size="30">Affordable AI tools built for Bharat</text>
      <text x="600" y="450" text-anchor="middle" class="tag" font-size="20" opacity="0.7">11 Indian languages · voice-first · open</text>
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

  const sitemap = buildSitemap(ROUTES as SeoRoute[], SITE, SUPPORTED_LANGS);
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

  await buildOgImage();
  await buildSceneWebPs();

  console.log(
    `[build-seo] wrote ${shellsWritten} HTML shell(s), sitemap.xml, og-image.png, and WebP siblings.`,
  );
}

main().catch((err) => {
  console.error('[build-seo] failed:', err);
  process.exit(1);
});
