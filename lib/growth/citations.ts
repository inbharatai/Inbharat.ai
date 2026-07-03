/**
 * InBharat Growth Agent — citation-marker stripper.
 *
 * Stage 2 grounding (retrieval.ts → formatGroundingBlock) feeds the drafter
 * numbered web_search sources and the prompt tells the model to "cite them where
 * relevant". The model emits inline academic-style markers like
 * "release. [2] This approach…" next to claims it grounded. Those markers are NOT
 * real markdown footnotes (there is no `[^N]: <url>` block appended), and
 * ArticlePage renders markdown with remark-gfm only (no footnote plugin), so a
 * bare `[N]` renders as literal bracket text mid-sentence — visible junk that
 * looks broken to readers, on a site that writes about rigor. (Bitten on the
 * evals article: 7 stray `[1]…[4]` markers shipped live 2026-07-03.)
 *
 * The grounding's real value is UPSTREAM — it stops the model inventing dates /
 * numbers / API names in the draft. The reader-facing `[N]` badges are a leakage
 * artifact, not the feature, so stripping them loses nothing functional and
 * removes the visual defect. Pure + hermetic (no React, no DB, no fetch) so it is
 * unit-testable. Applied both at draft time (articleWriter.ts) and as a
 * publish-time backstop (api/growth/publish.ts), mirroring the mermaid-sanitize
 * "final gate" pattern — the draft path cleans first so the founder never reviews
 * a draft with stray markers, and the publish path strips again so a draft made
 * before this guard can never commit markers to the repo.
 *
 * Preserves real markdown links: `[text](url)` and the numeric form `[1](url)` are
 * kept (a `[N]` immediately followed by `(` is a link, not a citation marker), and
 * a reference-definition line `[1]: url` is kept (a `[N]` immediately followed by
 * `:`). Only a bare `[N]` not followed by `(` or `:` is removed. Surrounding
 * horizontal whitespace is collapsed to a single space so "release. [2] This" →
 * "release. This" (no double space); only `[ \t]` is touched, never `\n`, so
 * paragraph breaks survive.
 */
export function stripCitationMarkers(markdown: string): string {
  if (!markdown) return markdown;
  // Bare `[N]` not followed by `(` (link) or `:` (reference def). Collapse
  // adjacent horizontal spaces to one. Newlines are deliberately excluded
  // (only [ \t], not \s) so paragraph breaks are preserved.
  return markdown.replace(/[ \t]*\[(\d+)\](?![(:])[ \t]*/g, " ");
}