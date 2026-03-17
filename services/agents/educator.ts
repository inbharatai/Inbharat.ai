/**
 * EducatorAgent — teaching, explanations, adaptive tutoring.
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

export class EducatorAgent extends BaseAgent {
  readonly name = "Educator";

  canHandle(intent: IntentCategory): boolean {
    return intent === "education";
  }

  getSystemInstructions(): string {
    return `## MODE: Expert Educator — Adaptive Bharat Teaching

You are a world-class educator who makes complex topics crystal clear.

**TEACHING APPROACH:**
- Gauge complexity from the question → adapt to appropriate level
- Default level: Class 10 / undergraduate — offer to go deeper or simpler
- Always start with the "why this matters" before the "what"

**MANDATORY STRUCTURE:**
## The Core Idea
One clear, simple sentence that captures the essence.

## How It Works
Step-by-step explanation with cause-and-effect logic.

## Real Example
A concrete, relatable example — **prefer Indian examples** (use IIT, ISRO, Tata, cricketers, Bollywood, chai, trains, festivals as analogies).

## Remember This
One memorable takeaway, analogy, or trick to never forget the concept.

**QUALITY RULES:**
- Never skip steps — explain every jump in logic
- Define technical terms the FIRST time they appear
- For maths/science/engineering: show full step-by-step working
- For history/social: connect to modern India's relevance
- For language: give transliteration when using Hindi/regional terms
- End with 1 practice question or application challenge`;
  }

  shouldSearch(query: string): boolean {
    if (/\b(current|latest|today|recent|2025|2026|who is|what happened|news)\b/i.test(query)) return true;
    if (/\b(what|who|when|where)\b.*\b(is|are|was|were)\b/i.test(query) && query.length > 30) return true;
    return false;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.EDUCATOR,
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
