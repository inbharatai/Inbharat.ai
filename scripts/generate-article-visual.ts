/**
 * Generate a per-article hero/OG banner PNG (1200x627) in the branded InBharat
 * style — mirrors scripts/build-seo.ts `buildOgImage` (dark gradient + glow +
 * orange accent bar + logo), with the article category + title and a subtle
 * "agent -> review -> gate" pipeline motif. Writes to
 * public/learn-ai-with-reeturaj/<slug>.png so ArticlePage's hero renders the
 * full image banner (meta.visual set) instead of the small gradient fallback.
 *
 * Reusable for any article that has no dedicated visual yet:
 *   npx tsx scripts/generate-article-visual.ts <slug>
 *
 * Pure Node + sharp (already a devDependency). No new packages.
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getArticleBySlug, ARTICLE_ASSET_DIR } from "../content/articles.meta.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SCENE_DIR = path.join(PUBLIC_DIR, ARTICLE_ASSET_DIR); // public/learn-ai-with-reeturaj

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npx tsx scripts/generate-article-visual.ts <slug>");
  process.exit(1);
}
const meta = getArticleBySlug(slug);
if (!meta) {
  console.error(`No article found for slug "${slug}" in content/articles.meta.ts`);
  process.exit(1);
}

const W = 1200;
const H = 627;
const logoPath = path.join(PUBLIC_DIR, "inbharat-logo-1024.png");

/** Greedy word-wrap to <= maxChars chars/line; collapses whitespace. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Background — same branded gradient + glow + bottom accent bar as og-image.
const bgSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d1117"/>
        <stop offset="50%" stop-color="#11161f"/>
        <stop offset="100%" stop-color="#1a0d05"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.32" r="0.62">
        <stop offset="0%" stop-color="#f59f4f" stop-opacity="0.18"/>
        <stop offset="60%" stop-color="#f59f4f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#f59f4f"/>
  </svg>
`);

// Title wrap — scale font down for long titles so they never overflow.
const maxChars = meta.title.length > 60 ? 32 : 30;
const titleLines = wrap(meta.title, maxChars);
const fontSize = titleLines.length >= 4 ? 40 : titleLines.length === 3 ? 48 : 54;
const lineHeight = Math.round(fontSize * 1.22);
const titleBlockH = titleLines.length * lineHeight;
const titleTopY = Math.round((H - titleBlockH) / 2) + fontSize; // first baseline

const titleTspans = titleLines
  .map((ln, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(ln)}</tspan>`)
  .join("");

// Subtle "agent -> evidence -> gate" pipeline motif (harness-engineering vibe,
// tasteful for any engineering/agent topic). Three nodes + connectors + a gate.
const motifCy = H - 96;
const motifNodes = [W / 2 - 150, W / 2, W / 2 + 150];
const motifSvg = `
  <line x1="${motifNodes[0]}" y1="${motifCy}" x2="${motifNodes[1]}" y2="${motifCy}" stroke="#f59f4f" stroke-opacity="0.45" stroke-width="2"/>
  <line x1="${motifNodes[1]}" y1="${motifCy}" x2="${motifNodes[2]}" y2="${motifCy}" stroke="#f59f4f" stroke-opacity="0.45" stroke-width="2"/>
  <circle cx="${motifNodes[0]}" cy="${motifCy}" r="9" fill="#0d1117" stroke="#f59f4f" stroke-width="2.5"/>
  <circle cx="${motifNodes[1]}" cy="${motifCy}" r="9" fill="#0d1117" stroke="#f59f4f" stroke-width="2.5"/>
  <rect x="${motifNodes[2] - 14}" y="${motifCy - 13}" width="28" height="26" rx="5" fill="#f59f4f" fill-opacity="0.18" stroke="#f59f4f" stroke-width="2.5"/>
  <path d="M${motifNodes[2] - 1} ${motifCy - 6} l4 5 l7 -9" stroke="#f59f4f" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${motifNodes[0]}" y="${motifCy + 30}" text-anchor="middle" class="tag" font-size="15" opacity="0.8">Agent</text>
  <text x="${motifNodes[1]}" y="${motifCy + 30}" text-anchor="middle" class="tag" font-size="15" opacity="0.8">Evidence</text>
  <text x="${motifNodes[2]}" y="${motifCy + 30}" text-anchor="middle" class="tag" font-size="15" opacity="0.8">Gate</text>
`;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const textSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <style>
      .brand { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; fill: #ffffff; letter-spacing: -0.5px; }
      .tag   { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 500; fill: #a8bfd4; }
      .cat   { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; fill: #f6bf84; letter-spacing: 3px; }
    </style>
    <text x="${W / 2}" y="${titleTopY - 18 - fontSize}" text-anchor="middle" class="cat" font-size="22">${escapeXml(meta.category.toUpperCase())}</text>
    <text x="${W / 2}" y="${titleTopY}" text-anchor="middle" class="brand" font-size="${fontSize}">${titleTspans}</text>
    ${motifSvg}
    <text x="${W / 2}" y="${H - 34}" text-anchor="middle" class="tag" font-size="18" opacity="0.8">inbharat.ai/learn-ai-with-reeturaj</text>
  </svg>
`);

type Layer = { input: Buffer; top: number; left: number };
const composite: Layer[] = [{ input: textSvg, top: 0, left: 0 }];

try {
  const logoBuf = await sharp(logoPath)
    .resize(110, 110, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  // Logo sits top-center, above the category eyebrow.
  composite.unshift({ input: logoBuf, top: 46, left: Math.round(W / 2) - 55 });
} catch {
  /* logo missing — text-only fallback */
}

const outPath = path.join(SCENE_DIR, `${slug}.png`);
await sharp(bgSvg)
  .composite(composite)
  .png({ quality: 90, compressionLevel: 9 })
  .toFile(outPath);

const meta2 = await sharp(outPath).metadata();
console.log(`[visual] wrote ${path.relative(ROOT, outPath)} (${meta2.width}x${meta2.height}, ${meta2.format})`);
console.log(`[visual] set "visual: '${slug}.png'" on the ${slug} article meta entry, then rebuild.`);