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
  // NOTE: "Embeddings — what they actually do and when you don't need them" was
  // retired because it shipped as the article of the same title (slug
  // embeddings-what-they-actually-do-and-when-you-dont-need-them). Leaving it
  // here tripped the slug-collision guard in scripts/test-growth.ts and the
  // morning picker would skip it every day anyway — so it is removed.
  // NOTE: "Fine-tuning vs RAG — when to use each" was retired from here because
  // the article already shipped as "Fine-Tuning vs. RAG: When to Use Each for
  // Your Indian AI Product" (slug fine-tuning-vs-rag-when-to-use-each-for-your-
  // indian-ai-produ). The calendar slug differed from the published slug, so the
  // picker kept re-suggesting it every morning and the agent (correctly) refused
  // to re-write a duplicate → zero drafts. pickNextCalendarTopic now also skips a
  // topic when a published slug is a longer version of it (prefix-superset guard).
  // NOTE: "Evals for AI features — measuring what actually ships" was retired
  // because it shipped as the article of the same title
  // (slug evals-for-ai-features-measuring-what-actually-ships). With it now in
  // articles.meta.ts the slug-collision guard trips in scripts/test-growth.ts, and
  // pickNextCalendarTopic would skip it every morning anyway — so it is removed.
  // NOTE: "Streaming LLM responses — UX and cost trade-offs" was retired because
  // it shipped as "Streaming LLM Responses: The UX Illusion and Real-World Costs
  // for Indian AI" (slug streaming-llm-responses-ux-and-cost-trade-offs). Now that
  // the slug is in articles.meta.ts the slug-collision guard trips in
  // scripts/test-growth.ts, and pickNextCalendarTopic would skip it every morning
  // anyway — so it is removed.
  // NOTE: "Token economics — pricing an AI feature without losing money" was
  // retired because it shipped as the article of the same title
  // (slug token-economics-pricing-an-ai-feature-without-losing-money). Now that
  // the slug is in articles.meta.ts the slug-collision guard trips in
  // scripts/test-growth.ts, and pickNextCalendarTopic would skip it every morning
  // anyway — so it is removed.
  // NOTE: "Model routing and cost control across Gemini tiers" was retired because
  // it shipped as the article of the same title
  // (slug model-routing-and-cost-control-across-gemini-tiers). Now that the slug is
  // in articles.meta.ts the slug-collision guard trips in scripts/test-growth.ts,
  // and pickNextCalendarTopic would skip it every morning anyway — so it is removed.
  // NOTE: "Context engineering — managing what the model actually sees" was
  // retired because it shipped as the article "Context Engineering: Beyond
  // Prompts for Real-World AI in India" (slug context-engineering-managing--
  // what-the-model-actually-sees). Now that the slug is in articles.meta.ts the
  // slug-collision guard trips in scripts/test-growth.ts, and
  // pickNextCalendarTopic skips it every morning anyway — so it is removed.
  // Replenished 2026-07-08 with a distinct, non-colliding topic so the calendar
  // keeps ≥17 live entries and the morning cadence never stalls into free-plan.
  // NOTE: "Multilingual LLM apps — beyond English-only prompts" was auto-retired by publishArticle because it
  // shipped as the article of slug multilingual-llm-apps-beyond-english-only-prompts ("Building Multilingual LLM Apps for Bharat: Beyond English-Only Prompts"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
  // Replenished 2026-07-13 for the retired "Multilingual LLM apps" slot above:
  // a distinct, non-colliding topic so the calendar stays ≥17 live entries and
  // the morning cadence never stalls into free-plan. On-brand — InBharat is
  // voice-first by design, and no published article or calendar entry covers
  // voice UX yet.
  // NOTE: "Voice-first AI — designing for ears before screens" was auto-retired by publishArticle because it
  // shipped as the article of slug voice-first-ai-designing-for-ears-before-screens ("Voice-First AI: Why We Design for Ears Before Screens in Bharat"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
  // Replenished 2026-07-20 for the retired "Voice-first AI" slot above: a
  // distinct, non-colliding topic so the calendar stays ≥17 live entries and
  // the morning cadence never stalls into free-plan. Foundational and on-brand
  // — no published article or calendar entry covers embeddings directly yet
  // (the RAG article uses them but never explains them), and the angle steers
  // the writer past the common over-engineering trap of reaching for vectors
  // before keyword/FTS search is exhausted.
  {
    topic: "Vector databases — choosing one for an Indian team",
    category: "AI Foundations",
    angle: "pgvector vs dedicated stores; when the Postgres you already have is enough.",
  },
  // NOTE: "Agentic memory — giving an agent durable context" was retired because
  // it duplicates the more concrete "AI agent memory — durable context across
  // sessions" entry below (line ~131), which is grounded in what we actually
  // built (retrieval before drafting, cross-source dedupe, FTS+token vs
  // embeddings). Two near-identical topics meant the founder could be served
  // either angle on different mornings for the same article. Replaced with a
  // distinct, non-overlapping topic to keep the calendar slot useful.
  {
    topic: "Agent observability — logging decisions, not just outputs",
    category: "AI Foundations",
    angle: "What to record per turn (tool calls, reasons, spend, failures) so a shipped agent is debuggable and auditable.",
  },
  // NOTE: "MCP servers in plain English" was auto-retired by publishArticle because it
  // shipped as the article of slug mcp-servers-in-plain-english ("Model Context Protocol (MCP) Servers: Why Your AI Needs a Standard 'Language'"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
  // Replenished 2026-07-29 for the retired "MCP servers in plain English" slot
  // above: a distinct, non-colliding topic so the calendar stays ≥17 live entries
  // and the morning cadence never stalls into free-plan. On-brand — InBharat
  // ships JAK Shield, so a founder-voice piece on attacking your own AI feature
  // before users do is timely, and no published article or calendar entry covers
  // red-teaming yet. Slug verified unique vs all calendar + published slugs and
  // not a prefix/superset of any published slug.
  // NOTE: "Red-teaming your AI feature before it ships" was auto-retired by publishArticle because it
  // shipped as the article of slug red-teaming-your-ai-feature-before-it-ships ("Red-Teaming Your AI Feature: Cheap Tests Before You Ship"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
  // NOTE: "Prompt chaining vs a single mega-prompt" was auto-retired by publishArticle because it
  // shipped as the article of slug prompt-chaining-vs-a-single-mega-prompt ("Prompt Chaining vs. Mega-Prompts: When to Decompose for Robust AI in India"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
  {
    topic: "Function-calling patterns that don't break",
    category: "AI Tools",
    angle: "Schema discipline, malformed-call recovery, and bounded loops — lessons from the Growth Agent.",
  },
  // NOTE: "Local-first AI — running models on your own laptop" was auto-retired by publishArticle because it
  // shipped as the article of slug local-first-ai-running-models-on-your-own-laptop ("Local-First AI: Why Running Models on Your Own Laptop Matters for India"). Now that the slug is
  // in articles.meta.ts the slug-collision guard in scripts/test-growth.ts
  // would trip, and pickNextCalendarTopic skips it every morning anyway — so
  // it is removed. (Replenish this slot with a distinct, non-colliding topic
  // to keep the calendar ≥17 live entries.)
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
  {
    topic: "AI agent memory — durable context across sessions",
    category: "Engineering",
    angle: "Retrieval before drafting, cross-source dedupe, learning signals; when FTS+token beats embeddings.",
  },
  // Replenished 2026-07-07 after "Model routing and cost control across Gemini
  // tiers" shipped (retired above). The calendar keeps ≥17 live topics so the
  // morning cadence never stalls into free-plan; this slot replaces the retired
  // one with a distinct, non-colliding angle. Directly relevant — the 2026-07-07
  // morning run failed on a JSON-stub from the model, so a founder-voice piece on
  // reliable structured output is on-brand and timely.
  {
    topic: "Structured outputs — making LLM JSON reliable",
    category: "Engineering",
    angle: "responseMimeType=application/json, schema/key-drift tolerance, one-shot retry on stubs, truncation vs missing-fields — what actually works in production.",
  },
  {
    topic: "Rate limiting and quota design for an AI API",
    category: "Engineering",
    angle: "Per-user vs per-key limits, burst handling, and what to return when a user hits the ceiling.",
  },
  {
    topic: "Handling personal data in AI pipelines under India's DPDP Act",
    category: "Security",
    angle: "What counts as personal data in prompts and logs, retention, and practical redaction before a model call.",
  },
  {
    topic: "Testing AI features in CI without burning tokens",
    category: "DevOps",
    angle: "Golden fixtures, recorded responses, and which checks genuinely need a live model call.",
  },
  {
    topic: "Batch inference — cutting cost on bulk AI jobs",
    category: "Engineering",
    angle: "Queueing, chunk sizing, and when an overnight batch beats real-time inference on price.",
  },
  {
    topic: "Speech-to-text for Indian accents and code-mixed speech",
    category: "AI Foundations",
    angle: "Why English-trained models slip on Hinglish, and how to evaluate a vendor on your own audio.",
  },
];
