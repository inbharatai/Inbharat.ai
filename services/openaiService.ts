import OpenAI from "openai";
import { AgentMode, Source, NewsArticle, WidgetData } from "../types";

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

function getOpenAIKey(): string {
  return (
    (typeof process !== "undefined" && process.env?.OPENAI_API_KEY) ||
    (typeof import.meta !== "undefined" && (import.meta as { env?: { VITE_OPENAI_API_KEY?: string } }).env?.VITE_OPENAI_API_KEY) ||
    ""
  );
}

export function hasOpenAIKey(): boolean {
  return !!getOpenAIKey();
}

function getClient(): OpenAI {
  const key = getOpenAIKey();
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add VITE_OPENAI_API_KEY to .env for the app.");
  return new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
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

async function webSearch(query: string): Promise<{ results: { title: string; link: string; snippet?: string }[]; sources: Source[] }> {
  const key = normalizeSearchKey(query);
  if (!key) return { results: [], sources: [] };

  if (typeof window !== "undefined") {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS)
      return { results: cached.results, sources: cached.sources };
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query })
    });
    const data = await res.json();
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
  } catch {
    return { results: [], sources: [] };
  }
}

export class NexusAgent {
  async executeQuery(
    query: string,
    mode: AgentMode,
    language: string = "EN",
    imageData?: string
  ): Promise<QueryResult> {
    const openai = getClient();
    const lang = languageDetails[language] || languageDetails["EN"];
    const qLower = query.toLowerCase();

    if (mode === AgentMode.EXECUTIVE || mode === AgentMode.STANDARD) {
      if (qLower.includes("email") || qLower.includes("write to") || qLower.includes("draft a mail"))
        return this.handleEmailAgent(openai, query, lang.name);
      if (qLower.includes("schedule") || qLower.includes("calendar") || qLower.includes("meeting"))
        return this.handleCalendarAgent(openai, query, lang.name);
    }

    if ((mode === AgentMode.CREATIVE || mode === AgentMode.STANDARD) && (qLower.includes("presentation") || qLower.includes("slides") || qLower.includes("pptx") || qLower.includes("deck")))
      return this.handlePresentationAgent(openai, query, lang.name);

    if ((mode === AgentMode.SHOPPER || mode === AgentMode.STANDARD) && (qLower.includes("buy") || qLower.includes("price") || qLower.includes("shop for") || (qLower.includes("best") && qLower.includes("for money"))))
      return this.handleShoppingAgent(openai, query, lang.name);

    const imageKeywords = ["draw", "generate image", "create a picture", "paint", "show me a photo of"];
    if ((mode === AgentMode.CREATIVE || mode === AgentMode.STANDARD) && imageKeywords.some(k => qLower.includes(k)) && !imageData)
      return this.handleImageGen(openai, query);

    const videoKeywords = ["generate video", "create video", "make a video", "animate"];
    if (mode === AgentMode.CREATIVE && videoKeywords.some(k => qLower.includes(k)))
      return this.handleVideoFallback();

    // Greeting: return sovereign welcome without web search (no LLM call for "Hi")
    const trimmed = query.trim();
    const isGreeting = trimmed.length <= 50 && /^(hi|hello|hey|namaste|namaskar|hola|greetings?|good\s+(morning|afternoon|evening)|hiya|howdy)\.?!?\s*$/i.test(trimmed.replace(/\s+/g, " "));
    if (isGreeting)
      return this.handleGreeting(language);

    const { results: searchResults, sources } = await webSearch(query);
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
    const systemContent = `You are InBharat Ai (Desh Ka AI), a sovereign intelligence node for Bharat. You provide accurate, culturally nuanced insights and prefer a Bharat-first lens for policy, economy, and culture. Respond ONLY in ${lang.native} (${lang.name}). Output clean Markdown.
${researchHint}${coderHint}${educatorHint}${browserHint}${citationRule}${liveOnlyRule}${noSearchRule}${accuracyRule}
Provide exactly 3 follow-up questions in ${lang.native} at the end, each on its own line, prefixed with FOLLOW_UP: .${searchContext}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: imageData ? [
        { type: "text", text: query },
        { type: "image_url", image_url: { url: imageData } }
      ] : query }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "text" }
    });

    const responseText = completion.choices[0]?.message?.content || "";
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

  private async handleEmailAgent(openai: OpenAI, query: string, langName: string): Promise<QueryResult> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Extract email details. Return valid JSON only: { "to": "", "subject": "", "body": "", "confirmationText": "" }. Language: ${langName}.` },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return {
      text: data.confirmationText || "I've drafted that email for you.",
      sources: [],
      followUps: ["Send it now", "Modify the subject", "Add another recipient"],
      widget: { type: "EMAIL", data: { to: data.to, subject: data.subject, body: data.body } }
    };
  }

  private async handleCalendarAgent(openai: OpenAI, query: string, langName: string): Promise<QueryResult> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Extract event details. Return valid JSON only: { "title", "date", "time", "duration", "participants": [], "description", "replyText" }. Language: ${langName}. If date/time missing, assume tomorrow 10am.` },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(completion.choices[0]?.message?.content || "{}");
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

  private async handlePresentationAgent(openai: OpenAI, query: string, langName: string): Promise<QueryResult> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Create a 4-slide presentation outline. Return valid JSON only: { "topic", "introText", "slides": [ { "title", "content": [] } ] }. Language: ${langName}.` },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return {
      text: data.introText || "Here is the presentation outline generated.",
      sources: [],
      followUps: ["Add a slide", "Export to PDF", "Change theme"],
      widget: { type: "PPTX", data: { topic: data.topic, slides: data.slides || [] } }
    };
  }

  private async handleShoppingAgent(openai: OpenAI, query: string, langName: string): Promise<QueryResult> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Suggest 4 products for the query. Return valid JSON only: { "summary": "", "items": [ { "name", "price", "rating", "source", "imageUrl", "link" } ] }. Use placeholder imageUrl like "https://placehold.co/400x400/161b22/FFF?text=Product" if needed. Language: ${langName}.` },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(completion.choices[0]?.message?.content || "{}");
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

  private async handleImageGen(openai: OpenAI, query: string): Promise<QueryResult> {
    const res = await openai.images.generate({
      model: "dall-e-3",
      prompt: query,
      n: 1,
      size: "1792x1024",
      response_format: "b64_json",
      quality: "standard"
    });
    const b64 = res.data?.[0]?.b64_json;
    if (b64) {
      return {
        text: "Visual synthesis complete.",
        sources: [],
        followUps: ["Make it brighter", "Change style"],
        imageUrl: `data:image/png;base64,${b64}`
      };
    }
    return { text: "Image generation failed.", sources: [], followUps: [] };
  }

  private handleVideoFallback(): Promise<QueryResult> {
    return Promise.resolve({
      text: "Video generation is not available in this version. Try **image generation** instead (e.g. “Draw a sunset over the ocean”).",
      sources: [],
      followUps: ["Generate an image instead", "Tell me about video AI"]
    });
  }

  /** Indian-voice instruction for InBharat TTS (used with gpt-4o-mini-tts which supports accent control). */
  private static readonly TTS_INDIAN_VOICE_INSTRUCTIONS =
    "Speak with a clear, warm Indian English accent. Sound natural and conversational for listeners in India.";

  async textToSpeech(text: string, language: string): Promise<string | undefined> {
    const openai = getClient();
    const voice = languageToVoice[language] || "nova";
    const input = text.slice(0, 4096);
    try {
      const response = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice,
        input,
        instructions: NexusAgent.TTS_INDIAN_VOICE_INSTRUCTIONS
      });
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    } catch {
      try {
        const response = await openai.audio.speech.create({
          model: "tts-1-hd",
          voice,
          input
        });
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      } catch {
        return undefined;
      }
    }
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    const openai = getClient();
    const file = new File([audioBlob], "audio.webm", { type: audioBlob.type || "audio/webm" });
    const langCode = language && languageToWhisperCode[language] ? languageToWhisperCode[language] : undefined;
    const supported = langCode && whisperApiSupported.has(langCode) ? langCode : undefined;
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      ...(supported && { language: supported })
    });
    return transcription.text?.trim() || "";
  }

  async liveReply(userText: string, language: string): Promise<{ text: string; audioBase64?: string }> {
    const openai = getClient();
    const lang = languageDetails[language] || languageDetails["EN"];
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are InBharat AI. Reply in ${lang.native} only, in 1-3 short sentences. Be conversational and warm. If the user asks for real-time data or something you cannot do in voice mode, briefly say you don't have live access here and suggest using the search bar with Research mode for up-to-date information.`
        },
        { role: "user", content: userText }
      ],
      max_tokens: 220
    });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    const audioBase64 = await this.textToSpeech(text, language);
    return { text, audioBase64 };
  }

  async fetchTrendingNews(): Promise<NewsArticle[]> {
    const openai = getClient();
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "List 6 trending news stories in India. Return a JSON array of objects with keys: title, summary, url, category. Only valid JSON, no markdown." },
          { role: "user", content: "List 6 trending news stories in India." }
        ],
        response_format: { type: "json_object" }
      });
      const content = completion.choices[0]?.message?.content || "{}";
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
