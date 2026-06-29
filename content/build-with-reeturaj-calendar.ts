/**
 * "Build with Reeturaj" — founder-editable content calendar.
 *
 * The daily 8am morning cron (api/growth/cron/morning.ts) picks the NEXT unbuilt
 * topic from this list: the first entry whose slug (slugifyTitle(topic)) is not
 * already published (in content/articles.meta.ts) and not already a pending
 * 'article' draft. When every entry here is built/drafted, the cron falls back to
 * letting the agent free-plan a fresh topic via web_search (so the cadence never
 * stalls). The founder steers the series by editing this file — add, reorder, or
 * retire topics; no DB, no migration.
 *
 * Keep topics concrete + practical (founder-voice, hype-free, Indian-engineering
 * context). `angle` is optional guidance for the writer; `category` must be one
 * of ARTICLE_CATEGORIES. Do NOT duplicate a topic that slugifies to an existing
 * published slug — scripts/test-growth.ts asserts no collision.
 */
import type { ArticleCategory } from "./articles.meta.js";

export interface CalendarTopic {
  topic: string;
  category: ArticleCategory;
  angle?: string;
}

export const BUILD_WITH_REETURAJ_CALENDAR: CalendarTopic[] = [
  {
    topic: "Fine-tuning vs RAG — when to use each",
    category: "AI Foundations",
    angle: "Decision framework: data volume, how often it changes, latency + cost, eval quality. Default to RAG; fine-tune only when style/latency demand it.",
  },
  {
    topic: "Evals for AI features — measuring what actually ships",
    category: "AI Foundations",
    angle: "Golden set + regression evals before every deploy; why 'it looks fine to me' is not an eval.",
  },
  {
    topic: "Model routing and cost control across Gemini tiers",
    category: "AI Foundations",
    angle: "Route by task difficulty, cache aggressively, fail closed on budget — a routing table you can copy.",
  },
  {
    topic: "Context engineering — managing what the model actually sees",
    category: "AI Foundations",
    angle: "Beyond prompt engineering: selecting, ordering, and truncating context windows for real apps.",
  },
  {
    topic: "Vector databases — choosing one for an Indian team",
    category: "AI Foundations",
    angle: "pgvector vs dedicated stores; when the Postgres you already have is enough.",
  },
  {
    topic: "Agentic memory — giving an agent durable context",
    category: "AI Foundations",
    angle: "Thread memory, summaries, and external stores; what to persist vs recompute.",
  },
  {
    topic: "MCP servers in plain English",
    category: "AI Tools",
    angle: "What the Model Context Protocol is, why it matters, and a minimal server you can run.",
  },
  {
    topic: "Prompt chaining vs a single mega-prompt",
    category: "AI Tools",
    angle: "When to decompose; reliability and cost tradeoffs with real examples.",
  },
  {
    topic: "Function-calling patterns that don't break",
    category: "AI Tools",
    angle: "Schema discipline, malformed-call recovery, and bounded loops — lessons from the Growth Agent.",
  },
  {
    topic: "Local-first AI — running models on your own laptop",
    category: "AI Tools",
    angle: "Whisper + MMS for Indic voice; Ollama for text; what 'offline' buys you in India.",
  },
  {
    topic: "Observability for LLM apps — tracing, tokens, latency",
    category: "Engineering",
    angle: "What to log per call; surfacing cost + p95 latency; catching silent failures.",
  },
  {
    topic: "Deploying AI apps to Vercel and Railway",
    category: "Engineering",
    angle: "Split front-end (Vercel) from worker/long-run (Railway); cron + env + secrets done right.",
  },
  {
    topic: "AI feature flags and gradual rollouts",
    category: "Engineering",
    angle: "Ship a model change to 5% first; kill-switch patterns and cohort evals.",
  },
  {
    topic: "Caching LLM responses — where, what, how long",
    category: "Engineering",
    angle: "Semantic vs exact cache; invalidation; when caching hurts more than it helps.",
  },
  {
    topic: "From PoC to production AI — the gaps nobody warns you about",
    category: "Engineering",
    angle: "Latency tails, cost spikes, prompt injection, the cold-start eval gap.",
  },
  {
    topic: "Guardrails — keeping AI output on-brand and safe",
    category: "Security",
    angle: "Redaction before every model call, banned-term enforcement, and human-gated publish.",
  },
  {
    topic: "Prompt injection and what it means for your app",
    category: "Security",
    angle: "Untrusted text inside model context; defense layers that actually help.",
  },
  {
    topic: "Build with Reeturaj — what this series is and how to follow",
    category: "InBharat",
    angle: "A orientation post: who this is for, what we cover, the cadence, and where to ask questions.",
  },
];