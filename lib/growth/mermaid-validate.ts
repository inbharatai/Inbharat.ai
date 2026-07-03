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

export interface MermaidSanitizeResult {
  /** The markdown with unparseable mermaid fences removed. Valid fences + all
   *  non-fence text are kept byte-for-byte. Identical to the input when nothing
   *  was stripped (or when the validator degraded gracefully). */
  cleaned: string;
  /** Each fence that was stripped (closed-broken + unclosed). Empty when the input
   *  was already clean. Forwarded to the publish response + log so the founder knows
   *  a diagram was dropped (and can re-draft it if they want the visual). */
  stripped: MermaidFenceError[];
  /** Total ```mermaid fences found (closed; same field as MermaidValidation). */
  fenceCount: number;
  /** True only if mermaid couldn't be loaded in the runtime — returns the markdown
   *  unchanged (graceful degrade; the publish proceeds). Never set on a real run. */
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Strip every ```mermaid fence that fails to parse (and any unclosed opener) from the
 * markdown, leaving valid fences + all prose untouched. This is the publish-path
 * alternative to refusing the publish (409) when the model emits a broken diagram:
 * the article's prose is still valuable, so we ship it minus the broken diagram and
 * tell the founder what was stripped — instead of blocking the whole publish on one
 * bad fence. Also used at draft time so a draft that lands in Issues is already clean.
 *
 * Pure-ish: one lazy `import("mermaid")` (shared with validateMermaidFences). The fence
 * excision itself is pure + hermetic. Never throws — on any error it returns the input
 * unchanged (the publish path is the final gate, and a sanitizer failure must never
 * block a publish). Server-only.
 */
export async function sanitizeMermaidFences(markdown: string): Promise<MermaidSanitizeResult> {
  const validation = await validateMermaidFences(markdown);
  if (validation.skipped) {
    return { cleaned: markdown, stripped: [], fenceCount: validation.fenceCount, skipped: true, skipReason: validation.skipReason };
  }
  if (validation.ok || validation.errors.length === 0) {
    return { cleaned: markdown, stripped: [], fenceCount: validation.fenceCount };
  }
  // Partition the errors: closed-but-broken fences have fenceIndex within the closed
  // fence count; unclosed openers have fenceIndex > fenceCount (set by validateMermaidFences).
  const badClosed = new Set<number>();
  let unclosedCount = 0;
  for (const e of validation.errors) {
    if (e.fenceIndex > validation.fenceCount) unclosedCount++;
    else badClosed.add(e.fenceIndex);
  }
  let cleaned = markdown;
  if (badClosed.size > 0) cleaned = stripClosedFencesByIndex(cleaned, badClosed);
  if (unclosedCount > 0) cleaned = stripUnclosedFences(cleaned);
  return { cleaned, stripped: validation.errors, fenceCount: validation.fenceCount };
}

/** Remove the 1-based-indexed closed ```mermaid fences from the markdown, keeping
 *  every other fence + all surrounding text. Pure + hermetic. */
function stripClosedFencesByIndex(markdown: string, badIndices: Set<number>): string {
  const re = /```mermaid[ \t]*\r?\n[\s\S]*?```/g;
  let out = "";
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    idx++;
    out += markdown.slice(last, m.index);
    last = m.index + m[0].length;
    if (!badIndices.has(idx)) out += m[0]; // keep the good fence
    // else: drop the broken fence (stripped)
  }
  out += markdown.slice(last);
  return out;
}

/** Remove any ```mermaid opener that has no closing ```: strip from the opener to the
 *  next ```mermaid opener (closed or unclosed) or end of string. An unclosed opener
 *  swallows everything after it in a real renderer, so stripping to the next opener
 *  (preserving a following valid fence) is the conservative call. Pure + hermetic. */
function stripUnclosedFences(markdown: string): string {
  const closedRe = /```mermaid[ \t]*\r?\n[\s\S]*?```/g;
  const closedStarts = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = closedRe.exec(markdown)) !== null) closedStarts.add(m.index);
  const openerRe = /```mermaid\b/g;
  const openers: number[] = [];
  while ((m = openerRe.exec(markdown)) !== null) openers.push(m.index);
  const unclosed = openers.filter((p) => !closedStarts.has(p));
  if (unclosed.length === 0) return markdown;
  let out = "";
  let last = 0;
  for (let i = 0; i < unclosed.length; i++) {
    const start = unclosed[i];
    const nextOpener = openers.find((p) => p > start);
    const end = nextOpener ?? markdown.length;
    out += markdown.slice(last, start);
    last = end;
  }
  out += markdown.slice(last);
  return out;
}