/**
 * InBharat Growth — Gate 7: platform formatting (static rules per platform).
 *
 * LinkedIn: 60–90 words (excluding the trailing hashtag line), ≤3000 chars, no
 *   markdown (**bold**, _italic_, ## headings, `code`). Plain text only.
 * inbharat (article): no platform-specific check — the article is the canonical
 *   original; returns pass. The SEO/GEO gate (6) covers article quality.
 *
 * DEV.to, Hashnode, and Medium have been removed.
 *
 * HONEST: regex-based format checks, not a render preview. A caption that
 * passes word-count + no-markdown can still read awkwardly live — that's the
 * founder's eyes at approval, not this gate. Pure + hermetic.
 */
import type { GateFinding } from "../gates.js";

export type PlatformKind = "linkedin" | "inbharat";

function countWords(caption: string): number {
  // Strip a trailing hashtag line (a line whose tokens are mostly #tags) so the
  // 60–90 word target applies to the caption prose only (per the promoter prompt).
  const lines = caption.split(/\n/);
  let body = caption;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    const tokens = line.split(/\s+/);
    const tagTokens = tokens.filter((t) => /^#[a-z0-9]+$/i.test(t));
    if (tokens.length > 0 && tagTokens.length / tokens.length >= 0.5) {
      body = lines.slice(0, i).join("\n");
    }
    break;
  }
  const prose = body.replace(/[#*_`~>-]/g, " ").replace(/\s+/g, " ").trim();
  return prose ? prose.split(/\s+/).length : 0;
}

function hasMarkdown(caption: string): boolean {
  return /(\*\*|__|##|`|^\s*[-*]\s)/m.test(caption);
}

export interface PlatformFormatResult {
  findings: GateFinding[];
}

export function checkPlatformFormat(body: string, platform: PlatformKind, opts?: { canonicalPresent?: boolean }): PlatformFormatResult {
  void opts;
  const findings: GateFinding[] = [];
  const b = body ?? "";
  switch (platform) {
    case "linkedin": {
      const words = countWords(b);
      if (words < 60) findings.push({ severity: "minor", message: `LinkedIn caption is short (${words} words; target 60–90).`, fix: "Add a hook line or one more concrete teaser sentence." });
      if (words > 90) findings.push({ severity: "minor", message: `LinkedIn caption is long (${words} words; target 60–90).`, fix: "Trim to a hook + 1–2 line teaser + CTA." });
      if (b.length > 3000) findings.push({ severity: "major", message: `LinkedIn caption exceeds 3000 chars (${b.length}) — LinkedIn truncates posts.`, fix: "Cut to ≤3000 chars (the hook + first paragraph survive; the rest becomes 'see more')." });
      if (hasMarkdown(b)) findings.push({ severity: "major", message: "LinkedIn caption contains markdown (** _ ## `) — LinkedIn renders these as literal characters.", fix: "Rewrite as plain text with normal punctuation only." });
      break;
    }
    case "inbharat":
    default:
      // The article is the canonical original — no platform-format constraint.
      break;
  }
  return { findings };
}