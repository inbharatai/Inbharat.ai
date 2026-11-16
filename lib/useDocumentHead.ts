import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTES, SITE, GLOBAL_SCHEMA, type SeoRoute } from '../seo.config';
import { NOT_FOUND_RENDERING_SEO, normalizeRenderingPath, serializeInlineJson, SEO_JSONLD_ATTRIBUTE } from './rendering-contract';

/**
 * Lightweight document-head sync. No external dependency (no react-helmet).
 *
 * For routes that already have a pre-built SEO shell in `dist/` (see
 * scripts/build-seo.ts), this hook is mostly a no-op for crawlers — the
 * shell's <title> and meta are correct on first paint. For client-side
 * navigations after that, this updates the same tags so users see the
 * right titles in their tabs and so bookmarks pick up the right title.
 */
export function useDocumentHead(overrides?: {
  title?: string;
  description?: string;
}) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const matched = ROUTES.find((route) => route.path === normalizeRenderingPath(pathname));
    const seo: SeoRoute = matched ?? NOT_FOUND_RENDERING_SEO;
    const title = overrides?.title ?? seo.title;
    const description = overrides?.description ?? seo.description;
    const fullUrl = SITE.url + (matched?.path ?? normalizeRenderingPath(pathname));
    const ogImageUrl = SITE.url + (seo.ogImage ?? SITE.ogImage);

    document.title = title;
    setMeta('name', 'description', description);
    setMeta(
      'name',
      'robots',
      seo.noIndex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1'
    );
    if (seo.noIndex) {
      // noindex shells already carry no canonical link; keep it that way after
      // client-side navigation. Noindex is not an access-control mechanism.
      removeLink('canonical');
    } else {
      setLink('canonical', fullUrl);
    }

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

    if (!matched) setMeta('name', 'prerender-status-code', '404');
    else document.head.querySelectorAll('meta[name="prerender-status-code"]').forEach((el) => el.remove());

    // There are no localized canonical pages yet. Never retain alternates from
    // the previous route. Static generation rejects multilingual:true as well.
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());

    // Static and client blocks have the same owner; independent blocks survive.
    document.querySelectorAll(`script[${SEO_JSONLD_ATTRIBUTE}]`).forEach((n) => n.remove());
    const blocks = matched ? [...GLOBAL_SCHEMA, ...(seo.extraSchema ?? [])] : [];
    for (const block of blocks) {
      const tag = document.createElement('script');
      tag.type = 'application/ld+json';
      tag.setAttribute(SEO_JSONLD_ATTRIBUTE, 'true');
      tag.textContent = serializeInlineJson(block);
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

function removeLink(rel: string) {
  document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`).forEach((el) => el.remove());
}
