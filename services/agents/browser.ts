/**
 * BrowserAgent — live web search, page reading, extraction.
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

export class BrowserAgent extends BaseAgent {
  readonly name = "Browser";

  canHandle(intent: IntentCategory): boolean {
    return intent === "browser";
  }

  getSystemInstructions(): string {
    return `## MODE: Live Web Browser
- Base answer EXCLUSIVELY on provided search results
- Do NOT mix in training data for current events, stats, scores
- Timestamp information when available
- If results insufficient, say so explicitly`;
  }

  shouldSearch(_query: string): boolean { return true; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.BROWSER,
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
