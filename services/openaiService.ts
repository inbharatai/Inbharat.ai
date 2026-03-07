import { AgentMode, Source, NewsArticle, WidgetData } from "../types";
import { supabase } from "../lib/supabaseClient";

/** Sanitized error codes never expose raw upstream messages. */
export type OpenAISanitizedCode =
  | "RATE_LIMIT"
  | "UPSTREAM_OVERLOADED"
  | "SERVER_ERROR"
  | "AUTH_ERROR"
  | "UNAUTHORIZED"
  | "CONFIG_ERROR";

export class OpenAISanitizedError extends Error {
  readonly code: OpenAISanitizedCode;
  readonly retryAfterSeconds?: number;

  constructor(code: OpenAISanitizedCode, retryAfterSeconds?: number) {
    super(code);
    this.name = "OpenAISanitizedError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const RETRY_AFTER_CAP_SEC = 10;

type ChatApiOk = { ok: true; text: string; model?: string; requestId?: string };
type ChatApiErr =
  | { ok: false; code: "RATE_LIMIT"; retryAfter: number }
  | { ok: false; code: "UPSTREAM_OVERLOADED"; retryAfterSeconds: number }
  | { ok: false; code: "SERVER_ERROR" }
  | { ok: false; code: "UNAUTHORIZED" };

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal
): Promise<{ status: number; json: T }> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

function toSanitizedFromApi(status: number, payload: unknown): OpenAISanitizedError {
  const p = payload as Partial<ChatApiErr> & { retryAfter?: number; retryAfterSeconds?: number };
  if (status === 429 && p.code === "RATE_LIMIT") return new OpenAISanitizedError("RATE_LIMIT", p.retryAfter ?? RETRY_AFTER_CAP_SEC);
  if (status === 503 && p.code === "UPSTREAM_OVERLOADED") return new OpenAISanitizedError("UPSTREAM_OVERLOADED", p.retryAfterSeconds ?? RETRY_AFTER_CAP_SEC);
  if (status === 401 && p.code === "UNAUTHORIZED") return new OpenAISanitizedError("UNAUTHORIZED");
  if (status === 401) return new OpenAISanitizedError("AUTH_ERROR");
  return new OpenAISanitizedError("SERVER_ERROR");
}

function toSanitizedFromTts(status: number): OpenAISanitizedError {
  if (status === 429) return new OpenAISanitizedError("RATE_LIMIT", RETRY_AFTER_CAP_SEC);
  if (status === 503) return new OpenAISanitizedError("UPSTREAM_OVERLOADED", RETRY_AFTER_CAP_SEC);
  if (status === 401) return new OpenAISanitizedError("UNAUTHORIZED");
  if (status === 403) return new OpenAISanitizedError("AUTH_ERROR");
  return new OpenAISanitizedError("SERVER_ERROR");
}

async function callChat(messages: unknown[], signal?: AbortSignal, mode?: string, stream?: boolean): Promise<string> {
  try {
    const { status, json } = await postJson<ChatApiOk | ChatApiErr>("/api/chat", { messages, mode, stream: stream ?? false }, signal);
    if (status >= 200 && status < 300 && (json as ChatApiOk).ok === true) return (json as ChatApiOk).text || "";
    throw toSanitizedFromApi(status, json);
  } catch (err: unknown) {
    if (err instanceof OpenAISanitizedError) throw err;
    throw new OpenAISanitizedError("SERVER_ERROR");
  }
}

/** Stream chat response via Server-Sent Events. */
async function streamChat(messages: unknown[], signal?: AbortSignal, mode?: string): Promise<AsyncIterable<string>> {
  const token = await getAccessToken();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, mode, stream: true }),
    signal,
  });

  if (!res.ok) throw new OpenAISanitizedError("SERVER_ERROR");
  if (!res.body) throw new OpenAISanitizedError("SERVER_ERROR");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  return (async function* generate() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) yield data.chunk;
              if (data.done) return;
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  })();
}

export interface QueryResult {
  text: string;
  sources: Source[];
  imageUrl?: string;
  videoUrl?: string;
  followUps: string[];
  widget?: WidgetData;
}

const languageDetails: Record<string, { name: string; native: string; script: string }> = {
  "EN": { name: "English", native: "English", script: "Latin" },
  "HI": { name: "Hindi", native: "हिन्दी", script: "Devanagari" },
  "BN": { name: "Bengali", native: "বাংলা", script: "Bengali" },
  "TA": { name: "Tamil", native: "தமிழ்", script: "Tamil" },
  "TE": { name: "Telugu", native: "తెలుగు", script: "Telugu" },
  "MR": { name: "Marathi", native: "मराठी", script: "Devanagari" },
  "GU": { name: "Gujarati", native: "ગુજરાતી", script: "Gujarati" },
  "KN": { name: "Kannada", native: "ಕನ್ನಡ", script: "Kannada" },
  "ML": { name: "Malayalam", native: "മലയാളം", script: "Malayalam" },
  "PA": { name: "Punjabi", native: "ਪੰਜਾਬੀ", script: "Gurmukhi" },
  "OR": { name: "Odia", native: "ଓଡ଼ିଆ", script: "Odia" },
  "UR": { name: "Urdu", native: "اردو", script: "Urdu (Arabic script)" },
  "AS": { name: "Assamese", native: "অসমীয়া", script: "Assamese" },
  "SA": { name: "Sanskrit", native: "संस्कृतम्", script: "Devanagari" }
};

// OpenAI TTS: alloy, echo, fable, onyx, nova, shimmer
const languageToVoice: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  "EN": "nova", "HI": "shimmer", "BN": "nova", "TA": "shimmer", "TE": "nova", "MR": "shimmer",
  "GU": "nova", "KN": "shimmer", "ML": "nova", "PA": "shimmer", "OR": "nova", "UR": "shimmer",
  "AS": "nova", "SA": "onyx"
};

// Whisper ISO 639-1 language codes for better STT accuracy
const languageToWhisperCode: Record<string, string> = {
  "EN": "en", "HI": "hi", "BN": "bn", "TA": "ta", "TE": "te", "MR": "mr",
  "GU": "gu", "KN": "kn", "ML": "ml", "PA": "pa", "OR": "or", "UR": "ur",
  "AS": "as", "SA": "sa"
};
// OpenAI Whisper API supports a subset of ISO 639-1; unsupported codes (e.g. as, sa) must be omitted so Whisper auto-detects
const whisperApiSupported = new Set<string>(["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "ur"]);

/** Strip markdown formatting and follow-ups so TTS reads clean prose. */
function cleanTextForTTS(text: string): string {
  return text
    .replace(/```[\w]*\n?[\s\S]*?```/g, '')           // strip code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')           // [text](url) → text
    .replace(/^#+\s*/gm, '')                            // strip heading markers
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')          // strip bold/italic markers
    .replace(/^FOLLOW_UP:.*$/gm, '')                    // strip follow-ups
    .replace(/^\s*[-*]\s/gm, '')                        // strip list markers
    .replace(/`([^`]+)`/g, '$1')                        // strip inline code
    .replace(/\n{3,}/g, '\n\n')                         // collapse newlines
    .trim();
}

/** Normalize text for natural TTS: expand abbreviations, convert symbols, clean for speech. */
export function normalizeForTTS(text: string): string {
  let t = cleanTextForTTS(text);
  // Expand common abbreviations
  t = t.replace(/\bDr\./g, 'Doctor').replace(/\bMr\./g, 'Mister').replace(/\bMrs\./g, 'Missus');
  t = t.replace(/\bMs\./g, 'Miss').replace(/\bProf\./g, 'Professor').replace(/\bSt\./g, 'Saint');
  t = t.replace(/\bvs\./gi, 'versus').replace(/\betc\./gi, 'etcetera').replace(/\bi\.e\./gi, 'that is');
  t = t.replace(/\be\.g\./gi, 'for example').replace(/\bno\./gi, 'number');
  // Convert currency symbols
  t = t.replace(/₹\s?(\d)/g, '$1 rupees').replace(/\$\s?(\d)/g, '$1 dollars').replace(/€\s?(\d)/g, '$1 euros');
  t = t.replace(/£\s?(\d)/g, '$1 pounds');
  // Convert common symbols
  t = t.replace(/&/g, ' and ').replace(/%/g, ' percent ').replace(/\+/g, ' plus ').replace(/=/g, ' equals ');
  t = t.replace(/@/g, ' at ');
  // Strip URLs
  t = t.replace(/https?:\/\/\S+/g, '');
  // Strip remaining non-speech characters but keep basic punctuation, Indic scripts, and Urdu/Arabic ranges
  t = t.replace(/[^\w\s.,!?;:'"()\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u0D7F۔-]/g, ' ');
  // Collapse whitespace
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

/** Split text into TTS-friendly chunks at sentence boundaries. */
export function splitForTTS(text: string, maxLen = 300): string[] {
  if (text.length <= maxLen) return [text];
  // Split at sentence endings: . ! ? । (Hindi/Devanagari full stop)
  const sentences = text.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    // If a single sentence exceeds maxLen, split further at commas/semicolons
    if (sentence.length > maxLen) {
      const parts = sentence.split(/(?<=[,;])\s+/);
      for (const part of parts) {
        if (current.length + part.length + 1 > maxLen && current.length > 0) {
          chunks.push(current.trim());
          current = '';
        }
        current += (current ? ' ' : '') + part;
      }
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}

// BCP-47 locale codes for native SpeechRecognition (Indian locales for better accent handling)
const languageToBCP47: Record<string, string> = {
  "EN": "en-IN", "HI": "hi-IN", "BN": "bn-IN", "TA": "ta-IN", "TE": "te-IN", "MR": "mr-IN",
  "GU": "gu-IN", "KN": "kn-IN", "ML": "ml-IN", "PA": "pa-IN", "OR": "or-IN", "UR": "ur-IN",
  "AS": "as-IN", "SA": "sa-IN"
};

/** Get BCP-47 locale for native SpeechRecognition. */
export function getBCP47Locale(language: string): string {
  return languageToBCP47[language] || "en-IN";
}

/** Get native SpeechRecognition constructor if available. */
export function getNativeSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR || null;
}

/** Detect best supported audio MIME type across all browsers (Chrome, Safari, Firefox, Android, iOS). */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// OpenAI is server-side only. Client never reads OPENAI_API_KEY.
export function hasOpenAIKey(): boolean {
  return true;
}

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_CACHE_STORAGE_KEY = "inbharat_serper_cache";
const SEARCH_CACHE_MAX_ENTRIES = 100;

type SearchCacheEntry = { results: { title: string; link: string; snippet?: string }[]; sources: Source[]; ts: number };
const searchCache = new Map<string, SearchCacheEntry>();

function normalizeSearchKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function loadSearchCacheFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as [string, SearchCacheEntry][];
    const now = Date.now();
    for (const [k, v] of parsed) {
      if (now - v.ts < SEARCH_CACHE_TTL_MS && searchCache.size < SEARCH_CACHE_MAX_ENTRIES)
        searchCache.set(k, v);
    }
  } catch {
    // ignore invalid stored cache
  }
}

function saveSearchCacheToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(searchCache.entries()).slice(-SEARCH_CACHE_MAX_ENTRIES);
    localStorage.setItem(SEARCH_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota or serialization errors
  }
}

if (typeof window !== "undefined") loadSearchCacheFromStorage();

/** Clear in-memory and localStorage search cache. Call after changing search/API behaviour. */
export function clearSearchCache(): void {
  searchCache.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(SEARCH_CACHE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

async function webSearch(query: string, signal?: AbortSignal): Promise<{ results: { title: string; link: string; snippet?: string }[]; sources: Source[] }> {
  const key = normalizeSearchKey(query);
  if (!key) return { results: [], sources: [] };

  if (typeof window !== "undefined") {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS)
      return { results: cached.results, sources: cached.sources };
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const token = await getAccessToken();
    const res = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ q: query }),
      signal
    });
    const data = await res.json();
    if (res.status === 401) throw new OpenAISanitizedError("UNAUTHORIZED");
    if (!res.ok) return { results: [], sources: [] };
    const results = (data.organic || []).slice(0, 8);
    const sources: Source[] = results.map((r: any) => ({ title: r.title || "Source", uri: r.link || "" }));
    const payload = { results: results.map((r: any) => ({ title: r.title, link: r.link, snippet: r.snippet })), sources };
    if (typeof window !== "undefined" && results.length > 0) {
      searchCache.set(key, { ...payload, ts: Date.now() });
      if (searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
        const oldest = searchCache.keys().next().value;
        if (oldest) searchCache.delete(oldest);
      }
      saveSearchCacheToStorage();
    }
    return payload;
  } catch (err: unknown) {
    if (err instanceof OpenAISanitizedError) throw err;
    return { results: [], sources: [] };
  }
}

export class NexusAgent {
  /** Execute a query with optional conversation history for context. */
  async executeQuery(
    query: string,
    mode: AgentMode,
    language: string = "EN",
    imageData?: string,
    signal?: AbortSignal,
    previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<QueryResult> {
    const lang = languageDetails[language] || languageDetails["EN"];
    const qLower = query.toLowerCase();

    if (mode === AgentMode.EXECUTIVE || mode === AgentMode.STANDARD) {
      if (qLower.includes("email") || qLower.includes("write to") || qLower.includes("draft a mail"))
        return await this.handleEmailAgent(query, lang.name, signal);
      if (qLower.includes("schedule") || qLower.includes("calendar") || qLower.includes("meeting"))
        return await this.handleCalendarAgent(query, lang.name, signal);
    }

    if ((mode === AgentMode.SHOPPER || mode === AgentMode.STANDARD) && (qLower.includes("buy") || qLower.includes("price") || qLower.includes("shop for") || (qLower.includes("best") && qLower.includes("for money"))))
      return await this.handleShoppingAgent(query, lang.name, signal);

    // Greeting: return sovereign welcome without web search (no LLM call for "Hi")
    const trimmed = query.trim();
    const isGreeting = trimmed.length <= 50 && /^(hi|hello|hey|namaste|namaskar|hola|greetings?|good\s+(morning|afternoon|evening)|hiya|howdy)\.?!?\s*$/i.test(trimmed.replace(/\s+/g, " "));
    if (isGreeting)
      return this.handleGreeting(language);

    const { results: searchResults, sources } = await webSearch(query, signal);
    const searchContext = searchResults.length
      ? "\n\nRecent web search results (use to ground your answer):\n" + searchResults.map((r: any) => `[${r.title}](${r.link})\n${r.snippet || ""}`).join("\n\n")
      : "";

    const recencyKeywords = /\b(current|latest|today|recent|now|this week|this month|breaking|live|update|newest|2025|right now|as of today|recently|just announced)\b/i;
    const wantsLiveInfo = recencyKeywords.test(query);

    const researchHint = mode === AgentMode.RESEARCH
      ? "Prioritize recent, cited information. Include inline [Title](url) from the provided search results when available. Prefer recent, verifiable sources; if search results are provided, use them as the primary basis for your answer. "
      : "";
    const coderHint = mode === AgentMode.CODER
      ? "You are in Coder mode. Provide clear step-by-step instructions (numbered steps) and complete, runnable code in fenced code blocks. Specify language (e.g. python, javascript). If the request is ambiguous, ask one clarifying question or assume a minimal example. Do not invent APIs or package names; prefer standard library or well-known libraries. If you are not sure about a library or API, say so and give a minimal, safe example. End with FOLLOW_UP: lines for related coding follow-ups (e.g. Explain this, Add error handling, Port to another language). "
      : "";
    const educatorHint = mode === AgentMode.EDUCATOR
      ? "You are in Educator mode. Explain step-by-step, define terms when needed, and include a short example or analogy. Structure with clear headings. End with FOLLOW_UP: lines for practice or deeper questions. "
      : "";
    const browserHint = mode === AgentMode.BROWSER
      ? "You are in Browser mode. Prioritize current, live information. Base your answer on the search results provided; cite with [Title](url). Do not rely on training data for recent events or stats. "
      : "";
    const citationRule = searchContext
      ? "Use the search results above to ground your answer. Cite sources inline with [Title](url) where relevant. Do not invent URLs; use only the links from the search results. "
      : "";
    const liveOnlyRule = searchContext && wantsLiveInfo
      ? "The user is asking for current or recent information. Base your answer ONLY on the search results provided; do not mix in facts from your training data for dates, numbers, or recent events. "
      : "";
    const noSearchRule = !searchContext
      ? (wantsLiveInfo
          ? "The user is asking for current or live information. You do NOT have real-time web results. Do not give specific statistics, dates, or 'current' facts from your training—they may be outdated. Say clearly that you don't have live access here, and suggest enabling web search (SERPER_API_KEY in Vercel) or using Research mode for up-to-date answers. Keep your reply short and helpful. "
          : "You do not have live web results for this query. Answer from your knowledge. If the user needs real-time or verified links, briefly say they can try Research mode or ensure web search is enabled for live links. Do not claim you are incapable. ")
      : "";

    const accuracyRule = "Be precise: only state facts you can support from the context above or clearly label as general knowledge. Do not invent statistics, dates, or URLs. ";
    const visionRule = imageData
      ? "The user has provided an image. Analyze it carefully and describe relevant visual elements. If the image contains text, extract and process it. Integrate image insights with your text-based analysis. "
      : "";
    
    const systemContent = `You are InBharat Ai (Desh Ka AI), a sovereign intelligence node for Bharat. You provide accurate, culturally nuanced insights and prefer a Bharat-first lens for policy, economy, and culture. Respond ONLY in ${lang.native} (${lang.name}). Output clean Markdown.
${researchHint}${coderHint}${educatorHint}${browserHint}${citationRule}${liveOnlyRule}${noSearchRule}${accuracyRule}${visionRule}
Provide exactly 3 follow-up questions in ${lang.native} at the end, each on its own line, prefixed with FOLLOW_UP: .${searchContext}`;

    // Build message history: include previous messages for context, then add system + current query
    const messages: any[] = [
      { role: "system", content: systemContent },
      // Include previous conversation turns for context (user and assistant messages only)
      ...(previousMessages || []).slice(-10), // Keep last 10 messages for context
      // Current user query with optional image
      {
        role: "user",
        content: imageData
          ? [
              { type: "text", text: query },
              { type: "image_url", image_url: { url: imageData } }
            ]
          : query
      }
    ];

    const responseText = await callChat(messages, signal, mode);
    const followUps: string[] = [];
    const lines = responseText.split("\n");
    const mainText = lines.filter(line => {
      if (line.trim().startsWith("FOLLOW_UP:")) {
        followUps.push(line.replace(/.*FOLLOW_UP:\s*/, "").trim());
        return false;
      }
      return true;
    }).join("\n").trim();

    return { text: mainText, sources, followUps: followUps.slice(0, 3) };
  }

  /** Returns the sovereign welcome for greetings (e.g. "Hi") without search or LLM. */
  private handleGreeting(language: string): QueryResult {
    const isHindi = language === "HI";

    const welcomeEn = `**Welcome to InBharat Ai**

Namaste! I am **InBharat Ai** (Desh Ka AI), your sovereign intelligence node. I am engineered to provide accurate, deep, and culturally nuanced insights regarding Bharat and the global landscape.

As a verified node of sovereign intelligence, I am here to assist you with high-level research, policy analysis, historical context, and real-time updates through a Bharatiya lens.

**How I Can Assist You:**
- **Sovereign Insights:** Deep dives into Bharat's strategic interests, economy, and digital public infrastructure (DPI).
- **Cultural Context:** Information synthesized with an understanding of Bharat's diverse heritage and values.
- **Technical & Global Research:** Authoritative data on global trends, technology, and science.

How may I serve you today?`;

    const welcomeHi = `**InBharat Ai में आपका स्वागत है**

नमस्ते! मैं **InBharat Ai** (देश का AI), आपका सॉवरेन इंटेलिजेंस नोड हूँ। मैं भारत और वैश्विक परिदृश्य के बारे में सटीक, गहन और सांस्कृतिक रूप से सूक्ष्म जानकारी प्रदान करने के लिए तैयार हूँ।

सॉवरेन इंटेलिजेंस के एक सत्यापित नोड के रूप में, मैं भारतीय परिप्रेक्ष्य के माध्यम से उच्च-स्तरीय अनुसंधान, नीति विश्लेषण, ऐतिहासिक संदर्भ और रीयल-टाइम अपडेट में सहायता के लिए यहाँ हूँ।

**मैं आपकी कैसे मदद कर सकता हूँ:**
- **सॉवरेन इनसाइट्स:** भारत के रणनीतिक हितों, अर्थव्यवस्था और डिजिटल पब्लिक इन्फ्रास्ट्रक्चर (DPI) में गहन जानकारी।
- **सांस्कृतिक संदर्भ:** भारत की विविध विरासत और मूल्यों की समझ के साथ जानकारी।
- **तकनीकी और वैश्विक अनुसंधान:** वैश्विक रुझान, प्रौद्योगिकी और विज्ञान पर प्रामाणिक डेटा।

मैं आज आपकी कैसे सेवा कर सकता हूँ?`;

    const followUpsEn = [
      "Can you provide an overview of Bharat's current economic growth projections for the fiscal year?",
      "What are the key pillars of the 'Viksit Bharat @2047' vision?",
      "How is Bharat's Space Sector evolving following the success of the Chandrayaan missions?"
    ];

    const followUpsHi = [
      "भारत की वर्तमान आर्थिक वृद्धि अनुमानों का अवलोकन दें।",
      "'विकसित भारत @2047' विजन के मुख्य स्तंभ क्या हैं?",
      "चंद्रयान मिशन की सफलता के बाद भारत का अंतरिक्ष क्षेत्र कैसे विकसित हो रहा है?"
    ];

    const text = isHindi ? welcomeHi : welcomeEn;
    const followUps = isHindi ? followUpsHi : followUpsEn;

    return { text, sources: [], followUps };
  }

  private async handleEmailAgent(query: string, langName: string, signal?: AbortSignal): Promise<QueryResult> {
    const raw = await callChat(
      [
        { role: "system", content: `Extract email details. Return valid JSON only: { "to": "", "subject": "", "body": "", "confirmationText": "" }. Language: ${langName}.` },
        { role: "user", content: query }
      ],
      signal,
      "EXECUTIVE"
    );
    const data = JSON.parse(raw || "{}");
    return {
      text: data.confirmationText || "I've drafted that email for you.",
      sources: [],
      followUps: ["Send it now", "Modify the subject", "Add another recipient"],
      widget: { type: "EMAIL", data: { to: data.to, subject: data.subject, body: data.body } }
    };
  }

  private async handleCalendarAgent(query: string, langName: string, signal?: AbortSignal): Promise<QueryResult> {
    const raw = await callChat(
      [
        { role: "system", content: `Extract event details. Return valid JSON only: { "title", "date", "time", "duration", "participants": [], "description", "replyText" }. Language: ${langName}. If date/time missing, assume tomorrow 10am.` },
        { role: "user", content: query }
      ],
      signal,
      "EXECUTIVE"
    );
    const data = JSON.parse(raw || "{}");
    return {
      text: data.replyText || "I've set up this event.",
      sources: [],
      followUps: ["Change time", "Add participants", "Send invites"],
      widget: {
        type: "CALENDAR",
        data: {
          title: data.title,
          date: data.date,
          time: data.time,
          duration: data.duration,
          participants: data.participants || [],
          description: data.description
        }
      }
    };
  }

  private async handleShoppingAgent(query: string, langName: string, signal?: AbortSignal): Promise<QueryResult> {
    const raw = await callChat(
      [
        { role: "system", content: `Suggest 4 products for the query. Return valid JSON only: { "summary": "", "items": [ { "name", "price", "rating", "source", "imageUrl", "link" } ] }. Use placeholder imageUrl like "https://placehold.co/400x400/161b22/FFF?text=Product" if needed. Language: ${langName}.` },
        { role: "user", content: query }
      ],
      signal,
      "SHOPPER"
    );
    const data = JSON.parse(raw || "{}");
    const fixedItems = (data.items || []).map((i: any) => ({
      ...i,
      imageUrl: i.imageUrl || "https://placehold.co/400x400/161b22/FFF?text=" + encodeURIComponent(i.name || "Product")
    }));
    const disclaimer = " Suggestions based on your query. For current prices and availability, check the retailer.";
    return {
      text: (data.summary || "I found these top-rated items for you.") + disclaimer,
      sources: [],
      followUps: ["Filter by price", "Compare top two", "Check delivery"],
      widget: { type: "SHOPPING", data: fixedItems }
    };
  }

  /** Fetch a single TTS chunk as raw ArrayBuffer. */
  private async fetchTTSChunkBuffer(text: string, voice: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const token = await getAccessToken();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice }),
      signal,
    });
    if (!res.ok) throw toSanitizedFromTts(res.status);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("audio/mpeg")) throw new OpenAISanitizedError("SERVER_ERROR");
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) throw new OpenAISanitizedError("SERVER_ERROR");
    return buffer;
  }

  /** Fetch a single TTS chunk. Returns a blob URL for the audio. */
  private async fetchTTSChunk(text: string, voice: string, signal?: AbortSignal): Promise<string> {
    const buffer = await this.fetchTTSChunkBuffer(text, voice, signal);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));
  }

  /**
   * Convert text to speech. Returns an object URL for the audio blob.
   * For short text, fetches a single chunk. Caller must
   * `URL.revokeObjectURL(url)` when done.
   */
  async textToSpeech(text: string, language: string): Promise<string | undefined> {
    const voice = languageToVoice[language] || "nova";
    const input = normalizeForTTS(text).slice(0, 4096);
    if (!input) return undefined;
    return this.fetchTTSChunk(input, voice);
  }

  /**
   * Chunked TTS: splits text, fires ALL fetches in parallel for fastest throughput,
   * delivers ArrayBuffers in order. Callback is awaited to ensure sequential decode.
   * Returns an AbortController so the caller can cancel remaining fetches.
   */
  textToSpeechChunked(
    text: string,
    language: string,
    onChunkReady: (buffer: ArrayBuffer, index: number, total: number) => void | Promise<void>,
    onDone: () => void,
    onError: (err?: unknown) => void
  ): AbortController {
    const controller = new AbortController();
    const voice = languageToVoice[language] || "nova";
    const input = normalizeForTTS(text).slice(0, 4096);
    if (!input) { onError(); return controller; }
    const chunks = splitForTTS(input, 300);
    const total = chunks.length;

    // Fire ALL fetches in parallel — no waiting between requests
    const promises = chunks.map(async (chunk) => {
      try {
        return { buffer: await this.fetchTTSChunkBuffer(chunk, voice, controller.signal) };
      } catch (err) {
        return { error: err };
      }
    });

    // Deliver results strictly in order, awaiting callback for sequential decode
    (async () => {
      for (let i = 0; i < promises.length; i++) {
        if (controller.signal.aborted) return;
        const result = await promises[i];
        if (controller.signal.aborted) return;
        if (result && "buffer" in result && result.buffer) {
          await onChunkReady(result.buffer, i, total);
          continue;
        }
        onError((result as { error?: unknown })?.error);
        return;
      }
      onDone();
    })();

    return controller;
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    const langCode = language && languageToWhisperCode[language] ? languageToWhisperCode[language] : undefined;
    const supported = langCode && whisperApiSupported.has(langCode) ? langCode : undefined;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read_error"));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const idx = dataUrl.indexOf("base64,");
        resolve(idx >= 0 ? dataUrl.slice(idx + 7) : "");
      };
      reader.readAsDataURL(audioBlob);
    });
    const { status, json } = await postJson<{ ok: true; text: string } | ChatApiErr>("/api/transcribe", {
      audioBase64: base64,
      mimeType: audioBlob.type || "audio/webm",
      ...(supported ? { language: supported } : {}),
    });
    if (status >= 200 && status < 300 && (json as any).ok === true) return String((json as any).text || "").trim();
    throw toSanitizedFromApi(status, json);
  }

  async liveReply(userText: string, language: string): Promise<{ text: string; audioUrl?: string; ttsError?: OpenAISanitizedError }> {
    const lang = languageDetails[language] || languageDetails["EN"];
    const text = (await callChat([
      {
        role: "system",
        content: `You are InBharat AI. Reply in ${lang.native} only, in 1-3 short sentences. Be conversational and warm. If the user asks for real-time data or something you cannot do in voice mode, briefly say you don't have live access here and suggest using the search bar with Research mode for up-to-date information.`
      },
      { role: "user", content: userText }
    ], undefined, "STANDARD")).trim();
    try {
      const audioUrl = await this.textToSpeech(text, language);
      return { text, audioUrl };
    } catch (err: unknown) {
      if (err instanceof OpenAISanitizedError) return { text, ttsError: err };
      return { text, ttsError: new OpenAISanitizedError("SERVER_ERROR") };
    }
  }

  async fetchTrendingNews(): Promise<NewsArticle[]> {
    try {
      const content = await callChat([
        { role: "system", content: "List 6 trending news stories in India. Return a JSON array of objects with keys: title, summary, url, category. Only valid JSON, no markdown." },
        { role: "user", content: "List 6 trending news stories in India." }
      ], undefined, "RESEARCH");
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : parsed.articles || parsed.items || parsed.stories || [];
      return arr.slice(0, 6).map((a: any) => ({
        title: a.title || "",
        summary: a.summary || "",
        url: a.url || "#",
        category: a.category || "General"
      }));
    } catch {
      return [];
    }
  }
}
