/**
 * Pure chip-derivation for Published Memory rows — formats the enrichment signals
 * (cluster/category, keyword preview, content-hash tail, measured-outcome label)
 * that the PublishedMemoryTable renders under each article title. React-free so
 * scripts/test-growth.ts can drive it with fixtures.
 *
 * HONESTY CONTRACT: every field is derived from data already on the
 * PublishedMemoryItem — no fabrication. Empty/null inputs → null chips (the row
 * just omits them), never placeholder noise.
 */

export interface MemoryChips {
  cluster: string | null;
  keywords: string[];
  hashTail: string | null;
  measured: string | null;
}

/** Short tail of the source content hash (for "is this stale?" glance). */
export function hashTail(sha: string | null | undefined, len = 8): string | null {
  if (!sha) return null;
  const clean = sha.replace(/^sha-?/i, "").trim();
  if (!clean) return null;
  return clean.slice(0, Math.max(4, Math.min(len, 16)));
}

/** Up to `n` keywords, trimmed, deduped case-insensitively, preserving order. */
export function keywordPreview(keywords: string[] | null | undefined, n = 3): string[] {
  if (!Array.isArray(keywords)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const t = (k ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** Measured-outcome label — honest that measured_at is LinkedIn outcomes only. */
export function measuredLabel(measuredAt: string | null | undefined): string | null {
  if (!measuredAt) return null;
  return "measured (LinkedIn)";
}

/** Derive the full chip set for a row. Pure + testable. */
export function memoryChips(input: {
  category?: string | null;
  keywords?: string[] | null;
  sourceMetaSha?: string | null;
  measuredAt?: string | null;
}): MemoryChips {
  return {
    cluster: input.category ? input.category.trim() || null : null,
    keywords: keywordPreview(input.keywords),
    hashTail: hashTail(input.sourceMetaSha),
    measured: measuredLabel(input.measuredAt),
  };
}