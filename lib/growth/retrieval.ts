/**
 * InBharat Growth Agent — Module: Grounding retrieval (web_search before drafting).
 *
 * Stage 2 "trustworthy" guard. The article drafter used to invent dates, numbers,
 * API names, and version strings because it had no source of truth in context.
 * This module runs ONE focused Serper (Google) web_search for the topic before
 * the draft model call, and the snippets are injected into the article prompt as
 * a GROUNDING block the model must cite instead of inventing. The critique pass
 * gets the same block so it can flag any numeric/date/version claim not present in
 * the grounding (see critique.ts Stage 2 fact-check branch).
 *
 * Not a model call — no budget / no logUsage. Serper results re-enter model context
 * via the prompt, where the existing redact() on the combined prompt catches
 * anything sensitive (same boundary as the web_search tool). Graceful: when
 * SERPER_API_KEY is unset, the request fails, or Serper returns nothing, we
 * return [] and the drafter proceeds UNGROUNDED (the prior behavior) — grounding is
 * an accuracy upgrade, never a hard gate that blocks drafting.
 *
 * Server-only. Never touches the chat backend.
 */

export interface GroundingSnippet {
  title: string;
  url: string;
  snippet: string;
}

/** How many Serper results to keep + inject. Snippets are capped (see mapResult),
 *  so 4 keeps the prompt overhead small while giving the model real sources to cite. */
const MAX_SNIPPETS = 4;
/** One focused query, truncated so a runaway topic can't blow up the request body. */
const MAX_QUERY = 200;
/** Hard timeout so a hung Serper call can never stall the draft pipeline. */
const SEARCH_TIMEOUT_MS = 12000;

/**
 * Run one focused web_search for the topic and return up to MAX_SNIPPETS results.
 * Returns [] (not a throw) when: SERPER_API_KEY unset, the request fails/times out,
 * Serper returns non-OK, or there are no organic results — so the caller always gets
 * an array and can proceed ungrounded. Pure-ish (one network call); hermetically
 * testable via mapResults + formatGroundingBlock (the network call itself is not
 * asserted, only its pure transforms).
 */
export async function gatherGrounding(topic: string): Promise<GroundingSnippet[]> {
  const query = (topic ?? "").trim().slice(0, MAX_QUERY);
  if (!query) return [];
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 6 }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    return mapResults(data);
  } catch {
    // AbortController timeout, network error, or bad JSON — grounding is best-effort.
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Map + truncate Serper's organic results into GroundingSnippets. Pure + hermetic. */
export function mapResults(data: { organic?: Array<{ title?: string; link?: string; snippet?: string }> }): GroundingSnippet[] {
  const organic = Array.isArray(data?.organic) ? data.organic : [];
  return organic
    .map((o) => ({
      title: (o?.title ?? "").slice(0, 200),
      url: typeof o?.link === "string" ? o.link : "",
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