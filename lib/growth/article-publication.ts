/** Data-only manifest editing. Never eval/import source fetched from GitHub. */
import { validArticleDate } from '../../content/article-lifecycle.js';

export type ArticleInput = {
  slug: string; title: string; description: string; category: string;
  readMinutes: number; abstract: string; faq: { q: string; a: string }[]; hashtags: string[];
  datePublished?: string;
};
type Data = string | number | boolean | null | Data[] | { [key: string]: Data };
type RecordData = { [key: string]: Data };

/** Small strict literal parser: strings, finite numbers, arrays and objects only.
 * Comments and trailing commas are accepted; calls, spreads and expressions fail closed. */
class LiteralReader {
  constructor(readonly source: string, public pos = 0) {}
  space() {
    for (;;) {
      const m = /^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/.exec(this.source.slice(this.pos));
      if (!m) return;
      this.pos += m[0].length;
    }
  }
  take(char: string) { this.space(); if (this.source[this.pos] !== char) throw new Error(`Expected ${char} in article manifest`); this.pos++; }
  string(): string {
    const quote = this.source[this.pos++]; let out = '';
    while (this.pos < this.source.length) {
      const c = this.source[this.pos++];
      if (c === quote) return out;
      if (c === '\n' || c === '\r') throw new Error('Unescaped newline in manifest string');
      if (c !== '\\') { out += c; continue; }
      const e = this.source[this.pos++];
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', "'": "'", '"': '"', '\\': '\\', '/': '/' };
      if (e in simple) out += simple[e];
      else if (e === 'u' || e === 'x') {
        const len = e === 'u' ? 4 : 2; const hex = this.source.slice(this.pos, this.pos + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new Error('Invalid string escape');
        out += String.fromCharCode(parseInt(hex, 16)); this.pos += len;
      } else throw new Error('Unsupported string escape');
    }
    throw new Error('Unterminated manifest string');
  }
  value(): Data {
    this.space(); const c = this.source[this.pos];
    if (c === "'" || c === '"') return this.string();
    if (c === '[') {
      this.pos++; const values: Data[] = [];
      for (;;) {
        this.space(); if (this.source[this.pos] === ']') { this.pos++; return values; }
        values.push(this.value()); this.space();
        if (this.source[this.pos] !== ']') this.take(',');
      }
    }
    if (c === '{') {
      this.pos++; const obj: RecordData = Object.create(null);
      for (;;) {
        this.space(); if (this.source[this.pos] === '}') { this.pos++; return obj; }
        const key = /^[A-Za-z_$][\w$]*/.exec(this.source.slice(this.pos));
        const name = key ? (this.pos += key[0].length, key[0]) : this.string();
        if (name === '__proto__') throw new Error('Unsupported prototype property');
        if (Object.hasOwn(obj, name)) throw new Error('Duplicate manifest property');
        this.take(':'); obj[name] = this.value(); this.space();
        if (this.source[this.pos] !== '}') this.take(',');
      }
    }
    const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\b/.exec(this.source.slice(this.pos));
    if (!literal) throw new Error('Manifest contains unsupported non-literal data');
    this.pos += literal[0].length; return JSON.parse(literal[0]) as Data;
  }
}

export function manifestRecords(source: string): { records: { start: number; end: number; data: RecordData }[]; close: number } {
  const start = /export\s+const\s+ARTICLES\s*:\s*ArticleMeta\[\]\s*=\s*\[/.exec(source);
  if (!start) throw new Error('Cannot locate ARTICLES literal');
  const r = new LiteralReader(source, start.index + start[0].length);
  const records: { start: number; end: number; data: RecordData }[] = [];
  const seen = new Set<string>();
  for (;;) {
    r.space(); if (source[r.pos] === ']') return { records, close: r.pos };
    const begin = r.pos; const data = r.value(); const end = r.pos;
    if (!data || Array.isArray(data) || typeof data !== 'object' || typeof data.slug !== 'string') throw new Error('Invalid article record');
    if (seen.has(data.slug)) throw new Error('Duplicate article slug');
    seen.add(data.slug); records.push({ start: begin, end, data }); r.space();
    if (source[r.pos] !== ']') r.take(',');
  }
}

export function quoteTs(value: string): string {
  return "'" + JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'").replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + "'";
}
function serialize(value: Data, indent = 4): string {
  if (typeof value === 'string') return quoteTs(value);
  if (Array.isArray(value)) return '[' + value.map(v => serialize(v, indent)).join(', ') + ']';
  if (value && typeof value === 'object') return '{ ' + Object.entries(value).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : quoteTs(k)}: ${serialize(v, indent)}`).join(', ') + ' }';
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite article number');
  return JSON.stringify(value);
}
export function formatArticleEntry(meta: ArticleInput | RecordData): string {
  return '  {\n' + Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) => `    ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : quoteTs(k)}: ${serialize(v as Data)},`).join('\n') + '\n  },';
}

/** Retains unknown fields and dates verbatim. New records deliberately lack datePublished:
 * a repository commit cannot establish the first successful live publication. */
export function planArticlePublication(source: string, input: ArticleInput, previousBody: string | null, body: string, now: string): { source: string; changed: boolean } {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error('Invalid article slug');
  if (!Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now || !validArticleDate(now.slice(0, 10))) throw new Error('Invalid repository snapshot time');
  const parsed = manifestRecords(source);
  const entry = parsed.records.find(e => e.data.slug === input.slug);
  const fields = ['slug', 'title', 'description', 'category', 'readMinutes', 'abstract', 'faq', 'hashtags'] as const;
  const edited = Object.fromEntries(fields.map(k => [k, input[k]])) as RecordData;
  const same = entry && fields.every(k => JSON.stringify(entry.data[k] ?? (k === 'hashtags' ? [] : undefined)) === JSON.stringify(edited[k]));
  if (same && previousBody === body) return { source, changed: false };
  const next: RecordData = { ...(entry?.data ?? {}), ...edited };
  if (!entry) next.repositoryRecordedAt = now;
  else {
    const latest = [entry.data.datePublished, entry.data.dateModified].filter((d): d is string => validArticleDate(d)).sort().at(-1);
    if (latest && latest > now.slice(0, 10)) throw new Error('Article has future lifecycle dates; review before editing');
    next.dateModified = now.slice(0, 10);
  }
  const text = formatArticleEntry(next);
  const updated = entry
    ? source.slice(0, entry.start) + text.trimStart().slice(0, -1) + source.slice(entry.end)
    : source.slice(0, parsed.close) + text + '\n' + source.slice(parsed.close);
  // Re-parse the actual emitted source, not just the data used to build it.
  manifestRecords(updated);
  return { source: updated, changed: true };
}

/** Cover wiring uses the same literal parser: slug/visual text inside a title
 * or FAQ cannot masquerade as a property or another entry. */
export function insertArticleVisual(source: string, slug: string, filename: string): string | null {
  const entry = manifestRecords(source).records.find(e => e.data.slug === slug);
  if (!entry || Object.hasOwn(entry.data, 'visual') || !Object.hasOwn(entry.data, 'readMinutes')) return null;
  const next: RecordData = Object.create(null);
  for (const [key, value] of Object.entries(entry.data)) {
    next[key] = value;
    if (key === 'readMinutes') next.visual = filename;
  }
  const text = formatArticleEntry(next).trimStart().slice(0, -1);
  const updated = source.slice(0, entry.start) + text + source.slice(entry.end);
  manifestRecords(updated);
  return updated;
}

export function hasArticleMeta(source: string, slug: string): boolean {
  try { return manifestRecords(source).records.some(entry => entry.data.slug === slug); }
  catch { return false; }
}
