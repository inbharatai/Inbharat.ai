import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getRouteSeo, SITE, GLOBAL_SCHEMA } from '../seo.config';

/**
 * Lightweight document-head sync. No external dependency (no react-helmet).
 *
 * For routes that already have a pre-built SEO shell in `dist/` (see
 * scripts/build-seo.mjs), this hook is mostly a no-op for crawlers — the
 * shell's <title> and meta are correct on first paint. For client-side
 * navigations after that, this updates the same tags so users see the
 * right titles in their tabs and so bookmarks pick up the right title.
 */
export function useDocumentHead(overrides?: {
  title?: string;
  description?: string;
}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = getRouteSeo(pathname);
    const title = overrides?.title ?? seo.title;
    const description = overrides?.description ?? seo.description;
    const fullUrl = SITE.url + (pathname === '/' ? '/' : pathname);
    const ogImageUrl = SITE.url + (seo.ogImage ?? SITE.ogImage);

    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1');
    setLink('canonical', fullUrl);

    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', fullUrl);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', ogImageUrl);
    setMeta('property', 'og:site_name', SITE.name);
    setMeta('property', 'og:locale', SITE.locale);

    setMeta('name', 'twitter:card', SITE.twitterCard);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', ogImageUrl);

    // Sync JSON-LD: replace any blocks tagged with data-seo-jsonld, leave others alone.
    document.querySelectorAll('script[data-seo-jsonld]').forEach((n) => n.remove());
    const blocks = [...GLOBAL_SCHEMA, ...(seo.extraSchema ?? [])];
    for (const block of blocks) {
      const tag = document.createElement('script');
      tag.type = 'application/ld+json';
      tag.dataset.seoJsonld = 'true';
      tag.textContent = JSON.stringify(block);
      document.head.appendChild(tag);
    }
  }, [pathname, overrides?.title, overrides?.description]);
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}
