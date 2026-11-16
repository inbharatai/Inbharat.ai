import { READINESS_LABELS, PRIVATE_AI_EVIDENCE_SCOPE, type PrivateAiPage } from '../content/privateAI.ts';
import { escapeRenderingText as text, renderStaticFaqs } from './rendering-contract.ts';

/** Full shared product content, not an independently maintained SEO summary. */
export function renderPrivateAiStaticContent(page: PrivateAiPage): string {
  return [
    `<header><p>${text(page.eyebrow)}</p><h1>${text(page.h1)}</h1><p>${text(page.description)}</p><p>${text(page.status)}</p></header>`,
    `<section><p>${text(page.audienceTitle ?? 'Built for real work')}</p><h2>${text(page.capabilitiesHeading ?? 'Capabilities, with honest readiness')}</h2><p>${text(page.audience)}</p><p>${text(PRIVATE_AI_EVIDENCE_SCOPE)}</p>`,
    ...page.capabilities.map((cap) => `<article><h3>${text(cap.name)}</h3><p>Readiness: ${text(READINESS_LABELS[cap.readiness])}</p><p>${text(cap.what)}</p>${cap.evidence ? `<p>Evidence / validation scope: ${text(cap.evidence)}</p>` : ''}</article>`),
    '</section><section><h2>How we approach privacy and trust</h2>',
    ...page.sections.map((section) => `<article><h3>${text(section.title)}</h3><p>${text(section.body)}</p></article>`),
    '</section>',
    renderStaticFaqs(page.faqs),
    '<p><a href="/contact">Discuss early access</a> · <a href="/unoone">Explore UnoOne</a></p>',
  ].join('\n');
}
