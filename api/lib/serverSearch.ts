/**
 * Server-side Serper search — used by /api/orchestrate and agents.
 * Identical logic to /api/search but callable as a function (no req/res).
 */

const SERPER_URL = "https://google.serper.dev/search";
const TIMEOUT_MS = 5000;
const RETRIES = 1;

export interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

export interface ServerSearchOutput {
  results: SearchResult[];
  sources: Array<{ title: string; uri: string }>;
}

export async function serverSearch(query: string): Promise<ServerSearchOutput> {
  const key = process.env.SERPER_API_KEY;
  if (!key || !query.trim()) return { results: [], sources: [] };

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(SERPER_URL, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query.trim(), num: 8 }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = (await res.json()) as { organic?: SearchResult[] };
      const results = (data.organic ?? []).slice(0, 8).map(r => ({
        title: r.title ?? "Source",
        link: r.link ?? "",
        snippet: r.snippet,
      }));
      const sources = results.map(r => ({ title: r.title, uri: r.link }));
      return { results, sources };
    } catch {
      // retry
    }
  }
  return { results: [], sources: [] };
}
