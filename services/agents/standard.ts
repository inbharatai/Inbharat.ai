/**
 * StandardAgent — direct general-purpose chat.
 * Server-side: uses ToolRouter. Client-side: wraps NexusAgent.
 */

import { AgentMode } from "../../types.js";
import type { AgentInput, AgentOutput, IntentCategory } from "../../lib/orchestration/types.js";
import { BaseAgent } from "./baseAgent.js";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class StandardAgent extends BaseAgent {
  readonly name = "Standard";

  canHandle(intent: IntentCategory): boolean {
    return intent === "general";
  }

  getSystemInstructions(): string {
    return `## MODE: General Intelligence — India's AI Assistant
You are **InBharat Ai** (Desh Ka AI), a world-class AI built for Bharat.

**ANSWER QUALITY RULES:**
- Lead with the DIRECT answer in the first sentence — never bury the answer
- Factual questions: be precise with numbers, names, dates — never approximate
- Conceptual questions: give clear explanation + real-world example
- Ambiguous questions: state your interpretation, then answer it
- Never say "I don't have access to real-time data" for timeless facts
- Never hallucinate — if unsure, say so explicitly

**INDIA-FIRST CONTEXT:**
- Default examples to Indian context (₹ not $, Indian cities, Indian companies)
- Reference India-relevant regulations, platforms, services when helpful
- Use familiar references: IRCTC, UPI, Aadhaar, SEBI, NCERT, etc.

**STRUCTURE:**
- Short answers (< 3 points): plain prose, no headers
- Medium answers: 2-3 bold headers max
- Complex answers: clear sections with ## headers, bullet points for lists
- Always end with the most useful takeaway`;
  }

  shouldSearch(query: string): boolean {
    // Always search: recency / live data
    if (/\b(current|latest|today|recent|now|this week|this month|breaking|live|update|newest|2025|2026|right now|as of today|recently|just announced|news|score|weather|stock|price)\b/i.test(query)) return true;
    // Always search: person/entity lookup
    if (/\bwho\s+is\b|\bwho\s+was\b|\bwho\s+are\b/i.test(query)) return true;
    // Always search: what happened / events
    if (/\bwhat\s+happened\b|\bwhen\s+did\b|\bwhen\s+was\b/i.test(query)) return true;
    // Always search: specific factual data likely to change
    if (/\b(population|gdp|revenue|market\s*cap|headquarters|founded|ceo|chairman|president|prime\s+minister|election\s+result|inflation|interest\s+rate|budget\s+\d{4})\b/i.test(query)) return true;
    return false;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.STANDARD,
      input.language,
      input.imageData,
      input.signal,
      input.previousMessages,
    );
    return {
      text: result.text,
      sources: result.sources ?? [],
      followUps: result.followUps ?? [],
      widget: result.widget,
    };
  }
}
