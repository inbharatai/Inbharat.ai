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
    return `## MODE: General Intelligence
- Provide clear, comprehensive responses with good structure
- Balance depth with readability
- Use appropriate formatting: headers, lists, bold for emphasis`;
  }

  shouldSearch(query: string): boolean {
    if (/\b(current|latest|today|recent|now|this week|this month|breaking|live|update|newest|2025|2026|right now|as of today|recently|just announced|who is|what happened|news|score|weather|stock|price)\b/i.test(query)) return true;
    if (/\b(what|who|when|where|how much|how many)\b.*\b(is|are|was|were|did|does|do)\b/i.test(query) && query.length > 20) return true;
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
