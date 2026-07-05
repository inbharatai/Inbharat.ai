/**
 * InBharat Growth Agent — Shared web search via Gemini google_search grounding.
 *
 * Replaces Serper for the Growth Agent's three search sites: the web_search
 * tool (agentTools.ts), draft-time grounding retrieval (retrieval.ts), and the
 * weekly topic discovery (topicDiscovery.ts). Uses the SAME GEMINI_API_KEY the
 * agent already has — no separate Serper key, no third party. Gemini's
 * first-party google_search tool grounds the answer in live Google results and
 * returns groundingChunks (web.uri + web.title) we expose as result rows.
 * Returns { answer, results } or null on no-key / no-results / any failure.
 *
 * HONESTY:
 *   - This is a Gemini model call (token-billed) AND google_search grounding is
 *     billed per query (separate from tokens). Costs are tiny (flash, short
 *     answers) but real — logUsage records the token portion so the monthly cap
 *     sees it. The per-query grounding fee is not captured in logUsage (it is
 *     billed outside the token meter) — flagged here so it isn't mistaken for
 *     "free". Both are far cheaper than a runaway draft, and the monthly budget
 *     cap still bounds total Growth spend.
 *   - Gemini returns a grounded ANSWER + citation chunks, not a raw organic
 *     result list with per-result dates/snippets. We synthesize result rows
 *     from groundingChunks (title, uri) and derive a snippet per chunk from
 *     groundingSupports (the answer-text segment that cites that chunk) when
 *     available; otherwise snippet is "". scoreTopic/consumers that used to
 *     read Serper's snippet/date now read title + (when present) the support
 *     segment — no fabricated dates or snippets.
 *
 * NOT used by the chat backend's /api/search, /api/news, or research mode —
 * those keep Serper (separate feature, separate consumers, separate UI). This
 * module is Growth-Agent-only and never touches the chat path.
 *
 * Server-only. Never throws.
 */
import { logUsage, estimateCost, type ModelChoice } from "./model-router.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface GroundedSearchResult {
  /** The grounded answer text Gemini produced (cited by the result rows). */
  answer: string;
  /** Citation rows derived from groundingChunks (+ groundingSupports snippets). */
  results: SearchResult[];
}

/** gemini-2.5-flash supports the google_search tool (flash-lite does not). Pinned
 *  to a stable ID, never the -latest alias (see model-router.ts for the why). */
const SEARCH_MODEL = "gemini-2.5-flash";
const SEARCH_TIMEOUT_MS = 20000;
const SEARCH_CHOICE: ModelChoice = { provider: "gemini", model: SEARCH_MODEL, usdPer1k: 0.00015 };

/** Rough Gemini REST response shape — only the fields we read. */
interface GroundingResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      groundingSupports?: Array<{
        segment?: { text?: string };
        groundingChunkIndices?: number[];
      }>;
    };
  }>;
}

/**
 * Run one focused query through Gemini google_search grounding. Returns null
 * when GEMINI_API_KEY is unset, the call fails / times out / is blocked, or
 * there are no grounding chunks AND no answer text. Never throws. Best-effort
 * logs token usage so the monthly cap sees it.
 *
 * Note: google_search is incompatible with responseMimeType:application/json
 * and with thinkingConfig, so we send a plain text generation with the tool
 * enabled and let Gemini ground + answer in prose.
 */
export async function groundedSearch(query: string): Promise<GroundedSearchResult | null> {
  const q = (query ?? "").trim().slice(0, 500);
  if (!q) return null;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${SEARCH_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: q }] }],
          tools: [{ google_search: {} }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GroundingResponse;
    const answer = extractAnswer(data);
    const results = extractResults(data);
    if (results.length === 0 && !answer) return null;

    // Best-effort usage log (token counts approximated from char length — the
    // exact metering comes back in usageMetadata which we don't strictly need;
    // the monthly cap is a soft guard, not a bill). Never blocks the result.
    const approxTokens = Math.ceil((q.length + answer.length) / 4);
    void logUsage({
      task: "search",
      model: SEARCH_MODEL,
      provider: "gemini",
      promptTokens: Math.ceil(q.length / 4),
      completionTokens: Math.ceil(answer.length / 4),
      totalTokens: approxTokens,
      costUsd: estimateCost(SEARCH_CHOICE, approxTokens),
      status: "ok",
    }).catch(() => undefined);

    return { answer, results };
  } catch {
    // AbortController timeout, network error, or bad JSON — search is best-effort.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Scan all parts for the first .text part (image/grounding responses can put
 *  content in later parts). Pure + hermetic. */
function extractAnswer(data: GroundingResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  for (const p of parts) {
    if (typeof p?.text === "string" && p.text) return p.text.slice(0, 2000);
  }
  return "";
}

/** Derive result rows from groundingChunks. When groundingSupports maps an
 *  answer-text segment to a chunk, use that segment as the snippet (it's the
 *  sentence Gemini cited that source for). No fabricated dates/snippets. */
export function extractResults(data: GroundingResponse): SearchResult[] {
  const gm = data?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(gm?.groundingChunks) ? (gm!.groundingChunks!) : [];
  if (chunks.length === 0) return [];
  // Build chunkIndex → first supporting segment text (the cited sentence).
  const supports = Array.isArray(gm?.groundingSupports) ? (gm!.groundingSupports!) : [];
  const snippetByIndex = new Map<number, string>();
  for (const s of supports) {
    const seg = typeof s?.segment?.text === "string" ? s.segment.text : "";
    const idxs = Array.isArray(s?.groundingChunkIndices) ? s.groundingChunkIndices : [];
    for (const i of idxs) {
      if (!snippetByIndex.has(i) && seg) snippetByIndex.set(i, seg);
    }
  }
  const out: SearchResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const web = chunks[i]?.web;
    const uri = typeof web?.uri === "string" ? web.uri : "";
    const title = (typeof web?.title === "string" ? web.title : "").slice(0, 200);
    const snippet = (snippetByIndex.get(i) ?? "").slice(0, 300);
    if (!uri && !title) continue;
    out.push({ title, url: uri, snippet });
  }
  return out.slice(0, 8);
}