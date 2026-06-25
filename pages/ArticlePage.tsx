import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, Clock, CalendarDays, Linkedin, PlayCircle, Sparkles } from 'lucide-react';
import {
  ARTICLE_HUB_PATH,
  articlePath,
  articleVisualPath,
  getArticleBySlug,
  getRelatedArticles,
  getPrevNextArticles,
} from '../content/articles.meta';
import { loadArticleBody } from '../content/articles.body';
import { SITE } from '../seo.config';
import { trackEvent } from '../lib/analytics';

/**
 * "Build AI with Reeturaj" article page. Lazy-loaded (see index.tsx) so the
 * react-markdown chunk + the per-article markdown body only load when a reader
 * opens an article route. SEO head + JSON-LD are synced globally by RouteEffects
 * (index.tsx) via getRouteSeo, which finds the article's SeoRoute (baked shell
 * has TechArticle + FAQPage + BreadcrumbList). This component only renders the
 * reading experience + fires an article_view event.
 */

const formatDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * The article markdown body starts with the abstract as a `>` blockquote (also
 * surfaced as the on-page direct-answer callout + schema abstract). Strip that
 * leading blockquote so the abstract isn't rendered twice.
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

/**
 * The article markdown body ends with a `## Frequently Asked Questions` section
 * (Q/A prose) that is ALSO rendered on-page as the meta.faq `<details>` accordion
 * (and baked into the crawlable shell + FAQPage schema). Strip the markdown FAQ
 * section from the client-rendered body so the FAQ isn't shown twice — the
 * `<details>` accordion is the on-page source; the shell + schema carry the
 * crawlable FAQ text. Keeps the `---` author sign-off + hashtags that follow.
 */
function stripFaqSection(md: string): string {
  const lines = md.split('\n');
  const faqIdx = lines.findIndex((l) => /^##\s+Frequently Asked Questions/i.test(l.trim()));
  if (faqIdx === -1) return md;
  let dashIdx = -1;
  for (let i = faqIdx + 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i].trim())) {
      dashIdx = i;
      break;
    }
  }
  const out = dashIdx === -1 ? lines.slice(0, faqIdx) : [...lines.slice(0, faqIdx), ...lines.slice(dashIdx)];
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** Convert a YouTube watch URL to an embed URL; pass other URLs through. */
function toEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  a: ({ href, children, ...rest }) => {
    const external = href?.startsWith('http');
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    ) : (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
};

const ArticlePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const meta = slug ? getArticleBySlug(slug) : undefined;
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!meta) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadArticleBody(meta.slug)
      .then((md) => {
        if (cancelled) return;
        setBody(md);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBody(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Scroll to top + fire analytics on each article open.
  useEffect(() => {
    if (meta) trackEvent('article_view', { slug: meta.slug, category: meta.category });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [meta]);

  const related = useMemo(() => (meta ? getRelatedArticles(meta, 3) : []), [meta]);
  const prevNext = useMemo(() => (meta ? getPrevNextArticles(meta) : null), [meta]);

  if (!meta) {
    return (
      <div className="min-h-screen bg-[#030508] text-[#e8eef8]">
        <ArticleNav />
        <main className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-6">
          <p className="eyebrow-line justify-center text-[#96b0c8]">404</p>
          <h1 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Article not found</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#9fb6cc]">
            The article you&apos;re looking for doesn&apos;t exist or hasn&apos;t been published yet.
          </p>
          <Link
            to={ARTICLE_HUB_PATH}
            className="mt-8 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#f59f4f]/35 bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-5 py-2.5 text-sm font-semibold text-[#0a0c10]"
          >
            <ArrowLeft size={16} /> Back to all articles
          </Link>
        </main>
      </div>
    );
  }

  const heroSrc = articleVisualPath(meta);
  const hasVisual = Boolean(meta.visual);

  return (
    <div className="min-h-screen bg-[#030508] text-[#e8eef8]">
      <ArticleNav />

      <article className="relative">
        {/* Hero banner: per-article visual, or a branded gradient fallback. */}
        <div className="relative overflow-hidden border-b border-white/[0.06]">
          {hasVisual ? (
            <div className="relative h-[260px] w-full sm:h-[340px] lg:h-[420px]">
              <img
                src={heroSrc}
                alt={meta.title}
                className="h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#030508] via-[#030508]/40 to-transparent" />
            </div>
          ) : (
            <div className="relative h-[200px] w-full bg-gradient-to-br from-[#171008] via-[#0f161f] to-[#0a1019] sm:h-[260px]">
              <div
                className="absolute inset-0 opacity-[0.5]"
                style={{
                  background:
                    'radial-gradient(ellipse 700px 300px at 15% 0%, rgba(245,159,79,0.22), transparent 55%), radial-gradient(ellipse 600px 280px at 100% 120%, rgba(111,141,255,0.18), transparent 55%)',
                }}
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl px-5 pb-10 sm:px-6">
          {/* Breadcrumb */}
          <nav className="-mt-6 relative z-10 flex flex-wrap items-center gap-1.5 text-[12px] text-[#8eaac5]">
            <Link to="/" className="hover:text-white">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to={ARTICLE_HUB_PATH} className="hover:text-white">Learn AI with Reeturaj</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-[#c8d8ea]">{meta.category}</span>
          </nav>

          {/* Header */}
          <header className="mt-6">
            <p className="eyebrow-line text-[#f6bf84]">{meta.category}</p>
            <h1 className="mt-3 text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-[44px]">
              {meta.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#9ab2c9]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} className="text-[#f59f4f]" /> {formatDate(meta.datePublished)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} className="text-[#f59f4f]" /> {meta.readMinutes} min read
              </span>
              <span className="inline-flex items-center gap-1.5">
                By <span className="font-semibold text-white">Reeturaj Goswami</span>
              </span>
            </div>
          </header>

          {/* Direct-answer callout (also the schema abstract + seoBody). */}
          <aside className="mt-7 rounded-2xl border border-[#f59f4f]/25 bg-[#f59f4f]/[0.06] p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f6bf84]">
              <Sparkles size={12} /> In short
            </p>
            <p className="text-[15px] leading-[1.7] text-[#e6edf3] sm:text-[16px]">{meta.abstract}</p>
          </aside>

          {/* Body */}
          <div className="prose prose-invert prose-orange mt-8 max-w-none text-[#e6edf3] prose-p:leading-[1.75] prose-headings:scroll-mt-24 prose-headings:text-white prose-a:text-[#f5b76f] prose-strong:text-white prose-code:before:hidden prose-code:after:hidden">
            {loading ? (
              <p className="text-[#9fb6cc]">Loading article…</p>
            ) : body ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {stripFaqSection(stripLeadingBlockquote(body))}
              </ReactMarkdown>
            ) : (
              <p className="text-[#9fb6cc]">This article&apos;s content is unavailable.</p>
            )}
          </div>

          {/* FAQ (mirrors the FAQPage JSON-LD). */}
          <section className="mt-12" aria-label="Frequently asked questions">
            <h2 className="text-2xl font-bold text-white">Frequently asked questions</h2>
            <div className="mt-5 space-y-3">
              {meta.faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 open:border-[#f59f4f]/30"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-white">
                    {item.q}
                    <span className="text-[#f59f4f] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[14px] leading-[1.7] text-[#a6bdd3]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Video / LinkedIn CTA */}
          <section className="mt-12 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8">
            {meta.videoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                <iframe
                  src={toEmbedUrl(meta.videoUrl)}
                  title={`${meta.title} — video`}
                  className="h-full w-full"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Watch the video breakdown</h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#a6bdd3]">
                    The founder shares the practical, behind-the-build version of this article on
                    LinkedIn — implementation notes, failures, and what actually shipped.
                  </p>
                </div>
                <a
                  href={SITE.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('article_watch_linkedin', { slug: meta.slug })}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-[#f59f4f]/35 bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-5 py-2.5 text-sm font-semibold text-[#0a0c10] transition-all hover:-translate-y-0.5"
                >
                  <Linkedin size={16} /> Watch on LinkedIn
                </a>
              </div>
            )}
          </section>

          {/* Prev / next */}
          {prevNext && (
            <nav className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="More articles">
              <Link
                to={articlePath(prevNext.prev.slug)}
                className="group flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition-all hover:border-[#f59f4f]/30"
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8eaac5]">
                  <ArrowLeft size={12} /> Previous
                </span>
                <span className="text-sm font-semibold text-white group-hover:text-[#f5b76f]">
                  {prevNext.prev.title}
                </span>
              </Link>
              <Link
                to={articlePath(prevNext.next.slug)}
                className="group flex flex-col items-end gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-right transition-all hover:border-[#f59f4f]/30"
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8eaac5]">
                  Next <ArrowRight size={12} />
                </span>
                <span className="text-sm font-semibold text-white group-hover:text-[#f5b76f]">
                  {prevNext.next.title}
                </span>
              </Link>
            </nav>
          )}
        </div>
      </article>

      {/* Related articles */}
      {related.length > 0 && (
        <section className="border-t border-white/[0.06] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-5xl px-5 sm:px-6">
            <h2 className="text-2xl font-bold text-white">Keep learning</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={articlePath(r.slug)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all hover:border-[#f59f4f]/35"
                >
                  <div className="h-32 w-full overflow-hidden bg-[#0f1520]">
                    <img
                      src={articleVisualPath(r)}
                      alt={r.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fb2d0]">
                      {r.category}
                    </p>
                    <h3 className="mt-2 text-[15px] font-semibold leading-snug text-white group-hover:text-[#f5b76f]">
                      {r.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#93abc2]">{r.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <ArticleFooter />
    </div>
  );
};

/** Compact top nav — mirrors the hub's nav so navigation feels continuous. */
const ArticleNav: React.FC = () => (
  <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030508]/80 backdrop-blur-2xl">
    <div className="mx-auto flex h-[60px] w-full max-w-5xl items-center justify-between px-5 sm:px-6">
      <Link to={ARTICLE_HUB_PATH} className="group flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18] transition-all group-hover:border-[#f59f4f]/40">
          <img src="/inbharat-logo.svg" alt="InBharat logo" className="h-5 w-5 object-contain" width={20} height={20} />
        </div>
        <div>
          <p className="text-[13px] font-semibold tracking-[0.2em] text-white">INBHARAT</p>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#96b0c8]">Founder Learning Hub</p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          to={ARTICLE_HUB_PATH}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-[#c8d8ea] transition-all hover:border-white/25 hover:text-white"
        >
          <ArrowLeft size={15} /> All articles
        </Link>
        <Link
          to="/app"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#f59f4f]/35 bg-gradient-to-r from-[#f59f4f] to-[#f5b76f] px-4 py-2 text-sm font-semibold text-[#0a0c10]"
        >
          <PlayCircle size={15} /> Try InBharat AI
        </Link>
      </div>
    </div>
  </nav>
);

const ArticleFooter: React.FC = () => (
  <footer className="border-t border-white/[0.05] py-10">
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#8eaac5]">InBharat.ai Founder Learning Hub</p>
      <div className="flex flex-wrap gap-4 text-[12px] text-[#9bb4cc]">
        <Link to="/" className="transition-colors hover:text-white">Home</Link>
        <Link to={ARTICLE_HUB_PATH} className="transition-colors hover:text-white">Learn AI</Link>
        <Link to="/app" className="transition-colors hover:text-white">InBharat AI</Link>
        <Link to="/contact" className="transition-colors hover:text-white">Contact</Link>
      </div>
    </div>
  </footer>
);

export default ArticlePage;