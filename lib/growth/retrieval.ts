/**
 * InBharat Growth Agent — Module: Grounding retrieval (web_search before drafting).
 *
 * Stage 2 "trustworthy" guard. The article drafter used to invent dates, numbers,
 * API names, and version strings because it had no source of truth in context.
 * This module runs ONE focused web_search for the topic before the draft model
 * call, and the snippets are injected into the article prompt as a GROUNDING
 * block the model must cite instead of inventing. The critique pass gets the
 * same block so it can flag any numeric/date/version claim not present in the
 * grounding (see critique.ts Stage 2 fact-check branch).
 *
 * Search is powered by Gemini's google_search grounding (lib/growth/search.ts),
 * which reuses the agent's own GEMINI_API_KEY — no separate Serper key. It IS a
 * model call (token-billed + per-query grounding fee, logged in search.ts), but
 * grounding stays a best-effort accuracy upgrade, never a hard gate: when
 * GEMINI_API_KEY is unset, the call fails/times out, or Gemini returns no
 * grounding chunks, we return [] and the drafter proceeds UNGROUNDED (the prior
 * behavior). Results re-enter model context via the prompt, where the existing
 * redact() on the combined prompt catches anything sensitive.
 *
 * Server-only. Never touches the chat backend.
 */

import { groundedSearch } from "./search.js";

export interface GroundingSnippet {
  title: string;
  url: string;
  snippet: string;
}

/** How many results to keep + inject. Snippets are capped (see mapResults), so 4
 *  keeps the prompt overhead small while giving the model real sources to cite. */
const MAX_SNIPPETS = 4;
/** One focused query, truncated so a runaway topic can't blow up the request body. */
const MAX_QUERY = 200;

/**
 * Run one focused web_search for the topic and return up to MAX_SNIPPETS results.
 * Returns [] (not a throw) when: GEMINI_API_KEY unset, the request fails/times
 * out, Gemini returns no grounding chunks, or there are no results — so the
 * caller always gets an array and can proceed ungrounded. Pure-ish (one network
 * call); hermetically testable via mapResults + formatGroundingBlock (the
 * network call itself is not asserted, only its pure transforms).
 */
export async function gatherGrounding(topic: string): Promise<GroundingSnippet[]> {
  const query = (topic ?? "").trim().slice(0, MAX_QUERY);
  if (!query) return [];
  const res = await groundedSearch(query);
  if (!res) return [];
  return mapResults(res.results);
}

/** Map + truncate search results into GroundingSnippets. Pure + hermetic. Accepts
 *  the SearchResult shape from lib/growth/search.ts (title/url/snippet). */
export function mapResults(results: Array<{ title?: string; url?: string; snippet?: string }>): GroundingSnippet[] {
  const rows = Array.isArray(results) ? results : [];
  return rows
    .map((o) => ({
      title: (o?.title ?? "").slice(0, 200),
      url: typeof o?.url === "string" ? o.url : "",
      snippet: (o?.snippet ?? "").slice(0, 300),
    }))
    .filter((o) => o.title || o.snippet)
    .slice(0, MAX_SNIPPETS);
}

/**
 * Format the grounding block for injection into the article + critique prompts.
 * Returns "" when there are no snippets (so the caller can `block ? ... : ""` skip
 * the injection with no empty header noise). Pure + hermetic.
 */
export function formatGroundingBlock(snippets: GroundingSnippet[]): string {
  if (!snippets.length) return "";
  const lines = snippets.map((s, i) => {
    const head = s.title ? `[${i + 1}] ${s.title}` : `[${i + 1}]`;
    const tail = s.snippet ? ` — ${s.snippet}` : "";
    return `${head}${tail}${s.url ? ` (${s.url})` : ""}`;
  });
  return [
    "GROUNDING — these are real web_search results for the topic. Cite them where relevant; do NOT invent numbers, dates, API names, or version strings that aren't here or aren't common knowledge. If a fact you need isn't in the grounding, either omit it or hedge it honestly.",
    ...lines,
  ].join("\n");
}