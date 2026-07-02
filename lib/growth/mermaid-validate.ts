/**
 * InBharat Growth Agent — Module: Mermaid fence dry-run validator.
 *
 * Stage 2 "trustworthy" guard. Articles may embed ```mermaid diagrams; a syntax
 * error renders as an ugly "Syntax error in text" box on inbharat.ai instead of the
 * diagram. The publish path runs this validator BEFORE committing the markdown to
 * GitHub: every ```mermaid fence is parsed with the real `mermaid.parse` (the same
 * parser the browser uses to render), and if any fence fails to parse, the publish
 * is refused (409) with the offending fence + the parser's message, so the founder
 * fixes the diagram before it ships — instead of finding a broken diagram live.
 *
 * mermaid is an ESM-only package and this project is `"type": "module"`, so the
 * dynamic `await import("mermaid")` resolves cleanly in both the tsx test runner and
 * Vercel's Node runtime. mermaid.parse works headless (verified: it parses + throws
 * on bad syntax without a DOM). The import is lazy so non-article publish paths
 * (LinkedIn / video-script / cover) and articles with NO mermaid fences never load
 * it. If the import ever fails in a runtime we don't anticipate, we degrade
 * gracefully (skip the dry-run + log) rather than block a publish because our
 * validator couldn't load — same graceful-degrade convention as critiqueAndRevise.
 *
 * Pure fence extraction is hermetically testable; the parse call is exercised
 * against good + bad fence fixtures in test-growth.ts.
 *
 * Server-only. Never touches the chat backend.
 */

export interface MermaidFenceError {
  /** 1-based index of the fence within the article (first mermaid fence = 1). */
  fenceIndex: number;
  /** The parser's error message (truncated for a sane HTTP response body). */
  message: string;
  /** The first line of the offending fence, for quick locating in the draft. */
  source: string;
}

export interface MermaidValidation {
  ok: boolean;
  errors: MermaidFenceError[];
  /** How many ```mermaid fences were found (0 → validation is a no-op). */
  fenceCount: number;
  /** True when the validator couldn't load mermaid in the runtime (degrade
   *  gracefully + log; the publish proceeds). Never set on a real parse success. */
  skipped?: boolean;
  skipReason?: string;
}

const MAX_ERR_MSG = 240;
const MAX_ERR_SOURCE = 120;

/** Extract the inner source of every well-formed ```mermaid fence in the markdown.
 *  Pure + hermetic. Returns fences in document order. An UNCLOSED mermaid fence (no
 *  following ```) is not extracted here — detectUnclosedFences reports it. */
export function extractMermaidFences(markdown: string): string[] {
  const re = /```mermaid[ \t]*\r?\n([\s\S]*?)```/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Count of ```mermaid fence OPENERS in the markdown (closed or not). Pure. */
function countMermaidOpeners(markdown: string): number {
  const re = /```mermaid\b/g;
  let n = 0;
  while (re.exec(markdown) !== null) n++;
  return n;
}

/** Detect ```mermaid fences that were never closed (opener with no matching ```).
 *  Pure + hermetic. Returns the 1-based indices of the unclosed openers. */
export function detectUnclosedFences(markdown: string): number[] {
  const openers = countMermaidOpeners(markdown);
  const closed = extractMermaidFences(markdown).length;
  if (openers <= closed) return [];
  // The unclosed ones are the last (openers - closed) openers by document order.
  const openerRe = /```mermaid\b/g;
  const indices: number[] = [];
  let idx = 0;
  while (openerRe.exec(markdown) !== null) {
    idx++;
    if (idx > closed) indices.push(idx);
  }
  return indices;
}

/**
 * Validate every ```mermaid fence in the markdown by parsing it with mermaid.parse.
 * Returns { ok: true, errors: [], fenceCount } when every fence parses (or there are
 * no fences). Returns { ok: false, errors, fenceCount } when one or more fences fail
 * to parse or are unclosed — the publish path refuses on ok:false. Returns
 * { ok: true, skipped: true, ... } only if mermaid couldn't be loaded in the runtime.
 */
export async function validateMermaidFences(markdown: string): Promise<MermaidValidation> {
  const fences = extractMermaidFences(markdown);
  const unclosed = detectUnclosedFences(markdown);
  // Treat unclosed fences as errors with a clear message (no parse needed).
  const unclosedErrors: MermaidFenceError[] = unclosed.map((i) => ({
    fenceIndex: i,
    message: "mermaid fence is never closed (missing closing ```).",
    source: "(unclosed)",
  }));

  if (fences.length === 0 && unclosed.length === 0) {
    return { ok: true, errors: [], fenceCount: 0 };
  }

  let mermaid: typeof import("mermaid")["default"] | null = null;
  try {
    const mod = await import("mermaid");
    mermaid = (mod as { default?: typeof import("mermaid")["default"] }).default ?? (mod as unknown as typeof import("mermaid")["default"]);
  } catch (e) {
    // Graceful degrade: never block a publish because our validator couldn't load.
    // This branch is not expected to fire (mermaid loads in node + Vercel) but is
    // here so a runtime quirk can't break the publish flow.
    return {
      ok: true,
      errors: [],
      fenceCount: fences.length,
      skipped: true,
      skipReason: `mermaid import failed: ${(e as Error).message.slice(0, MAX_ERR_MSG)}`,
    };
  }

  const errors: MermaidFenceError[] = [...unclosedErrors];
  for (let i = 0; i < fences.length; i++) {
    const src = fences[i];
    try {
      // mermaid.parse resolves true on valid syntax; throws on a parse error.
      await mermaid.parse(src);
    } catch (e) {
      errors.push({
        fenceIndex: i + 1,
        message: (e as Error).message.slice(0, MAX_ERR_MSG),
        source: src.split(/\r?\n/)[0]?.slice(0, MAX_ERR_SOURCE) ?? "",
      });
    }
  }

  return { ok: errors.length === 0, errors, fenceCount: fences.length };
}