/**
 * ShopperAgent — product search, comparison, recommendations.
 * Server-side: uses ToolRouter. Client-side: wraps NexusAgent.
 */

import { AgentMode } from "../../types";
import type { AgentInput, AgentOutput, IntentCategory } from "../../lib/orchestration/types";
import { BaseAgent } from "./baseAgent";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class ShopperAgent extends BaseAgent {
  readonly name = "Shopper";

  canHandle(intent: IntentCategory): boolean {
    return intent === "shopping";
  }

  getSystemInstructions(): string {
    return `## MODE: Shopping Advisor
- Compare products with clear pros/cons
- Include prices, ratings, specs in tables when possible
- Highlight best-value AND premium options
- Note buying considerations (warranty, compatibility)`;
  }

  shouldSearch(_query: string): boolean { return true; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.SHOPPER,
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
