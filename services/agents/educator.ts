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
    return `## MODE: Expert Educator
- Start with clear, accessible overview before details
- Use real-world analogies and examples
- Build progressively: intuition \u2192 fundamentals \u2192 nuances
- Define technical terms the first time they appear
- Include practical example or exercise`;
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
